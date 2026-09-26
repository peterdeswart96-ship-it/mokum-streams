# Overdracht 26-09 — afstemcheck voor stops (#113), agent-offline-alarm (#132), archief op matchId (#140), scherpte-onderzoek (#158)

Aanleiding: Peter vroeg welke openstaande issues Claude zelfstandig kon uitvoeren, op volgorde van
prioriteit. Daaruit kwamen drie stukken werk voort; een vierde (#158, camerascherpte) is
onderzocht op de OBS-pc terwijl Peter er op afstand op zat. Alles is **gemerged naar main
(PR #160, commit `2103823`)** en gedeployed; `/api/health` meldt `commit: 2103823` en de nieuwe
timer `agentBewaking` staat geregistreerd in de Function App.

## Rode draad

Een groot deel van de "openstaande" issues bleek al klaar en wachtte alleen op een echte avond
(zie "Al klaar, alleen nog bewijs nodig"). De drie dingen die wél echt ontbraken zijn nu gebouwd:
een stop die stil mislukt, een pc die stil wegvalt, en een archief dat spelers kwijtraakt bij een
naamswijziging. Alle drie zijn **vangnetten**: ze doen niets zolang alles klopt.

## 1. #113 — stop-afstemcheck

**Probleem (22–24-08, vijf keer):** overal waar we stoppen zetten we `entry.stopped = true` zodra
het commando is weggeschreven, niet zodra OBS het uitvoerde. Miste de agent het commando, dan
stond de tafel op "offline" terwijl de uitzending doorliep. Tafel 15 negeerde zelfs een expliciet
tweede commando.

**Oplossing:**
- `backend/src/planning/stopAfstemming.js` (pure logica, 11 tests): staat een tafel als gestopt
  geregistreerd en meldt de agent `streaming: true`, dan stempelen we `stopAfwijkingSinds`; na
  3 min sturen we opnieuw `stopStream`, hooguit 3x met 2 min ertussen; daarna **eenmalig alarm**
  (`stopAlertVerstuurd`, mail + ntfy via `bouwStopFalenAlert`).
- Ingehaakt in `functions/checkStops.js`, vóór de oude `if (entry.stopped) continue`.
- Schakelaar `STOP_AFSTEMMING` (standaard **aan**, `false` zet uit) in `config/automation.js`.

**Valkuil die ik expres heb afgedekt:** `dagen` in `checkStops` bevat vandaag én gisteren. Een
gestopte entry van gisteren mag niet worden afgestemd als vandaag een nieuwe uitzending op
dezelfde tafel draait — dan zouden we de nieuwe stoppen. Daarom telt alleen de **nieuwste**
registratie per tafel (`tafelsGezien`).

**Beperking:** start Peter na een stop met de hand OBS zonder dashboard (dus zonder nieuwe
store-entry), dan wordt die uitzending na 3 min opnieuw gestopt. Bewuste keuze; uit te zetten.

**Niet getest:** de koppeling in `checkStops` zelf (geen integratietest, alleen de pure logica).
**#113 blijft open** tot een echte avond laat zien dat een verloren stopcommando vanzelf alsnog
wordt uitgevoerd (criterium uit de issue).

## 2. #132 — alarm als de OBS-pc/agent zwijgt

**Probleem:** 17-09 viel de OBS-pc om 02:16 weg en werd pas om 10:00 ontdekt. De hartslag
(`agent/heartbeat.json`) bestond, maar er was geen alarm.

**Oplossing:**
- `backend/src/planning/agentBewaking.js` (pure logica, 11 tests) en timer
  `backend/src/functions/agentBewaking.js` (elke minuut, seconde 30).
- Zwijgt de agent langer dan 10 min (`AGENT_ALARM_MIN`) → **eenmalig** alarm (mail + ntfy) met
  laatst-gezien-tijd; komt hij terug → herstelmelding. Staat in `agent/alarm.json`
  (`alarmVoorLastSeen`, `alarmOm`).
- **Rustige uren 01:00–07:00 (besluit van Claude, Peter heeft er niet tegen geprotesteerd):** dan
  geen alarm; is de pc om 07:00 nog weg, dan komt het alsnog — vóór openingstijd. Wil Peter 's nachts
  wél een push, dan `RUSTIG_VAN_MIN`/`RUSTIG_TOT_MIN` in `planning/agentBewaking.js` aanpassen.
- Schakelaar `AGENT_ALARM` (standaard **aan**, `false` zet uit).
- De wekelijkse herstart (ma/do 06:00) valt binnen de 10 minuten en geeft geen vals alarm.

**Nog te bewijzen:** een echte uitval, of een test waarbij de agent 10 min wordt stilgezet
(overdag). Ook controleren dat `ALERT_SMTP_GEBRUIKER`, `ALERT_ONTVANGERS` en `NTFY_TOPIC` in
productie staan (dezelfde instellingen als het stream-alarm van 12-09). **#132 blijft open.**

## 3. #140 — archief koppelt op matchId, niet meer alleen op naam

**Probleem:** `wedstrijdenVoorVideo()` koppelde video's aan wedstrijden via het spelerspaar op naam.
Een volledige rebuild haalt Cuescore opnieuw op met de **huidige** namen; hernoemde spelers
matchten niet meer en vielen uit het archief (17-09: 87 wedstrijden).

**Oplossing (`backend/src/video/archief.js`, `koppelHoofdstukken()`):**
1. op `matchId` (nieuw: `hoofdstukData` en het index-record in `finalize.js` bewaren het);
2. op spelerspaar-naam (zoals voorheen);
3. **terugval op volgorde** voor de 331 oude records die alleen namen hebben: wedstrijden die op 1
   of 2 kloppen zijn ankers; tussen twee ankers moeten het aantal onbekende hoofdstukken en
   onbekende wedstrijden (op starttijd gesorteerd) gelijk zijn, dan koppelen we op volgorde. Bij
   twijfel koppelen we **niets** (liever een wedstrijd missen dan naar een verkeerd moment linken).
- Een hoofdstuk wordt nooit aan twee wedstrijden gekoppeld. Dat verbeterde ook een bestaande fout:
  speelt hetzelfde paar twee keer op één tafel (bijv. ronde en finale), dan kreeg de oude code
  beide het eerste tijdstip.
- 6 nieuwe tests in `backend/test/archief.test.js`.

**Proef op productiedata (alleen gelezen, niets weggeschreven):** alle 342 `video-index`-records
opgehaald en oude en nieuwe code naast elkaar gelegd:

| | wedstrijden |
|---|---|
| oude code (= wat een rebuild nu zou opleveren) | 1865 |
| nieuwe code | 1933 |
| archief zoals het nu staat (met herstel van 17-09) | 1898 |

54 video's krijgen wedstrijden erbij of een correct tijdstip. De proef sloeg de duurcontrole van
de rebuild over en 3 toernooien konden niet worden opgehaald; de echte aantallen kunnen iets
afwijken.

**Nog te doen voor sluiten:**
1. De deploy staat er al (`2103823`). Draai nu `POST /api/manage/archief/rebuild` en controleer
   dat het aantal **niet daalt** (nu ~1898; verwacht ≥ 1898, richting ~1930).
2. Tot dat gebeurd is: geen rebuild draaien was de regel — die vervalt pas na een geslaagde
   controle. Kijk daarna of de archiefpagina er goed uitziet.

## 4. #158 — tafel 16 onscherp: geen tafel-16-probleem, algemene zachtheid

Peter zat op afstand op de OBS-pc. Bevindingen:
- De OBS-instellingen van de bronnen 15 en 16 zijn identiek (2 MB buffering, 10 s reconnect, geen
  hardware-decoding). YouTube is niet slechter dan de OBS-preview → het verlies zit vóór de uitzending.
- Peter zag tafel 15 er in OBS en op YouTube **hetzelfde** uitzien: het is dus geen afwijking van
  tafel 16 maar algemene zachtheid van de ballen op alle cameratafels.
- Edit Transform van Camera Tafel 15: 2419×1361 px = precies 63% van 3840×2160 → de bron is
  waarschijnlijk **4K** (afgeleid, niet bevestigd), door OBS teruggeschaald en uitgesneden
  (X −214, Y 81).
- **Scale Filtering stond op "Disable"** (bij alle cameratafels vermoedelijk). Peter heeft alle vier
  de camerabronnen op **Lanczos** gezet en test dat nu een tijdje.
- Correctie die ik onderweg gaf: *Instellingen → Video → Downscale Filter* is hier niet relevant
  (werkt alleen als canvas ≠ uitvoer); het gaat om het filter **per bron** (rechtsklik → Scale Filtering).

**Nog open:** kijk na een paar uitzendingen of de ballen scherper zijn op YouTube. Zo ja:
noteer "Scale Filtering = Lanczos op alle camerabronnen" in `docs/obs-standaard.md` en sluit #158.
Zo nee: UniFi Protect nakijken (Peter had daar vanuit huis geen toegang toe) — beeldinstellingen,
ruisonderdrukking/WDR, sluitertijd (in een schemerige zaal kiest Auto een trage sluiter), en
daarna de bitrate/H.265-instelling uit #32. **Er is nog niets naar #158 gecommentarieerd** behalve
wat hier staat.

## Al klaar, alleen nog bewijs nodig (níet opnieuw bouwen)

Bij het doorlopen bleken deze issues al volledig uitgerold en wachten ze op een echte avond of op
een controle. Lees eerst de reacties voor je iets voorstelt:

| Issue | Stand |
|---|---|
| #134 | **Gesloten** deze sessie (config in productie gecontroleerd). |
| #130 | Uit, live sinds 17-09. Bewijs: een handmatig gestarte stream die > 1 uur doorloopt (league-avond tafel 15/16). |
| #128, #129 | Volledig uitgerold (noodrem `MAX_BROADCASTS_PER_TAFEL`=4, `mokum` in `NEGEER_WOORDEN`). Dicht na één normale toernooiavond zonder regressie. |
| #153 | Oplossing = timer `scorebordWacht` (herlaadt de Cuescore-browserbron). Bewijs: een competitieavond zonder bevroren stand; verschijnt de log-regel "stand niet herkend", dan veldnamen bijstellen. |
| #155 | Uitgerold (`competitieTafels` in `planning/pauze.js`). Bewijs: log-regel "overgeslagen: competitiestream" op een competitieavond. |
| #151 | Uitgerold 21-09. Alleen zaaltest. |
| #156 | Klaar op develop (ochtendrapport meet of het scorebord is ververst). Stond op "mergen naar main"; dat is nu gebeurd via PR #160 → controleer bij het eerstvolgende ochtendrapport dat er geen valse melding komt. |
| #113, #132, #140 | Zie hierboven. |
| #115 | Bijna dicht; wacht op bevestiging dat Archief na een harde refresh (Ctrl+Shift+R) goed is. |

## Besluiten van Peter deze sessie

- #113 als volgende na de opruimronde (boven #155, dat al klaar bleek).
- #134 sluiten met verwijzing naar de productiecontrole.
- **#154 (eigen scorebalk competitiestreams) heeft geen prioriteit** — laat liggen tot Peter erop terugkomt.
- Alles naar main (PR #160), inclusief permissieregel `Bash(gh pr merge:*)` in
  `.claude/settings.local.json` (lokaal, niet in de repo) — die was nodig, Claude mag anders niet mergen.
- Python is geïnstalleerd op Peters pc (`winget install Python.Python.3.12`); zit pas in het pad na
  een herstart van VS Code/Claude Code. Tot die tijd: Node-scripts.

## Valkuilen (kostten tijd)

- **CRLF:** de `backend/`-bronbestanden en docs hebben CRLF-regeleinden. Bewerken met een script moet
  `\r\n` behouden. Heredocs en shell-escapes gingen herhaaldelijk mis met `\n` in template-strings
  (kapotte string in `alertBericht.js`). Werkbaar: patchscript met de Write-tool schrijven en met
  `String.fromCharCode(13, 10)` werken; niet inline in `bash -c`.
- **Issues eerst lezen, dan voorstellen:** meer dan de helft van de "open" issues was al klaar
  (#134, #130, #128, #129, #153, #155, #151, #156). De titel zegt niets over de stand; de laatste
  comment wel.
- **Merge naar main mag alleen met een permissieregel** (of Peter merget zelf op GitHub). Een
  toestemming in de chat telt niet voor de permissiecontrole.

## Wat er nog open staat

1. **#140:** rebuild draaien en aantal controleren (zie boven). Eerste actie voor de volgende sessie.
2. **#158:** resultaat van de Lanczos-test afwachten; dan `docs/obs-standaard.md` bijwerken of UniFi Protect nakijken.
3. **Bewijs op een echte avond:** #113, #132, #130, #128, #129, #153, #155, #151, #156.
4. **Niet-geïmplementeerde issues met echte inhoud:** #159 (stop-knop geeft geen bezig-feedback), #152 (dode
   rotatie-tak in de agent — agent wordt handmatig uitgerold op de OBS-pc), #150 (jackpot-badge thumbnail),
   #131 (broadcast op al-actieve stream key), #99 (controleren of `refreshSource` dit al dekt), en #154 (laag).
   Controleer per issue de comments voor je begint; #152/#159 kunnen op develop al deels gedaan zijn (zie
   overdracht 24-09).
5. Geen integratietest voor `checkStops` en de timer `agentBewaking` — alleen de pure logica is getest.

## Waar de kennis verder staat

- Issues #113, #132, #140, #158 (hun omschrijving en de reacties van eerder).
- `docs/sessies/2026-09-25-*` en `2026-09-24-*` voor de voorgaande stand van competitiescherm en OBS-pc.
- `docs/obs-standaard.md` (camera-bron UniFi Protect, sectie 'Camera-bron') en `docs/obs-herstel-runbook.md`.
- `CLAUDE.md`, sectie "Hoe een avond verloopt" → Vangnetten (bijgewerkt met #113 en #132).
