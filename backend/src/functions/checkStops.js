const { app } = require('@azure/functions');
const { readJson, writeJson } = require('../storage/blob');
const { zaalDag } = require('../schedule/schedule');
const { getTournament, getTodaysTournaments } = require('../cuescore');
const { enqueue, competitieSchermCommando } = require('../agent/commandQueue');
const { stopReden, toernooiKlaar } = require('../planning/stop');
const { kiesToernooiVoorTafel, anderToernooiNogOpTafel } = require('../planning/koppel');
const { vrijTeMaken } = require('../planning/vrijmaken');
const { inactiviteitsCheck } = require('../planning/inactiviteit');
const { challengeMoetStoppen } = require('../planning/challengeLimiet');
const { competitieStopBesluit, moetCompetitieChecken } = require('../planning/competitieStop');
const { toernooiVoorNiveau } = require('../mokumCompetitie/toernooien');
const { zoekCompetitieWedstrijd, heeftTeams } = require('../mokumCompetitie/zoekWedstrijd');
const { moetOpnieuwStarten, moetAlarmeren, MAX_POGINGEN } = require('../planning/herstart');
const { bouwStreamFalenAlert } = require('../notify/alertBericht');
const { stuurAlert } = require('../notify/verzenden');
const { isArmed, isInactiviteitsStopAan, isChallengeLimietAan, competitieWachtMs } = require('../config/automation');

// Timer-Function: bewaakt lopende broadcasts en stopt ze automatisch wanneer het
// toernooi klaar is (Cuescore `Finished`), de league-avond op die tafel voorbij is,
// of een handmatige stoptijd is bereikt. Zet dan een stopStream-commando klaar en
// markeert de entry als gestopt (idempotent). Zie wiki/gaps.md #2/#16.
//
// Podium-grace (#54/#57): zodra een enkeldaags toernooi klaar is, stempelen we het
// moment (finaleKlaarSinds) op de entry en stoppen we pas STOP_GRACE_MS later — zo
// blijft het medaillescherm eerst in beeld. Daarom draait deze check elke minuut
// (niet elke 5), zodat die tijd ook echt klopt.
//
// Ad-hoc koppeling (#69): een handmatig gestarte stream heeft geen tournamentId en
// viel daardoor buiten de hele automatisering. We proberen 'm hier alsnog aan het
// Cuescore-toernooi op die tafel te koppelen; daarna loopt de normale keten
// (podium-grace → stop → finalize met thumbnail + hoofdstukken) gewoon door.
//
// Inactiviteits-vangnet (#100, #105) — STAAT SINDS 17-09 STANDAARD UIT (#134).
// Het ving twee situaties op waarin de normale toernooi-logica een uitzending nooit
// vanzelf laat stoppen: een stream die niet aan een toernooi te koppelen was, en een
// stream waarvan het gekoppelde toernooi bij Cuescore leeg terugkomt. Beide vielen terug
// op `inactiviteitsCheck()`: al een uur geen wedstrijd op deze tafel? Dan stoppen.
//
// Waarom het uit staat: die check leest `venueTables` (Cuescore). Een stream zonder
// koppeling staat daar NOOIT als 'playing' in, ook niet terwijl er gespeeld wordt — dus
// kapte de regel lopende wedstrijden af (#121 op 08-09, tafel 15 én 16 op 16-09, #130).
// Aanzetten kan zonder deploy met app-setting INACTIVITEIT_STOP=true.
//
// Challenge-tijdslimiet — STAAT SINDS 17-09 OOK STANDAARD UIT (#134).
// Was 2 uur (besluit 18-08), daarna 3 uur (10-09): een challenge-stream stopte hoe dan
// ook na die tijd, ook midden in de partij. Aanzetten met CHALLENGE_LIMIET=true. Zie
// `planning/challengeLimiet.js`.
//
// Wat het vangnet nu is voor allebei: de nachtstop van 02:00 (`functions/nachtStop.js`),
// die ALLES stopt wat nog open staat — ook ad-hoc — en niet van Cuescore afhangt. Plus de
// eigen eindtijd uit de planner (stopOverride). Een vergeten stream loopt dus tot uiterlijk
// 02:00 in plaats van eindeloos; dat is de bewuste ruil (zie #134).
//
// Herstart-vangnet (#114, 26-08): een vers aangemaakte YouTube-broadcast bleek in een
// gecontroleerde test soms een korte tijd nodig te hebben vóór 'ie echt data accepteert —
// de allereerste StartStream-poging (vlak na createBroadcasts) kan daardoor stil
// mislukken, zonder dat de agent een fout meldt. Deze check herkent een tafel die allang
// had moeten zenden maar dat volgens de agent-status niet doet, en stuurt automatisch
// (begrensd, met tussenpozen) een vers startStream-commando. Zie `planning/herstart.js`.

const CRON_ELKE_MIN = '0 * * * * *';
// Hoelang het medaillescherm in beeld blijft vóór we sluiten. Ruim genoeg dat de
// keten (liveMatches → pauzescherm → overlay) 'm echt op de uitzending krijgt.
// Instelbaar via app-setting PODIUM_GRACE_SEC.
const STOP_GRACE_MS = (Number(process.env.PODIUM_GRACE_SEC) || 180) * 1000;
// Wachttijd tussen "competitiewedstrijd klaar" en stoppen (#145, besluit 17-09: 5 minuten).
// Staat in config/automation.js omdat /api/live er ook het stoptijdstip uit haalt (#147).
const COMPETITIE_WACHT_MS = competitieWachtMs();

async function verwerk(now, context) {
  if (!isArmed()) {
    context.log('[checkStops] AUTOMATION_ARMED != true → slapend; geen automatische stops.');
    return;
  }
  // Een avondstream zit ná middernacht nog in de store van gisteren → check beide dagen
  // (net als nachtStop). Anders wordt zo'n stream na 0:00 niet meer gestopt/gefinaliseerd
  // en blijft de podium-grace uit (incident 21-07).
  const gisteren = new Date(now.getTime() - 24 * 3600 * 1000);
  const dagen = [now, gisteren]
    .map((ref) => ({ pad: `broadcasts/${zaalDag(ref)}.json`, ref }))
    .filter((d, i, arr) => arr.findIndex((x) => x.pad === d.pad) === i);
  const planning = (await readJson('planning.json', [])) || [];
  const recById = new Map(planning.map((r) => [String(r.tournamentId), r]));
  // Voor het inactiviteits-vangnet (#100, #105): dezelfde tafelbrede blik die het
  // dashboard en het pauzescherm al gebruiken, niet gebonden aan één toernooi-ID.
  const liveMatches = await readJson('live-matches.json', null);
  const venueTables = (liveMatches && liveMatches.venueTables) || [];
  // Voor het herstart-vangnet (#114): meldt de agent deze tafel als daadwerkelijk
  // zendend? Zie moetOpnieuwStarten() hieronder.
  const status = await readJson('status.json', null);
  const streamtTafel = new Map(
    ((status && status.tables) || []).map((t) => [Number(t.tableNumber), !!t.streaming])
  );

  const teStoppen = [];
  const teHerstarten = [];
  // Tafels waar het competitiescherm (#147) aan moet: de teamwedstrijd is net klaar.
  const competitieSchermAan = [];
  const teAlarmeren = [];
  const cache = new Map();

  // Toernooien van een zaal-dag: lazy ophalen (alleen als een ad-hoc/gekoppelde stream
  // ze nodig heeft) en cachen per dag. Een avondstream die ná 0:00 nog loopt hoort bij
  // de dag van GISTEREN — daarom per broadcast-dag, niet altijd "vandaag".
  const dagCache = new Map();
  async function toernooienVanDag(ref) {
    const sleutel = zaalDag(ref);
    if (!dagCache.has(sleutel)) {
      try {
        dagCache.set(sleutel, await getTodaysTournaments({ now: ref }));
      } catch (e) {
        context.warn(`[checkStops] toernooien van ${sleutel} ophalen mislukt: ${e.message}`);
        dagCache.set(sleutel, null);
      }
    }
    return dagCache.get(sleutel);
  }

  for (const { pad, ref } of dagen) {
    const store = (await readJson(pad, {})) || {};
    let storeGewijzigd = false;

    for (const key of Object.keys(store)) {
      let entry = store[key];
      if (!entry || entry.stopped) continue;

      // Herstart-vangnet (#114): de broadcast is aangemaakt en het startStream-commando
      // is verstuurd, maar de agent meldt nog altijd geen data — terwijl de geplande start
      // al een tijdje voorbij is. Gecontroleerde test op 26-08 wees uit dat een vers
      // gebonden YouTube-broadcast soms een korte tijd nodig heeft vóór 'ie echt gaat
      // zenden: een tweede, latere poging (zonder enige menselijke tussenkomst) lukte
      // toen gewoon. `continue` erna: de rest van deze ronde (koppelen/stoppen) heeft
      // nog niets te doen zolang er niet eens wordt gezonden.
      if (moetOpnieuwStarten(entry, streamtTafel.get(Number(entry.tableNumber)), now.getTime())) {
        const pogingen = (Number(entry.startPogingen) || 0) + 1;
        context.warn(`[checkStops] tafel ${entry.tableNumber}: nog geen data van de agent sinds de geplande start → opnieuw starten (poging ${pogingen}/${MAX_POGINGEN})`);
        teHerstarten.push(entry.tableNumber);
        store[key] = { ...entry, startPogingen: pogingen, laatsteStartPoging: now.toISOString() };
        storeGewijzigd = true;
        continue;
      }

      // Alarm-vangnet (12-09-incident): alle herstart-pogingen zijn op en er wordt nog
      // steeds niets ontvangen — waarschijnlijk iets dat de automatisering niet zelf kan
      // oplossen (op 12-09 een vastgelopen OBS-pc). Eenmalig alarmeren (mail + ntfy),
      // niet elke minuut opnieuw — vandaar `alertVerstuurd` op de entry.
      if (moetAlarmeren(entry, streamtTafel.get(Number(entry.tableNumber)), now.getTime())) {
        teAlarmeren.push({
          tableNumber: entry.tableNumber,
          tournamentName: entry.tournamentName,
          videoId: entry.videoId,
          pogingen: Number(entry.startPogingen) || 0,
        });
        store[key] = { ...entry, alertVerstuurd: true };
        storeGewijzigd = true;
        continue;
      }

      // Handmatig gestart zonder toernooi? Probeer alsnog te koppelen (#69). Lukt dat
      // niet (niets gevonden of te onzeker), dan blijft de stream handmatig.
      if (entry.adhoc || entry.tournamentId == null) {
        // Een COMPETITIEWEDSTRIJD (#120): niet koppelen aan een toernooi, en geen
        // inactiviteitsstop, ook niet als INACTIVITEIT_STOP aan staat. Een teamwedstrijd heeft
        // geen Cuescore-toernooi op de tafel, dus die regel zou 'm midden in de wedstrijd
        // afkappen (zoals #130 op 16-09). Wél een eigen stop (#145): 5 minuten nadat de
        // teamwedstrijd klaar is — zie planning/competitieStop.js.
        if (entry.streamType === 'competitie') {
          // Niveau/teams ontbreken (v0.61, oude wizard in de browser)? Zelf opzoeken via de
          // matchId, hooguit eens per 2 minuten, en bewaren zodat dit maar één keer hoeft.
          if (entry.matchId != null && !heeftTeams(entry)) {
            if (!moetCompetitieChecken(entry, now)) continue;
            entry = { ...entry, competitieLaatsteCheck: now.toISOString() };
            store[key] = entry;
            storeGewijzigd = true;
            const gevonden = await zoekCompetitieWedstrijd(entry.matchId, { niveau: entry.niveau });
            if (!gevonden) continue; // volgende keer opnieuw; vangnet = nachtstop
            entry = { ...entry, niveau: gevonden.niveau, thuisteam: gevonden.thuisteam, uitteam: gevonden.uitteam, teamsOpgezocht: true };
            store[key] = entry;
            context.warn(`[checkStops] tafel ${entry.tableNumber}: teams ontbraken → opgezocht via matchId ${entry.matchId}: ${gevonden.niveau}, ${gevonden.thuisteam} vs ${gevonden.uitteam}`);
            // Wedstrijd is al opgehaald: de check hieronder mag meteen, zonder 2 minuten te wachten.
            entry = { ...entry, competitieLaatsteCheck: undefined };
            store[key] = entry;
          }
          const toernooiId = toernooiVoorNiveau(entry.niveau);
          if (entry.matchId == null || !toernooiId) continue; // vangnet = nachtstop

          // Staat de wachttijd al te lopen, dan hoeft Cuescore niet meer bevraagd te worden.
          let match = null;
          if (!entry.competitieKlaarSinds) {
            if (!moetCompetitieChecken(entry, now)) continue;
            entry = { ...entry, competitieLaatsteCheck: now.toISOString() };
            store[key] = entry;
            storeGewijzigd = true;
            const id = String(toernooiId);
            if (!cache.has(id)) {
              try {
                cache.set(id, await getTournament(toernooiId));
              } catch (e) {
                context.warn(`[WAARSCHUWING] competitie-check tafel ${entry.tableNumber} (toernooi ${id}): ${e.message}`);
                cache.set(id, null);
              }
            }
            const t = cache.get(id);
            match = t && (t.matches || []).find((m) => String(m.matchId) === String(entry.matchId));
            if (!match) continue;
          }

          const besluit = competitieStopBesluit(entry, match, now, { wachtMs: COMPETITIE_WACHT_MS });
          if (besluit.klaarSinds && !entry.competitieKlaarSinds) {
            entry = { ...entry, competitieKlaarSinds: besluit.klaarSinds, competitieKlaarReden: besluit.reden };
            store[key] = entry;
            storeGewijzigd = true;
            context.warn(`[checkStops] tafel ${entry.tableNumber}: competitiewedstrijd klaar (${besluit.reden}) → stopt over ${COMPETITIE_WACHT_MS / 60000} min.`);
            // Tot die stop: stand en uitslagen in beeld in plaats van een lege tafel (#147).
            // Eén keer, op het moment dat klaarSinds gezet wordt — niet elke tik opnieuw.
            competitieSchermAan.push(entry.tableNumber);
          }
          if (besluit.stoppen) {
            context.warn(`[checkStops] tafel ${entry.tableNumber}: stoppen — competitiewedstrijd klaar (${besluit.reden})`);
            teStoppen.push(entry.tableNumber);
            store[key] = { ...entry, stopped: true };
            storeGewijzigd = true;
          }
          continue;
        }
        const lijst = await toernooienVanDag(ref);
        const gevonden = lijst && kiesToernooiVoorTafel(lijst, entry.tableNumber, ref, {
          streamType: entry.streamType, titel: entry.title,
        });
        if (!gevonden) {
          // Een CHALLENGE (#121, incident 08-09): geen Cuescore-koppeling betekent dat
          // `venueTables` deze tafel NOOIT als "playing" ziet, ook niet terwijl er
          // gewoon gespeeld wordt — er is immers geen toernooi dat de wedstrijd bijhoudt.
          // Zou je hier ook de generieke inactiviteitscheck (#100) laten meedraaien, dan
          // stopt ELKE challenge na precies 1 uur, midden in de partij. Precies dat
          // gebeurde op 08-09 met "Gurps vs Dylan" (gestart 19:11, afgekapt 20:11). Een
          // challenge heeft daarom zijn EIGEN, bewuste tijdslimiet (challengeLimiet.js) —
          // die is hier leidend, de tafelbrede inactiviteitscheck slaan we voor challenges
          // helemaal over. Die tijdslimiet staat sinds 17-09 zelf ook uit (#134) — een
          // challenge loopt dus tot de nachtstop, tenzij CHALLENGE_LIMIET=true.
          if (entry.streamType === 'challenge') {
            if (isChallengeLimietAan() && challengeMoetStoppen(entry, now)) {
              context.warn(`[checkStops] tafel ${entry.tableNumber}: stoppen — challenge: tijdslimiet bereikt`);
              teStoppen.push(entry.tableNumber);
              store[key] = { ...entry, stopped: true };
              storeGewijzigd = true;
            }
            continue;
          }
          // Koppelen lukt niet en het is geen challenge (blijft dus gewoon ad-hoc).
          // Vangnet #100: na een uur stilte op deze tafel toch stoppen, anders loopt
          // zo'n stream door tot de nachtstop van 02:00.
          // Staat standaard UIT sinds 17-09 (#134): deze regel kapte lopende wedstrijden
          // af op tafels zonder Cuescore-koppeling (#121, #130). Uit betekent: de stream
          // loopt door tot de nachtstop van 02:00. Terug aan met INACTIVITEIT_STOP=true.
          if (!isInactiviteitsStopAan()) continue;
          const ic = inactiviteitsCheck(entry, venueTables, now);
          if (ic.laatsteActiviteit !== entry.laatsteActiviteit) {
            entry = { ...entry, laatsteActiviteit: ic.laatsteActiviteit };
            store[key] = entry;
            storeGewijzigd = true;
          }
          if (ic.moetStoppen) {
            context.warn(`[checkStops] tafel ${entry.tableNumber}: stoppen — losse uitzending, al een uur geen wedstrijd op deze tafel (#100)`);
            teStoppen.push(entry.tableNumber);
            store[key] = { ...entry, stopped: true };
            storeGewijzigd = true;
          }
          continue;
        }
        entry = {
          ...entry,
          tournamentId: gevonden.id,
          tournamentName: gevonden.name || entry.tournamentName || '',
          adhoc: false,
          autoGekoppeld: now.toISOString(),
        };
        store[key] = entry;
        storeGewijzigd = true;
        cache.set(String(gevonden.id), gevonden);
        context.warn(`[checkStops] tafel ${entry.tableNumber}: ad-hoc stream gekoppeld aan "${gevonden.name}" (${gevonden.id}) → automatisering actief.`);
      }

      let tournament = null;
      if (entry.tournamentId != null) {
        const id = String(entry.tournamentId);
        if (cache.has(id)) tournament = cache.get(id);
        else {
          try {
            tournament = await getTournament(entry.tournamentId);
          } catch (e) {
            context.warn(`[WAARSCHUWING] stop-check ${id}: ${e.message}`);
          }
          cache.set(id, tournament);
        }
      }

      // Zelfherstel (09-09-incident): Cuescore blijkt af en toe TWEE toernooi-ID's onder
      // dezelfde naam/datum te hebben (bijv. een verouderd/dubbel record) — de planner koos
      // toen zonder enig signaal het ID dat Cuescore inmiddels "ongeldig" vindt (leeg antwoord
      // sinds de fix hierboven in cuescore/index.js). Tafel 1 & 3 stonden zo een hele avond
      // gekoppeld aan een dood ID: geen podium, geen auto-stop, finalize viel terug op de
      // generieke thumbnail met 0 hoofdstukken — terwijl er via een ANDER, geldig ID gewoon
      // live gespeeld werd op diezelfde tafels. Faalt de koppeling, probeer dan hetzelfde
      // (bewust voorzichtige) hertoernooi-zoekmechanisme als bij een ad-hoc stream: alleen
      // hangen als er ondubbelzinnig één toernooi op deze tafel vandaag speelt.
      if (!tournament && entry.tournamentId != null) {
        const lijst = await toernooienVanDag(ref);
        const kandidaat = lijst && kiesToernooiVoorTafel(lijst, entry.tableNumber, ref, {
          streamType: entry.streamType, titel: entry.title,
        });
        // Alleen herkoppelen binnen dezelfde SOORT (#129, 16-09). Op die avond werd de
        // uitzending van een enkeldaags toernooi gekoppeld aan "Mokum 14.1 Summer league",
        // een doorlopende competitie. Die heeft een heel andere stopregel ("laatste
        // wedstrijd van de avond op deze tafel gespeeld"), dus de stream stopte meteen.
        // Een vervangend ID hoort bij hetzelfde evenement; dan hoort de soort te kloppen.
        const soortVan = (id) => ((recById.get(String(id)) || {}).type) || 'tournament';
        if (kandidaat && String(kandidaat.id) !== String(entry.tournamentId) &&
            soortVan(kandidaat.id) !== soortVan(entry.tournamentId)) {
          context.warn(`[checkStops] tafel ${entry.tableNumber}: "${kandidaat.name}" (${kandidaat.id}) is een ${soortVan(kandidaat.id)} en het oorspronkelijke toernooi een ${soortVan(entry.tournamentId)} — NIET herkoppeld (#129).`);
        } else if (kandidaat && String(kandidaat.id) !== String(entry.tournamentId)) {
          context.warn(`[checkStops] tafel ${entry.tableNumber}: toernooi ${entry.tournamentId} ongeldig/onbereikbaar bij Cuescore → hergekoppeld aan "${kandidaat.name}" (${kandidaat.id})`);
          tournament = kandidaat;
          entry = { ...entry, tournamentId: kandidaat.id, tournamentName: kandidaat.name || entry.tournamentName || '' };
          store[key] = entry;
          storeGewijzigd = true;
          cache.set(String(kandidaat.id), tournament);
        }
      }

      const rec = recById.get(String(entry.tournamentId));
      const type = (rec && rec.type) || 'tournament';

      // Stempel het moment waarop het toernooi klaar is (voor de podium-grace) — óók als
      // we nu nog niet stoppen. Zo weet shouldStop volgende ronde hoelang het podium al staat.
      if (type !== 'competition' && !entry.finaleKlaarSinds && toernooiKlaar(entry, tournament, now)) {
        entry.finaleKlaarSinds = now.toISOString();
        store[key] = entry;
        storeGewijzigd = true;
        context.warn(`[checkStops] tafel ${entry.tableNumber}: toernooi klaar → podium-grace gestart.`);
      }

      // Vangnet #105: het toernooi IS gekoppeld, maar Cuescore geeft voor dit ID 0
      // wedstrijden terug (zoals op 16-08 — de wedstrijddata stond op een ander ID).
      // toernooiKlaar() kan dan nooit true worden. Val terug op dezelfde tafelbrede
      // inactiviteitscheck als #100, met hetzelfde uur als grens.
      const toernooiIsLeeg = !!tournament && (tournament.matches || []).length === 0;
      let inactiviteitReden = null;
      if (toernooiIsLeeg && isInactiviteitsStopAan()) {
        const ic = inactiviteitsCheck(entry, venueTables, now);
        if (ic.laatsteActiviteit !== entry.laatsteActiviteit) {
          entry = { ...entry, laatsteActiviteit: ic.laatsteActiviteit };
          store[key] = entry;
          storeGewijzigd = true;
        }
        if (ic.moetStoppen) {
          inactiviteitReden = 'toernooidata bij Cuescore komt leeg terug en al een uur geen wedstrijd op deze tafel (#105)';
        }
      }

      const reden = stopReden(entry, rec, tournament, now, { graceMs: STOP_GRACE_MS }) || inactiviteitReden;
      if (reden) {
        // Automatisch gekoppeld? Sluit de tafel pas als er vandaag écht niets meer op
        // staat — ook niet in een ánder toernooi (bijv. twee qualifiers op één avond).
        if (entry.autoGekoppeld) {
          const lijst = await toernooienVanDag(ref);
          if (lijst && anderToernooiNogOpTafel(lijst, entry.tournamentId, entry.tableNumber, ref)) {
            context.log(`[checkStops] tafel ${entry.tableNumber}: toernooi klaar, maar er staat vandaag nog een ander toernooi op deze tafel → nog niet sluiten.`);
            continue;
          }
        }
        // Reden altijd loggen (#76): bij het incident van 27-07 stond er alleen dát er
        // gestopt werd, niet waarom — dat kostte de hele diagnose een dag. Op Warning-niveau
        // (#111-vervolg, 22-08): logLevel.default staat op Warning, dus een gewone .log()
        // haalt de log-omgeving niet meer — precies dít soort regels moet altijd doorkomen.
        context.warn(`[checkStops] tafel ${entry.tableNumber}: stoppen — ${reden}`);
        teStoppen.push(entry.tableNumber);
        store[key] = { ...entry, stopped: true };
        storeGewijzigd = true;
      }
    }

    // Tafel vrijmaken vóór een ingepland toernooi (#93). Staat hier ná de gewone stop-check,
    // zodat een uitzending die al om een andere reden stopt niet dubbel wordt geteld.
    //
    // Achter een schakelaar, en die staat standaard UIT. Reden: dit ging live op de avond dat
    // de automatische start voor het eerst echt gebruikt werd (04-08). Twee nieuwe dingen op
    // één avond maakt onmogelijk uit te zoeken wat er misging als er iets misgaat. Aanzetten
    // met de app-instelling TAFEL_VRIJMAKEN=true zodra de automatische start bewezen is.
    for (const v of (process.env.TAFEL_VRIJMAKEN === 'true' ? vrijTeMaken(planning, store, now) : [])) {
      const key = String(v.tableNumber);
      if (!store[key] || store[key].stopped) continue;
      context.warn(`[checkStops] tafel ${v.tableNumber}: stoppen — ${v.reden} (video ${v.videoId})`);
      teStoppen.push(v.tableNumber);
      store[key] = { ...store[key], stopped: true, vrijgemaaktVoor: v.tournamentId };
      storeGewijzigd = true;
    }

    if (storeGewijzigd) await writeJson(pad, store);
  }

  if (teStoppen.length > 0 || teHerstarten.length > 0 || competitieSchermAan.length > 0) {
    const commands = (await readJson('commands.json', [])) || [];
    const nieuw = [
      // Vóór een eventuele stop in dezelfde tik, zodat de volgorde in de wachtrij klopt.
      ...competitieSchermAan.map((tn) => ({
        id: crypto.randomUUID(), createdAt: now.toISOString(), ...competitieSchermCommando(tn),
      })),
      ...teStoppen.map((tn) => ({
        id: crypto.randomUUID(), createdAt: now.toISOString(), type: 'stopStream', tableNumber: Number(tn),
      })),
      // preflight NIET gezet: dit is geen automatische eerste start (die controleert eerst
      // de camera, #43) maar een herhaling van een al-eerder-verstuurd commando.
      ...teHerstarten.map((tn) => ({
        id: crypto.randomUUID(), createdAt: now.toISOString(), type: 'startStream', tableNumber: Number(tn),
      })),
    ];
    await writeJson('commands.json', enqueue(commands, nieuw));
    if (teStoppen.length) context.warn(`[OK] ${teStoppen.length} stopStream-commando(s): tafels ${teStoppen.join(', ')}`);
    if (teHerstarten.length) context.warn(`[OK] ${teHerstarten.length} herstart-commando(s) (#114): tafels ${teHerstarten.join(', ')}`);
    if (competitieSchermAan.length) context.warn(`[OK] competitiescherm aan (#147): tafels ${competitieSchermAan.join(', ')}`);
  }

  // Alarm versturen (mail + ntfy) buiten de dag-loop, ná het wegschrijven van de store:
  // een mislukte verzending mag de rest van checkStops niet ophouden of de store-schrijf
  // blokkeren (entry.alertVerstuurd staat al vast, dus bij een mislukte verzending komt
  // er geen tweede poging — beter een gemiste melding dan een spervuur aan mails).
  for (const a of teAlarmeren) {
    const bericht = bouwStreamFalenAlert(a);
    context.warn(`[ALARM] tafel ${a.tableNumber}: niet live na ${a.pogingen} pogingen — alarm wordt verstuurd.`);
    try {
      const res = await stuurAlert(bericht);
      context.warn(`[ALARM] tafel ${a.tableNumber}: mail ${res.mail.verstuurd ? 'verstuurd' : `overgeslagen (${res.mail.reden})`}, ntfy ${res.ntfy.verstuurd ? 'verstuurd' : `overgeslagen (${res.ntfy.reden})`}.`);
    } catch (e) {
      context.warn(`[WAARSCHUWING] [ALARM] tafel ${a.tableNumber}: versturen mislukt: ${e.message}`);
    }
  }
}

app.timer('checkStops', {
  schedule: CRON_ELKE_MIN,
  handler: async (myTimer, context) => {
    await verwerk(new Date(), context);
  },
});

module.exports = { verwerk };
