# Overdracht 04-10 — nachtstop tijdelijk 04:00, datum-fix (#170), thumbnails en T16 nagelopen (#158)

## Context
Zondag 04-10 is dag 3 van het OnePocket.org-weekend (hoofdtoernooi "5th Anniversary edition
OnePocket.org Member tournament", Cuescore-ID 74776897). Het toernooi zou laat doorlopen, Nick
verzette de Cuescore-datum naar vandaag, en T16 had ochtendhaperingen. Zie ook
[2026-10-03-onepocket-thumbnails-ticker-handover.md](2026-10-03-onepocket-thumbnails-ticker-handover.md)
en [2026-10-03-side-event-handmatig-t16-onscherp-handover.md](2026-10-03-side-event-handmatig-t16-onscherp-handover.md).

## 1. Nachtstop tijdelijk naar 04:00 (inmiddels TERUGGEZET)
- App-setting `NACHT_STOP_SLUITING_MIN` ging van 180 (03:00) naar 240 (04:00); code in
  `backend/src/functions/nachtStop.js` regel 16. Geen deploy nodig. De timer draait elke 30 min,
  dus de stop valt dan tussen 04:00 en 04:29.
- Peter zette hem via `az functionapp config appsettings set ... mokum-streams-func ...`
  (schrijfacties naar productie worden voor mij geweigerd) en haalde hem daarna weer weg met
  `appsettings delete --setting-names NACHT_STOP_SLUITING_MIN`. Gecontroleerd: `list` geeft `[]`,
  de standaard van 180 geldt weer.
- Valkuilen: een app-setting wijzigen herstart de Function App kort (timers slaan een tik over,
  OBS-streams niet). De **eigen eindtijd uit de planner** stopt eerder dan de nachtstop; die stond in
  de planner op 04:30, dus de nachtstop (04:00–04:29) komt eerst. Agent-alarmen zijn tussen 01:00 en
  07:00 stil (#132).

## 2. Datum-bug #170 opgelost en gecontroleerd
- Probleem: Nick verzette de Cuescore-startdatum, maar `date` in `planning.json` bleef op de oude
  waarde (2 okt) terwijl `plannedStart` wel meeging. Het toernooi stond daardoor niet onder
  "Vandaag" in de wizard.
- Fix: `date: afgeleideDatum(t.start) || oud.date` in `backend/src/planning/planning.js`
  (commit `fe8f62b`, **PR #173**, test erbij, 12/12 groen). Gemerged door Peter, deploy groen,
  `/api/health` meldde `4c97999`.
- Bewijs voor/na de importrun van 11:00 (`planning.json`, ID 74776897): date 2026-10-02 → 2026-10-04,
  plannedStart 3-10 → 4-10 09:00, plannedStop 3-10 → 4-10 21:59. In "Nieuwe stream starten" staat
  het toernooi nu als "Vandaag · 5th Anniversary edition OnePocket.org Member tournament".
  **#170 is gesloten.**
- Les: de import draait elk uur (op het hele uur) en er is geen endpoint om hem te forceren. Een
  fix in `planning.js` werkt dus pas bij de eerstvolgende hele-uur-run.
- Merge-omvang: `develop` loopt nog meerdere commits voor op `main` (`git log origin/main..develop`) (o.a. podium-fix `1d94804`, wizardtekst
  `903a36f`, OnePocket-thumbnail `44756e3` die op `main` al als `2c925bd` staat). PR #173 en PR #172
  zijn bewust als losse cherry-picks gedaan, net als #168. Bij de volgende merge van `develop` naar
  `main`: controleer op dubbele wijzigingen.

## 3. Thumbnails
- De gele thumbnail "ONEPOCKET.ORG MAIN EVENT" (`C:\PDS\06 Fotos en media\Google AI plaatjes\geel -
  onepocket.org main event 2-3 okt.png`) is met `setThumbnail` (los scriptje, niet in de repo) op de
  video's `HGh7-G78Syg` en `jwlUF3-3SV4` gezet. Geen foutmelding van YouTube; niet visueel gecontroleerd.
- Let op: de automatische finalisatie zet na de finale een eigen thumbnail over een handmatige heen.
  Sinds de OnePocket-template (02-10) zou dat de gele poster moeten zijn; dat is nog niet gecontroleerd.

## 4. T16 (#158): OBS-kant nagelopen, camera nog niet
- Rond 10:50 stond het T16-beeld kort stil terwijl de overlays doorliepen; daarna weer wazig. Het
  stilstaan herstelde vanzelf. Data op dat moment: agent `streaming`, 16 Mbps, YouTube `live`/`active`/
  `good`, OBS 0 dropped frames, CPU 2,2%. Een stream-herstart helpt dus niet.
- Nagelopen op de OBS-pc (T16-instantie), alleen kijken: de camerabron is identiek aan T15 (buffer
  2 MB, reconnect 10 s, geen hardwaredecodering, geen FFmpeg-opties, zelfde URL-vorm); Video is
  conform standaard (1920×1080, 30 fps); Output staat op **Simple** i.p.v. Advanced (NVENC H.264,
  P6, 16000 kbps), effect nihil, niet de oorzaak.
- Bevindingen staan als comment in #158. Conclusie: OBS, encoder en YouTube-ingest zijn het niet,
  het verlies zit vóór OBS (camera of camerastroom).

## 5. T3 om 12:20 automatisch gestopt: verlopen eindtijd (#171), niet het personeel
- Peter vroeg of de zaal T3 handmatig had gestopt. Logs (gedeelde Log Analytics, gefilterd op
  `mokum-streams-func`): geen `[streams/stop] … HANDMATIG`-regel. Wel `12:19:50 scorebord WAITING`
  (partij afgelopen) en `12:20:04 [checkStops] tafel 3: stoppen — ingestelde eindtijd bereikt
  (2026-10-03T23:30:00Z)`, daarna 12:25 gefinaliseerd.
- Oorzaak: de tijdelijke `stopOverride` van gisteren (01:30 lokaal van 4 okt) lag op dag 3 in het
  verleden; de handmatige stap om hem vooruit te zetten was niet gedaan. De #76-bescherming hield de
  stop tegen zolang de partij liep, T1 en T16 zaten nog midden in een partij.
- Oplossing: `stopOverride` van record 74776897 op `null` gezet met een los scriptje op `planning.json`
  (alleen dat veld; vergeleken met een backup: 1 veldverschil van 95 records, backup in
  `%TEMP%\planning-backup-*.json`). Na de importrun van 13:00 nog steeds `null`. Zonder eigen eindtijd
  is de nachtstop (03:00) het vangnet.
- T3 is daarna opnieuw gestart via **Nieuwe stream → Cuescore-toernooi** (niet ad-hoc): meteen
  gekoppeld aan 74776897, nieuwe video `WxxSw6HzfCA`; de eerdere T3-video `B-BqRqxyCBY` is apart
  afgerond (1 hoofdstuk).
- **Planner-valkuil (nieuw):** staat een toernooi op Concept, dan slaat het Eind-veld niets op de server
  op tot een klik op Plan (`wijzig` in `App.jsx`). Plan klikken kan de automatische start tafels laten
  aanmaken, dus geen veilig alternatief. Een eindtijd corrigeer je voorlopig in `planning.json`.
- Alles staat als comment in #171, met een voorstel (negeer een `stopOverride` van vóór `scheduledStart`
  in `stopReden()`, overrides meeschuiven in `mergePlanning`, planner-melding bij Concept). Nog niet
  gebouwd: Peter heeft akkoord gegeven voor het voorstel, maar de deploy wacht tot er niets meer zendt.

## Wat er nog open staat
- **#171:** de drie fixes uit het voorstel (zie punt 5), na het toernooi, plus een punt in
  [../faq-storingen.md](../faq-storingen.md).
- **#158:** UniFi Protect-live view van de T16-camera op High naast T15, videokwaliteit (4K / Enhanced
  H.265 / Custom 12–16 Mbps / FPS Auto), welk kwaliteitskanaal de RTSP-link van T16 gebruikt, lens,
  en of de camera vanochtend verbindingen verloor. Peter kon er vanuit huis niet bij; kan via een
  browser op de OBS-pc (zaal-LAN) of op de zaal. Daarna pas eventueel een timeout in de FFmpeg-opties
  van de camerabron overwegen.
- **Output Mode:** staan T1, T3 en T15 ook op Simple, of alleen T16? Gelijktrekken met de standaard
  (Advanced) kan alleen als de tafel vrij is (stream-herstart nodig).
- **Na het toernooi controleren:** dat de streams gestopt, gefinaliseerd en van thumbnail voorzien zijn
  (zie punt 3), en dat de nachtstop op 03:00 staat (is gecontroleerd).
- **#169 (tickerbalk):** nog steeds alleen vastgelegd, niets gebouwd.

## Waar de kennis verder staat
- Issues: #170 (gesloten, met bewijs), #158 (comment 04-10), #173 en #172 (PR's).
- [docs/obs-standaard.md](../obs-standaard.md) (kwaliteitsstandaard en camerabron), `backend/src/planning/planning.js`,
  `backend/src/functions/nachtStop.js`.
