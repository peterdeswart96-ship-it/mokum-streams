// Pure planning-logica (planning-model v2, zie docs/api-contract.md v0.4).
// Voegt geïmporteerde Cuescore-toernooien samen met onze opgeslagen
// planning-records: nieuwe krijgen de standaard-instellingen, bestaande behouden
// hun handmatige keuzes. Géén netwerk → unit-testbaar.

// Hoeveel minuten vóór de eerste wedstrijd de uitzending begint. Stond op 10, ging op
// 05-08 naar 5 (tien minuten pauzescherm voor er iets gebeurt was aan de lange kant),
// en weer terug naar 10 op 12-09 na een incident waarbij de OBS-pc was vastgelopen —
// met meer marge is er tijd om een storing op te lossen vóórdat de eerste bal valt.
// Per toernooi aan te passen in de Toernooi planner; dit is alleen de startwaarde.
const STANDAARD_PREROLL = 10;

// Eén set standaard-instellingen (alles aan). Wordt ook opgeslagen in
// config/defaults.json en is via het dashboard aan te passen.
const STANDAARD_DEFAULTS = {
  enabled: true,
  // Standaard alleen de twee vaste cameratafels: in ~95% draaien alleen 1 en 3. 15/16
  // voeg je per keer handmatig toe voor een groot toernooi (besluit Peter 27-07). Zo gaan
  // 15/16 niet onnodig leeg live als de loting laat komt.
  tafels: [1, 3],
  preRollMinuten: STANDAARD_PREROLL,
  // Jumbotron staat standaard AAN (#93): een avond begint met het pauzescherm en de
  // highlights, en dat gaat vanzelf uit zodra er op die tafel gespeeld wordt.
  overlays: { sponsors: true, scoreboard: true, jumbotron: true },
  visibility: 'public', // YouTube-zichtbaarheid van de geplande broadcast
};

// Leidt 'YYYY-MM-DD' af uit een ISO-achtige starttijd; anders null.
function afgeleideDatum(start) {
  return typeof start === 'string' && /^\d{4}-\d{2}-\d{2}/.test(start) ? start.slice(0, 10) : null;
}

// True als het event meerdaags is (span > ~1 dag) → een doorlopende competitie/league.
function isMeerdaags(start, stop) {
  if (!start || !stop) return false;
  const a = Date.parse(start);
  const b = Date.parse(stop);
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return b - a > 26 * 3600 * 1000;
}

// Bepaalt het type op basis van de geplande span.
function bepaalType(startOfRecord, stop) {
  const start = stop === undefined ? (startOfRecord.plannedStart ?? startOfRecord.start) : startOfRecord;
  const eind = stop === undefined ? (startOfRecord.plannedStop ?? startOfRecord.stop) : stop;
  return isMeerdaags(start, eind) ? 'competition' : 'tournament';
}

// Effectieve start = handmatige override, anders de geplande start.
function effectiveStart(record) {
  return record.startOverride || record.plannedStart || null;
}

// Is een planning-record "nu" aan de beurt om een broadcast te maken?
// Alleen enkeldaagse (`tournament`) events; doorlopende competities krijgen
// per-avond-logica (nog te bouwen) en geven hier false.
function planningDue(record, now, { graceMinuten = 30 } = {}) {
  if (!record || record.enabled === false) return false;
  if (!record.planned) return false; // fase 2 (#42): alleen expliciet ingeplande toernooien draaien automatisch
  const type = record.type || bepaalType(record);
  if (type === 'competition') return false;
  const startIso = effectiveStart(record);
  const start = startIso ? Date.parse(startIso) : NaN;
  if (Number.isNaN(start)) return false;
  const preRoll = (record.preRollMinuten == null ? STANDAARD_PREROLL : record.preRollMinuten) * 60000;
  const nu = now.getTime();
  return nu >= start - preRoll && nu <= start + graceMinuten * 60000;
}

function dueRecords(records, now, opts) {
  return (records || []).filter((r) => planningDue(r, now, opts));
}

// Lifecycle-status van een planning-record voor de Toernooi planner (#42 fase 4).
// Puur: kijkt naar de record-vlaggen + de broadcast-stand van vandaag (per tafel,
// broadcasts/<datum>.json) + de datum.
//   'geannuleerd' → expliciet geannuleerd
//   'concept'     → nog niet ingepland (planned=false)
//   'live'        → er draait nu een (niet-gestopte) broadcast van dit toernooi
//   'klaar'       → broadcasts bestonden maar zijn gestopt, of de dag is voorbij
//   'gepland'     → ingepland, nog niet gestart
function planningStatus(record, todayStore, vandaagDatum) {
  if (!record) return 'concept';
  if (record.geannuleerd) return 'geannuleerd';
  if (!record.planned) return 'concept';
  const entries = Object.values(todayStore || {}).filter(
    (e) => e && String(e.tournamentId) === String(record.tournamentId)
  );
  if (entries.some((e) => !e.stopped)) return 'live';
  if (entries.length) return 'klaar';
  const startDatum = afgeleideDatum(effectiveStart(record));
  if (startDatum && vandaagDatum && startDatum < vandaagDatum) return 'klaar';
  return 'gepland';
}

// Maakt een nieuw planning-record voor een geïmporteerd toernooi met de defaults.
function defaultRecord(tournament, defaults = STANDAARD_DEFAULTS) {
  const ov = defaults.overlays || {};
  return {
    tournamentId: tournament.id,
    name: tournament.name || '',
    type: bepaalType(tournament.start, tournament.stop),
    date: tournament.date || afgeleideDatum(tournament.start),
    source: 'cuescore',
    plannedStart: tournament.start || null,
    plannedStop: tournament.stop || null,
    enabled: defaults.enabled !== false,
    startOverride: null,
    stopOverride: null,
    preRollMinuten: defaults.preRollMinuten == null ? STANDAARD_PREROLL : defaults.preRollMinuten,
    tafels: Array.isArray(defaults.tafels) ? [...defaults.tafels] : [],
    overlays: { sponsors: ov.sponsors !== false, scoreboard: ov.scoreboard !== false, jumbotron: ov.jumbotron !== false },
    visibility: defaults.visibility || 'public',
    planned: false, // per-toernooi arm-vlag: pas true na bevestigen in de Toernooi planner
  };
}

// Voegt geïmporteerde toernooien samen met bestaande records.
// - Nieuw toernooi → defaultRecord (standaard-instellingen).
// - Bestaand record → behoud gebruikerskeuzes (enabled, overrides, tafels,
//   overlays, preRoll); ververs alleen de Cuescore-velden (name/plannedStart/stop).
// - Records die niet in de import zitten (ad-hoc, of buiten het venster) blijven.
// - Uitzondering op dat laatste (10-09, incident 09-09): staat er zo'n "niet meer
//   gezien" record, én levert Cuescore een NIEUW ID met dezelfde naam+datum, dan is dat
//   vrijwel zeker hetzelfde toernooi dat Cuescore een ander ID heeft gegeven (bijv. omdat
//   de hele terugkerende reeks opnieuw is aangemaakt — zo ontstonden bij "Mokum MEGA Winter
//   Ranking" #2 t/m #7 zes van dit soort paren, allemaal met exact hetzelfde ID-verschil).
//   Zonder deze check bleef het oude ID voor altijd als een onopvallende dubbelganger in de
//   planner staan — en erger, tafel 1 & 3 raakten op 09-09 zelfs aan zo'n dood ID gekoppeld
//   (geen podium, geen auto-stop, generieke thumbnail). We DRAGEN de handmatige keuzes van
//   het oude record over naar het nieuwe ID, in plaats van het oude record te laten
//   verweesd rondslingeren.
// 'YYYY-MM-DD' in Amsterdam. Bewust geen import uit schedule/: dit bestand is
// dependency-vrij en dat houden we zo. Een uur verschil rond middernacht maakt voor een
// venster van vijf weken niets uit.
function datumInAmsterdam(now) {
  return new Date(now).toLocaleDateString('en-CA', { timeZone: 'Europe/Amsterdam' });
}

// Hoelang een record met een verdwenen Cuescore-ID het voordeel van de twijfel krijgt
// vóór we 'm ontwapenen. De import draait elk uur, dus dit zijn ~3 pogingen.
const WEG_GRACE_MS = 3 * 60 * 60 * 1000;

// Haalt de "verdwenen"-markering van een record af — gebruikt zodra het ID wéér in een
// import opduikt (Cuescore was blijkbaar even onbereikbaar, niet echt weg).
function zonderWegMarkering(rec) {
  if (!rec || (rec.cuescoreWeg === undefined && rec.cuescoreWegSinds === undefined)) return rec;
  // Bewust `delete` op een kopie i.p.v. destructuring met rest: die schrijfwijze laat twee
  // ongebruikte variabelen achter en de lint-regel staat op --max-warnings 0.
  const kopie = { ...rec };
  delete kopie.cuescoreWeg;
  delete kopie.cuescoreWegSinds;
  return kopie;
}

// Ruimt records op waarvan Cuescore het toernooi-ID niet meer kent (#127).
//
// Aanleiding (16-09): de MEGA Winter Ranking-serie is bij Cuescore opnieuw aangemaakt
// onder nieuwe ID's. Het oude ID 88433581 werd ongeldig, maar het record bleef met
// `planned: true` in de planner staan, náást het nieuwe record voor hetzelfde toernooi.
// Die twee vochten om dezelfde tafel: vier broadcasts in een kwartier, video's van 51
// seconden (#128), en een herkoppeling aan de verkeerde competitie (#129).
//
// De bestaande wees-migratie hierboven ving dit niet, omdat die alleen werkt als het oude
// ID verdwijnt in dezelfde import waarin het nieuwe verschijnt. Bij deze serie stonden
// beide toernooien een tijd tegelijk bij Cuescore, dus was het oude ID géén wees.
//
// Twee gevallen, bewust verschillend behandeld:
//   - Er is een LEVEND record met dezelfde naam+datum → dit is de achtergebleven
//     dubbelganger. Meteen weggooien; het levende record heeft de handmatige keuzes al.
//   - Geen dubbelganger → het toernooi is echt weg (afgelast, hernoemd). Niet meteen
//     ontwapenen: een half-mislukte Cuescore-ophaal (één van de twee weergaven faalt,
//     zie cuescore/index.js) zou anders in één klap de hele agenda uitzetten. Eerst
//     stempelen, en pas na WEG_GRACE_MS ontwapenen.
//
// Alleen records BINNEN het importvenster (vandaag t/m +vensterDagen) doen mee: een
// toernooi van vorige maand ontbreekt in de import omdat er niet zo ver terug gekeken
// wordt, niet omdat het weg is.
function opschonenVerdwenen(records, geziene, now, vensterDagen) {
  const vandaagISO = datumInAmsterdam(now);
  const grens = new Date(`${vandaagISO}T00:00:00Z`);
  grens.setUTCDate(grens.getUTCDate() + vensterDagen);
  const grensISO = grens.toISOString().slice(0, 10);

  // naam|datum van de records die Cuescore in DEZE import wél kende.
  const levend = new Set();
  for (const r of records) {
    const datum = r.date || afgeleideDatum(r.plannedStart);
    if (geziene.has(String(r.tournamentId)) && r.name && datum) levend.add(`${r.name}|${datum}`);
  }

  const uit = [];
  for (const r of records) {
    if (geziene.has(String(r.tournamentId))) { uit.push(r); continue; }

    const datum = r.date || afgeleideDatum(r.plannedStart);
    const inVenster = !!datum && datum >= vandaagISO && datum <= grensISO;
    if (!inVenster) { uit.push(r); continue; }

    // Achtergebleven dubbelganger van een toernooi dat onder een nieuw ID verder leeft.
    if (r.name && levend.has(`${r.name}|${datum}`)) continue;

    const sinds = r.cuescoreWegSinds || now.toISOString();
    const langGenoegWeg = now.getTime() - Date.parse(sinds) >= WEG_GRACE_MS;
    uit.push(langGenoegWeg
      ? { ...r, cuescoreWegSinds: sinds, cuescoreWeg: true, planned: false }
      : { ...r, cuescoreWegSinds: sinds });
  }
  return uit;
}

function mergePlanning(existing, imported, defaults = STANDAARD_DEFAULTS, { now = null, vensterDagen = 35 } = {}) {
  const lijst = existing || [];
  const nieuweLijst = imported || [];
  const byId = new Map(lijst.map((r) => [String(r.tournamentId), r]));
  const geziene = new Set(nieuweLijst.map((t) => String(t.id)));

  // Bestaande records wier ID niet meer in déze import voorkomt, geïndexeerd op
  // naam+datum — kandidaten om te "vervangen" door een nieuw Cuescore-ID hieronder.
  const wezen = new Map();
  for (const r of lijst) {
    if (!geziene.has(String(r.tournamentId)) && r.name && r.date) {
      wezen.set(`${r.name}|${r.date}`, r);
    }
  }
  const vervangenIds = new Set();

  const resultaat = [];
  for (const t of nieuweLijst) {
    const key = String(t.id);
    const oud = byId.get(key);
    if (oud) {
      const nieuweStart = t.start != null ? t.start : oud.plannedStart;
      const nieuweStop = t.stop != null ? t.stop : oud.plannedStop;
      resultaat.push({
        ...zonderWegMarkering(oud),
        name: t.name || oud.name,
        type: bepaalType(nieuweStart, nieuweStop), // afgeleid, altijd verversen
        plannedStart: nieuweStart,
        plannedStop: nieuweStop,
        date: oud.date || afgeleideDatum(t.start),
        source: 'cuescore',
      });
      continue;
    }

    const datumNieuw = afgeleideDatum(t.start);
    const wees = t.name && datumNieuw ? wezen.get(`${t.name}|${datumNieuw}`) : null;
    if (wees) {
      vervangenIds.add(String(wees.tournamentId));
      resultaat.push({
        ...wees,
        tournamentId: t.id,
        name: t.name || wees.name,
        type: bepaalType(t.start, t.stop),
        plannedStart: t.start || null,
        plannedStop: t.stop || null,
        date: datumNieuw || wees.date,
        source: 'cuescore',
      });
      continue;
    }

    resultaat.push(defaultRecord(t, defaults));
  }

  for (const r of lijst) {
    const id = String(r.tournamentId);
    if (geziene.has(id) || vervangenIds.has(id)) continue; // al verwerkt, of vervangen door een nieuw ID
    resultaat.push(r);
  }
  // Zonder `now` (oude aanroepen/tests) slaan we het opruimen over — dan verandert er niets.
  return now ? opschonenVerdwenen(resultaat, geziene, now, vensterDagen) : resultaat;
}

module.exports = {
  STANDAARD_DEFAULTS,
  STANDAARD_PREROLL,
  afgeleideDatum,
  isMeerdaags,
  bepaalType,
  effectiveStart,
  planningDue,
  dueRecords,
  defaultRecord,
  mergePlanning,
  planningStatus,
};
