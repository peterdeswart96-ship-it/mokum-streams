# API-contract — Mokum Streams

Enige waarheid voor de koppelvlakken tussen frontend/widget, backend en (later) de
agent. Wijzigen? Eerst dit bestand bijwerken (met datum + reden onderaan), dan code.

Status: CONCEPT v0.5 — velden worden definitief in fase 2.

## Conventies
- Alle velden camelCase. Tijden in ISO 8601 met tijdzone (Europe/Amsterdam
  serverside bepaald, als UTC geserialiseerd). Tafelnummers = echte zaalnummering.
- Publieke endpoints: alleen lezen. Schrijfacties vereisen auth (zie backend/CLAUDE.md).
- **Titelregel:** de broadcast-titel is `Tafel {nr} {toernooinaam}`, waarbij
  `toernooinaam` de **volledige naam uit Cuescore** is (die bevat soms zelf al een
  sponsor, soms niet). Er is **geen apart sponsorveld**.

## Publiek (live-pagina + widget)
GET /api/live
Antwoord:
{
  "generatedAt": "2026-07-08T18:00:00Z",
  "venueLive": 7 | null,          // totaal aantal lopende wedstrijden in de héle zaal (alle toernooien), los van welke tafels wij filmen; null = onbekend
  "tables": [
    {
      "tableNumber": 15,
      "status": "live" | "scheduled" | "offline",
      "videoId": "_TG4cEuVt98" | null,
      "title": "Tafel 15 Fluke ranking 9ball Seizoen 3 #22" | null,
      "scheduledStart": "2026-07-08T17:30:00Z" | null,
      "tournamentName": "Fluke ranking 9ball Seizoen 3 #22" | null,
      "quality": { "resolution": "1920x1080", "fps": 60, "bitrateKbps": 9000 } | null,
      "overlays": { "sponsors": true, "scoreboard": true } | null,
      "match": { "playerA": "Kevin Jansen", "playerB": "Johan Palé", "scoreA": 4, "scoreB": 1, "status": "playing", "round": "Winners qualification" } | null,
      "liveVideoId": "yX9SYqMXYrM" | null
    }
  ]
}

GET /api/schedule?days=7
Antwoord: { "items": [ { "date", "startTime", "tournamentName", "tableNumbers": [..] } ] }

POST /api/hit?source=qr&page=mokumlive   (ook GET) — cookieloze bezoek-/QR-teller
- Publiek, geen auth, geen body nodig (past bij navigator.sendBeacon / fetch no-cors).
- `source` = bron (uit utm_source, bv. qr|youtube|direct), `page` = pagina (bv. standen).
  Beide worden genormaliseerd (kleine letters, [a-z0-9_-], max 24) → rommel kan de opslag
  niet opblazen. Cookieloos, geen persoonsgegevens/IP's → geen consent-banner.
- Antwoord: 204 (geen body). Fouten worden stil ingeslikt (teller nooit fataal voor de pagina).

## Beheer (dashboard, auth vereist)
GET  /api/manage/config              -> tafelconfig, array van { tableNumber, streamId }
GET  /api/manage/planning?days=14    -> geplande toernooien (Cuescore-import + instellingen)
POST /api/manage/planning/{id}       -> instellingen van één toernooi wijzigen
POST /api/manage/planning-refresh    -> draait de Cuescore-import nu meteen (i.p.v. wachten op de uurlijkse timer) en werkt planning.json bij; antwoord: { imported, total, items } waarbij items = dezelfde vorm als GET /api/schedule. NB: route bewust NIET `manage/planning/refresh` — dat botst met `manage/planning/{id}`
GET  /api/manage/defaults            -> standaard-instellingen (één set, zie hieronder)
POST /api/manage/defaults            -> standaard-instellingen wijzigen
POST /api/manage/streams/start       -> body: { "tableNumber": 15, "title"?: "...", "privacy"?: "public|unlisted|private", "overlays"?: { "sponsors": true, "scoreboard": true, "jumbotron": false, "pauzemelding": false } } (ad-hoc, vrije camera; enqueuet startStream + setOverlay per overlay)
POST /api/manage/streams/stop        -> body: { "tableNumber": 15 }
POST /api/manage/streams/overlay     -> body: { "tableNumber": 15, "sponsors"?: bool, "scoreboard"?: bool, "jumbotron"?: bool, "pauzemelding"?: bool } (overlay(s) live aan/uit op een lopende stream; enqueuet setOverlay per opgegeven sleutel)
   NB: content-overlays (sponsors/scoreboard) staan standaard AAN;
   break-overlays (jumbotron/pauzemelding) staan standaard UIT (alleen tijdens pauzes tonen).
POST /api/manage/setup/streams       -> eenmalig: herbruikbare liveStream per tafel (idempotent) → schrijft config/tables.json; body (optioneel) { "cameras": [1,3,15,16] }
GET  /api/manage/stats               -> opgetelde bezoek-/QR-teller: { "totaal", "perBron": {..}, "perPagina": {..}, "perDag": { "YYYY-MM-DD": { "totaal", "perBron": {..} } } } (voedt later het centrale mokum-bot-dashboard, #18 fase 4)

Tafelconfig (GET /api/manage/config) — array:
{
  "tableNumber": 15,
  "streamId": "<herbruikbare liveStream-id>"   // NIET de stream key zelf (die is secret)
}

## Planning-model v2 (kern van het dashboard)
De backend **importeert ALLE geplande Mokum-toernooien uit Cuescore** en bewaart
per toernooi onze instellingen/overrides. Elk geïmporteerd toernooi krijgt de
**standaard-instellingen** (alles aan) en is per stuk aan te passen of uit te
zetten. Het dashboard toont dit overzicht (met filters) en kan per toernooi
bijsturen.

Planning-record (GET /api/manage/planning → `{ "items": [ ... ] }`):
{
  "tournamentId": 75880960,                 // Cuescore-id, of "adhoc-<uuid>" bij handmatig
  "name": "Fluke ranking 9ball Seizoen 3 #22",
  "type": "tournament" | "competition",     // competition = doorlopend (league), meerdaagse span
  "date": "2026-07-14",
  "source": "cuescore" | "adhoc",
  "plannedStart": "2026-07-14T17:30:00Z",   // uit Cuescore (.starttime), alleen-lezen
  "plannedStop":  "2026-07-14T21:00:00Z",   // uit Cuescore (.stoptime), kan null zijn
  "enabled": true,                          // streamen we dit toernooi?
  "startOverride": null,                    // handmatige start (anders plannedStart)
  "stopOverride":  null,                    // handmatige stop (anders auto op Cuescore-finale)
  "preRollMinuten": 10,                     // hoeveel eerder starten met "begint zo"-scherm
  "tafels": [1, 3],                         // welke camera's (echte zaalnummers)
  "overlays": { "sponsors": true, "scoreboard": true }
}
POST /api/manage/planning/{id} — body met te wijzigen velden (enabled, startOverride,
stopOverride, preRollMinuten, tafels, overlays); retour = bijgewerkt record.

Regels:
- **Effectieve start** = `startOverride` ?? `plannedStart`; de stream begint
  `preRollMinuten` eerder met de "begint zo"-scène.
- **Effectieve stop** = `stopOverride` ?? auto op Cuescore-finale (toernooi
  `status = "Finished"`). **Voor `competition` (doorlopend)** vuurt dat pas aan
  seizoenseinde → per avond stoppen op matches-van-vandaag-klaar of stoptijd (nog
  uit te werken).
- **`type`:** `competition` als de Cuescore-span (`plannedStop − plannedStart`)
  meerdaags is (league); anders `tournament`. Leagues komen via dezelfde import
  binnen (staan ook op de org-toernooien-pagina); de streameenheid is dan de
  **wedstrijden per avond**.
- **Bij import** krijgt elk toernooi de **standaard-instellingen** (`enabled=true`,
  alle camera's, overlays aan, `preRollMinuten=10`). Al aangepaste velden van een
  bestaand record blijven behouden (import overschrijft geen handmatige keuzes).
- **Camera-toewijzing (bevestigd):** het systeem **leidt automatisch af** uit
  Cuescore's tafeltoewijzing per wedstrijd welke tafel bij welk event hoort
  (vanavond), met **handmatige override** in het dashboard. Vóór de loting is er
  nog geen toewijzing → standaard alle camera's / handmatig. Een tafel = één event
  tegelijk (conflict-waarschuwing bij overlap).

Standaard-instellingen (GET/POST /api/manage/defaults) — één set, toegepast bij
import:
{
  "enabled": true,
  "tafels": [1, 3, 15, 16],          // standaard alle camera's
  "preRollMinuten": 10,
  "overlays": { "sponsors": true, "scoreboard": true }
}

Ad-hoc stream (POST /api/manage/streams/start met een vrije camera):
- `tableNumber` verplicht; `title` optioneel (default `Tafel {nr}`).
- Een tafel is "vrij" als er nu geen geplande/lopende stream op draait.

## Interne opslag (Blob JSON — geen publiek endpoint, maar wel de bron voor /api/live)
- `config/tables.json`      — tafelconfig (zie GET /api/manage/config)
- `config/defaults.json`    — standaard-instellingen (één set, toegepast bij import)
- `planning.json`           — planning-records (Cuescore-import + overrides + ad-hoc)
- `broadcasts/<datum>.json` — per aangemaakte broadcast:
  { "tableNumber", "videoId", "broadcastId", "title", "scheduledStart" }
  Dit voedt GET /api/live (koppelt tafel -> videoId + titel + status).
- `commands.json`           — openstaande agent-commando's (wachtrij voor GET /api/agent/commands)
- `status.json`             — laatst gerapporteerde agent-status (uit POST /api/agent/status)
- `pauze-state.json`        — per tafel de pauzescherm-toestand ({ toestand: 'spelen'|'pauze',
  sinds, wachtSinds }) voor de auto-trigger (timer `pauzeScherm`, zie v0.12)
- `live-matches.json`       — { updatedAt, matches: { <tafelnr>: { playerA, playerB, scoreA,
  scoreB, status, round } | null } } — huidige Cuescore-wedstrijd per tafel (timer
  `liveMatches`), voedt het `match`-veld in GET /api/live (zie v0.13)
- `live-videos.json`        — { updatedAt, videos: { <tafelnr>: "<youtube-videoId>" } } —
  nu-actieve YouTube-stream per tafel (timer `liveVideos`, via liveBroadcasts.list op titel),
  voedt het `liveVideoId`-veld in GET /api/live (zie v0.14)

> Migratienoot: het simpele `config/schedule.json` (terugkerende regels uit #9)
> wordt vervangen door `config/defaults.json` (templates) + `planning.json`
> (werkelijke planning). De broadcast-Function (#9) gaat straks `planning.json`
> lezen i.p.v. `schedule.json`.

## Agent (fase 2, auth vereist)
De lokale OBS-agent maakt alleen **uitgaande** HTTPS-verbindingen: hij pollt
commando's op en stuurt status terug. Auth via een agent-token (Bearer).

GET /api/agent/commands  -> openstaande commando's (polling)
Antwoord:
{
  "commands": [
    { "id": "c1", "type": "startStream", "tableNumber": 1 },
    { "id": "c2", "type": "stopStream",  "tableNumber": 3 },
    { "id": "c3", "type": "setOverlay",  "tableNumber": 1, "sourceName": "Sponsor slideshow", "enabled": true }
  ]
}
- `type`: `startStream` | `stopStream` | `setOverlay`.
- `setOverlay` zet een OBS-bron (overlay/scoreboard) aan of uit (`enabled`).
- **Overlay-switch → OBS-bronnaam** (zie `docs/obs-standaard.md`), schakelbare overlays:
  `overlays.sponsors` → **`Sponsor slideshow`**; `overlays.scoreboard` → **`Scoreboard`**
  (officiële Cuescore-overlay: toernooikop + eigen scorebord); plus break-overlays
  `overlays.jumbotron`/`overlays.pauzemelding`.
  Per broadcast/live schakelbaar (dashboard). `Camera Tafel N` staat altijd aan (geen
  schakelaar). Per tafel te overrijden via `config/tables.json` (`overlaySources`).
- De agent bevestigt verwerkte commando's via de status-post (`verwerkteCommandoIds`),
  zodat de backend ze niet opnieuw stuurt.

POST /api/agent/status  -> OBS-/streamstatus per tafel + bevestigingen
Body:
{
  "agentTime": "2026-07-08T18:00:00Z",
  "verwerkteCommandoIds": ["c1", "c2"],
  "tables": [
    {
      "tableNumber": 1, "obsConnected": true, "streaming": true, "bitrateKbps": 9000,
      "resolution": "1920x1080", "fps": 60,
      "overlays": { "sponsors": true, "scoreboard": true }
    }
  ]
}
- `resolution` (`"WxH"`) en `fps` komen uit OBS (GetVideoSettings, output-resolutie).
  `overlays` = de werkelijke aan/uit-stand per overlaybron (GetSceneItemEnabled).
  Deze velden zijn optioneel; ontbreken → `/api/live` geeft `quality`/`overlays` = `null`.

## Wijzigingslog
- 2026-07-04: eerste concept v0.1 (Peter + Claude).
- 2026-07-08: v0.2 — sponsorveld verwijderd (titel = `Tafel {nr} {toernooinaam}`,
  toernooinaam is de volledige Cuescore-naam). Tafelconfig vereenvoudigd naar
  { tableNumber, streamId }. Schema-regelmodel toegevoegd (dagVanDeWeek, startTijd,
  tafels, toernooinaam-fallback, leadMinuten, actief). Interne Blob-JSON-opslag
  gedocumenteerd (tables/schedule/broadcasts) als bron voor /api/live. Reden:
  ontwerp #9 (broadcast-Function) + intake-besluit dat de titel 1-op-1 uit Cuescore
  komt.
- 2026-07-08: v0.3 — agent-protocol geconcretiseerd (t.b.v. #10). Commands
  `startStream`/`stopStream`/`setOverlay` (overlay/scoreboard aan-uit) en een
  status-post met `verwerkteCommandoIds` + per-tafel obsConnected/streaming/bitrate.
  Reden: OBS-agent skeleton + de per-tafel overlays (Sponsors, Cuescore-scoreboard).
- 2026-07-08: v0.4 — planning-model v2 (uitgebreid einddoel). **Alle** Mokum-
  toernooien uit Cuescore geïmporteerd; elk krijgt de standaard-instellingen
  (enabled=true, alle camera's, overlays aan, preRoll 10 min) en is per stuk
  aan/uit/aanpasbaar (planning-record: enabled, start/stop-override, preRollMinuten,
  tafels, overlay-switches). Eén set standaard-instellingen (`config/defaults.json`)
  i.p.v. per-weekdag-templates. Ad-hoc streams via `/api/manage/streams/start`
  (vrije camera, optionele titel, default `Tafel {nr}`). Nieuwe opslag
  `config/defaults.json` + `planning.json` (vervangt `config/schedule.json`).
  Endpoints `/api/manage/planning[/{id}]` en `/api/manage/defaults`. Bevestigd door
  Peter (8 juli): import-alles, standaard alle camera's, scorebord + sponsors aan,
  preRoll 10 min, ad-hoc titel `Tafel {nr}`.
- 2026-07-08: v0.5 — planning-record krijgt `type` (`tournament` | `competition`).
  Competities (leagues) komen via dezelfde import binnen (staan ook op de org-
  pagina) maar zijn **doorlopend** (meerdaagse span) → streameenheid = wedstrijden
  per avond; auto-stop per avond i.p.v. `status=Finished`. Camera-toewijzing bij
  overlappende events wordt **automatisch afgeleid uit Cuescore's tafeltoewijzing
  per wedstrijd** met handmatige override (bevestigd Peter). Per-avond-afleiding +
  dashboard nog uit te werken.
- 2026-07-09: v0.6 — overlay-switches gekoppeld aan de **definitieve OBS-bronnamen**
  na standaardisatie van alle 4 instanties: `sponsors` → `Sponsor slideshow`,
  `scoreboard` → `Scoreboard`. `Scores other tables` en `Cuescore logo` zijn vaste
  branding (niet per broadcast getoggeld). Reden: OBS-inrichting afgerond + Fase 1-test
  geslaagd (agent stuurt overlay aan/uit via obs-websocket). Alleen bronnaam-mapping
  gewijzigd; de record-velden (`sponsors`/`scoreboard`) blijven ongewijzigd.
- 2026-07-09: v0.7 — **beheer-endpoints hernoemd van `/api/admin/*` naar `/api/manage/*`**.
  Reden: `admin` is een **gereserveerde route-prefix** in Azure Functions (de host
  gebruikt `/admin/*` voor z'n ingebouwde beheer-API), waardoor alle functies met een
  `admin/...`-route werden geweigerd met "The specified route conflicts with one or more
  built in routes" → HTTP 404. Lokaal gereproduceerd met `func start`. Alleen de URL-prefix
  wijzigt (`config`/`planning`/`planning/{id}`/`defaults`/`streams/start`/`streams/stop`/
  `setup/streams`); payloads, functienamen en de interne `isAdmin`-auth blijven gelijk.
  Frontend (`frontend/src/api.js`) meegewijzigd.
- 2026-07-09: v0.8 — dashboard-bediening. `POST /api/manage/streams/start` accepteert nu
  optioneel `overlays` ({sponsors, scoreboard}) en enqueuet naast `startStream` ook
  `setOverlay`-commando's (via `startCommandsFor`). Nieuw: `POST /api/manage/streams/overlay`
  ({tableNumber, sponsors?, scoreboard?}) om overlays **live** op een lopende stream aan/uit
  te zetten. Reden: dashboard-bedienpaneel (start-wizard met YouTube-titel/privacy/overlays +
  losse overlay-toggles). Auth blijft placeholder Bearer ADMIN_TOKEN (Entra volgt fase 3).
- 2026-07-11: v0.9 — **twee extra schakelbare overlays**: `scoresOtherTables`
  (`Scores other tables`) en `cuescoreLogo` (`Cuescore logo`). De `overlays`-map op
  `/api/manage/streams/start` en de body van `/api/manage/streams/overlay` accepteren nu
  alle vier de sleutels (`sponsors`, `scoreboard`, `scoresOtherTables`, `cuescoreLogo`),
  elk standaard aan. `startCommandsFor` en het overlay-endpoint itereren nu over de
  `OVERLAY_BRON`-map i.p.v. hardcoded sponsors/scoreboard (extra overlay = alleen de map
  uitbreiden). Reden: Nick wilde `Scores other tables` en `Cuescore logo` ook per broadcast
  kunnen aan/uit zetten (voorheen bewust vaste branding, zie v0.6). `Camera Tafel N` blijft
  altijd aan (geen schakelaar). Front- en backend meegewijzigd; OBS-standaard ongewijzigd
  qua bronnamen.
- 2026-07-11: v0.10 — **live kwaliteit + overlay-standen zichtbaar in het dashboard**.
  De agent-statuspost (`/api/agent/status`) meldt per tafel nu ook `resolution`
  (`"WxH"`), `fps` en de werkelijke `overlays`-stand (map sleutel→bool, uit
  GetSceneItemEnabled). `GET /api/live` geeft per tafel een `quality`-blok
  (`{resolution, fps, bitrateKbps}`) en `overlays` door — beide `null` als de tafel
  niet live is of de agent (nog) niets meldt. Reden: dashboard toont echte
  beeldkwaliteit en of overlays daadwerkelijk aan/uit staan, i.p.v. alleen lokale
  "fire-and-forget"-toggles. Backend (`buildLiveTables`), agent (`obs.status` +
  overlay-uitlezen) en frontend meegewijzigd.
- 2026-07-11: v0.11 — **twee break-overlays**: `jumbotron` (`Jumbotron` — alle tafels
  live via de Cuescore venue-URL) en `pauzemelding` (`Pauzemelding` — tekst/overlay
  "We wachten op de volgende wedstrijd…"). Beide staan **standaard UIT** (alleen tijdens
  pauzes tonen), i.t.t. de content-overlays die standaard AAN staan. Backend introduceert
  `OVERLAY_DEFAULT_OFF` zodat `startCommandsFor` deze bij een start expliciet op `false`
  zet (tenzij anders gevraagd). Front- en backend + agent-overlaybronnen meegewijzigd.
  Reden: pauze-beleving (zie `docs/break-productie.md` voor de bredere break-productie
  incl. NDI-PiP-rotatie, later). `Camera Tafel N` blijft altijd aan.
- 2026-07-11: v0.12 — **automatisch pauzescherm (A auto-trigger)**. Nieuwe timer-Function
  `pauzeScherm` (elke 30s) leest via Cuescore of er per tafel een wedstrijd loopt; zo niet
  (na 20s debounce) → enqueuet `setOverlay`-commando's die `jumbotron` + `pauzemelding` AAN
  zetten; zodra er weer gespeeld wordt → uit. Geen nieuw endpoint: hergebruikt het bestaande
  command-model; de agent voert de setOverlays uit. Nieuwe schakelaar **`PAUZESCHERM_AUTO`**
  (default `false`, los van `AUTOMATION_ARMED` want het maakt geen broadcasts) — draait
  bovendien alleen op tafels die de agent als `streaming` meldt (dubbel veilig). Toestand
  per tafel in `pauze-state.json`. Zie `docs/pauzescherm-auto.md`. Pure logica
  (`src/planning/pauze.js`) unit-getest; dashboard-weergave van match-status volgt later.
- 2026-07-12: v0.13 — **live match-status per tafel in het dashboard**. Nieuwe timer
  `liveMatches` (elke min) haalt via Cuescore de huidige wedstrijd per cameratafel op
  (`bouwLiveMatches`) en schrijft `live-matches.json`. `GET /api/live` geeft nu per tafel
  een `match`-veld door ({playerA, playerB, scoreA, scoreB, status, round} | null) — **los
  van onze eigen broadcast-status**, zodat het dashboard óók toont wat er speelt terwijl
  streams handmatig lopen. Puur lees-werk (geen streams) → veilig tijdens een toernooi.
  Frontend toont de live wedstrijd op de tafelkaart. Reden: A-verfijning + nuttig overzicht.
- 2026-07-12: v0.14 — **live YouTube-stream in het dashboard**. Nieuwe read-only
  functie `listActiveBroadcasts` (liveBroadcasts.list, broadcastStatus=active, mine=true)
  + timer `liveVideos` (elke min) koppelt actieve broadcasts per tafel op titel
  (`koppelVideosAanTafels`, "Tafel {nr} …") → `live-videos.json`. `GET /api/live` geeft
  per tafel een **`liveVideoId`** door — óók voor handmatig gestarte streams. Frontend:
  **stream-paneel met tafel-switcher** onder het overzicht (YouTube-embed, gedempt) om
  overlay-wijzigingen op het beeld te controleren (met de normale YouTube-vertraging).
  Reden: visuele controle + opstap naar volledig dashboard-beheer van de streams.
- 2026-07-12: v0.15 — **zaal-live-teller + "Wat komt eraan" in het dashboard** (#24, #21).
  Timer `liveMatches` telt nu álle lopende wedstrijden in de zaal (`telZaalLive`, over alle
  toernooien) en schrijft dat als `venueLive` naar `live-matches.json`. `GET /api/live` geeft
  dat top-level als **`venueLive`** door (null = onbekend). Frontend: het overzicht toont
  "X wedstrijden live in de zaal", en een read-only **"Wat komt eraan"**-blok voedt zich uit
  `GET /api/schedule` (bestaand endpoint, `getSchedule`). Reden: context over de hele zaal +
  zicht op de planning, zonder nieuw koppelvlak.
- 2026-07-12: v0.16 — **analytics + SEO fase 1/3 (#18)**. Nieuw **`POST/GET /api/hit`**
  (publiek, cookieloze bezoek-/QR-teller → `stats/hits.json` via ETag-veilige `updateJson`)
  en **`GET /api/manage/stats`** (beheer, opgetelde cijfers). De QR-overlay linkt nu met
  UTM (`utm_source=stream&utm_medium=qr&utm_campaign=standen`) en de `/standen`-pagina meldt
  een bezoek via `navigator.sendBeacon`. Broadcasts krijgen automatisch een **beschrijving**
  (`buildBroadcastDescription`) met een UTM-link naar `/standen` + het kanaal, als
  verkeer-drijver. Reden: meetbaar maken van QR-scans/bezoek en verkeer van YouTube naar de
  site sturen — fundament voor het centrale mokum-bot-dashboard (fase 4).
- 2026-07-12: v0.17 — **publieke pagina hernoemd `/standen/` → `/mokumlive/`**. De pagina
  heet nu "Mokum Live" (gecentreerde titel + subtitel "Standen en livestreams"). Op `/standen/`
  staat een redirect-stub (behoudt query/hash) zodat bestaande QR-codes en al-geplaatste
  YouTube-beschrijvingen blijven werken. Bijgewerkt: QR-overlay + broadcast-beschrijving
  (`buildBroadcastDescription`) linken nu naar `/mokumlive/` (utm_campaign=mokumlive), PWA-
  manifest (start_url/scope `/mokumlive/`), en de teller-bron `page=mokumlive`.
- 2026-07-13: v0.18 — **overlays `scoresOtherTables` + `cuescoreLogo` verwijderd** + **agent
  loop-proof**. De officiële Cuescore-scoreboard-overlay dekt zowel "andere tafels" als het
  logo, dus de aparte OBS-bronnen `Scores other tables` én `Cuescore logo` zijn uit OBS + uit
  `OVERLAY_BRON` + het dashboard + de agent-rotatie gehaald. `/api/live` `overlays` en de
  start/overlay-body's hebben `scoresOtherTables`/`cuescoreLogo` niet meer. **Robuustheid:** de agent behandelt "bron niet gevonden" nu als **permanente** fout
  (`SOURCE_NOT_FOUND`) en **dropt** zo'n commando (met `[DROP]`-log) i.p.v. het eeuwig te
  herproberen — één verkeerde toggle kan de agent niet meer in een lus houden. Terug te
  zetten: bron + sleutel in `OVERLAY_BRON`/agent/frontend weer toevoegen.
- 2026-07-14: v0.19 — **handmatige planning-refresh**. Nieuw **`POST /api/manage/planning-refresh`**
  (beheer) draait de Cuescore-import (`verwerk` uit `importPlanning`) direct i.p.v. te wachten op
  de uurlijkse timer, werkt `planning.json` bij en geeft `{ imported, total, items }` terug
  (`items` = zelfde vorm als `GET /api/schedule`). Reden: de "Stream Agenda" op het dashboard bleef
  leeg omdat `planning.json` in productie nog niet gevuld was; met een **"Ververs"-knop** kan de
  beheerder de import forceren én meteen zien of Azure Cuescore kan bereiken. Bij een import-fout
  antwoordt het endpoint `502` met de foutmelding. Front- (`refreshPlanning` + knop in Stream Agenda)
  en backend meegewijzigd; `verwerk` geeft nu een resultaat-object terug.
- 2026-07-14: v0.20 — **Toernooi planner, fase 1** (EPIC #42). Het planning-record krijgt twee
  velden: **`visibility`** (`public`|`unlisted`|`private`, default `public` — YouTube-zichtbaarheid van
  de geplande broadcast) en **`planned`** (bool, default `false` — de per-toernooi "scherp"-vlag die
  pas op `true` gaat na bevestigen in de planner). `POST /api/manage/planning/{id}` accepteert deze nu
  ook (whitelist `TOEGESTAAN` uitgebreid; `visibility` valt terug op `public` bij onbekende waarde).
  Frontend: "Stream Agenda" is vervangen door een full-width **"Toernooi planner"** (uitklapbaar) die
  de eerstvolgende ~10 toernooien toont met dropdowns voor Tafels/Zichtbaarheid/Overlays + een
  **Plan-knop → bevestigingsdialoog** die `planned:true` + de gekozen instellingen opslaat. **Fase 1
  zet nog niets automatisch live** — `createBroadcasts`/`checkStops` gaan pas op `planned` reageren in
  fase 2/3. Overlays via presets (Alle/Alleen scorebord/Geen) → bestaande `overlays`-map.
- 2026-07-14: v0.21 — **Toernooi planner, fase 2: automatische start** (EPIC #42). `planningDue`
  vereist nu **`planned === true`** — alleen expliciet ingeplande toernooien maken automatisch een
  broadcast (concept-records worden overgeslagen). `createBroadcasts` geeft de gekozen
  **`visibility`** door aan de YouTube-broadcast (i.p.v. altijd public). **Veilige uitrol:** de
  master-schakelaar **`AUTOMATION_ARMED`** blijft de harde voorwaarde — staat die op `false` (default)
  dan gebeurt er niets, ongeacht `planned`. Pas ná een droge test zet je 'm éénmalig op `true`; daarna
  is het "plannen = draait" zonder verder te schakelen. Auto-stop van ingeplande toernooien volgt in
  fase 3 (`checkStops`). Tafel-herresolutie uit de actuele Cuescore-matches: fase 4.
- 2026-07-14: v0.22 — **Toernooi planner, fase 3: automatische stop** (EPIC #42). `shouldStop`
  (gebruikt door `checkStops`) krijgt een **eind-tijd-vangnet**: een ingepland enkeldaags toernooi
  stopt sowieso zodra **`plannedStop`** (de Cuescore-eindtijd) voorbij is — óók als Cuescore
  onbereikbaar is of de status niet op `Finished` springt. Primair blijft `tournament.finished === true`;
  het vangnet is de extra veiligheid (geldt niet voor competities, die hun per-avond-logica houden).
  Nog steeds achter de master-switch `AUTOMATION_ARMED` (veilige uitrol). Daarmee is de auto-cyclus
  compleet: plannen → automatisch starten (fase 2) → automatisch stoppen (fase 3).
