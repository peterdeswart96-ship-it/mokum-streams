# API-contract — Mokum Streams

Enige waarheid voor de koppelvlakken tussen frontend/widget, backend en (later) de
agent. Wijzigen? Eerst dit bestand bijwerken (met datum + reden onderaan), dan code.

Status: CONCEPT v0.67 — velden worden definitief in fase 2.

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
      "liveVideoId": "yX9SYqMXYrM" | null,
      "competitie": { "niveau": "Eerste Klasse", "toernooiId": 83574424, "matchId": 88251085, "thuisteam": "Restless", "uitteam": "Mokum Remastered", "klaarSinds": "2026-09-17T21:40:00Z" | null, "stopOm": "2026-09-17T21:45:00Z" | null } | null   // v0.62: alleen bij een actieve competitiestream met bekend niveau
    }
  ]
}

GET /api/schedule?days=7
Antwoord: { "items": [ { "date", "startTime", "tournamentName", "tableNumbers": [..] } ] }

GET /api/pauze/posters
Antwoord:
{
  "generatedAt": "2026-08-09T18:00:00Z",
  "posters": [
    {
      "naam": "poster-10ball.png",
      "url": "https://mokumstreams2945.blob.core.windows.net/pauze-posters/poster-10ball.png",
      "tot": "2026-09-01" | null,     // laatste dag dat de poster meedraait; null = blijft hangen
      "volgorde": 1                    // oplopend; gelijke/ontbrekende waarden → op bestandsnaam
    }
  ]
}
- Publiek, geen auth. Voedt de poster-fase van de jumbotron-kaart (#96).
- Bron: container `pauze-posters` op het opslagaccount, blob-niveau openbaar leesbaar. De
  lijst wordt server-side opgehaald (connectionstring), dus de container zelf is NIET te
  listen van buitenaf — alleen de URL's die dit endpoint teruggeeft zijn bereikbaar.
- `tot` en `volgorde` komen uit de **blob-metadata**, in te stellen in de Azure Portal zonder
  het bestand te hernoemen. Datums in `YYYY-MM-DD`, uitgelegd in Europe/Amsterdam.
- **Het endpoint filtert zelf**: alleen posters waarvoor vandaag tussen `van` en `tot` valt
  komen in de lijst. Zo hoeft de pauzekaart niets van datums te weten en zie je in het
  antwoord meteen wat er hoort te draaien. Een blob met onleesbare datum-metadata wordt
  behandeld alsof de datum er niet staat (liever tonen dan stilletjes verdwijnen).
- Server-cache in blob `posters.json`, ~30 min vers — vier OBS-instanties vragen tegelijk
  (zelfde patroon als `/api/sheets`, vgl. #94).
- Lege lijst is een geldig antwoord: de kaart slaat de poster-fase dan over.

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
POST /api/manage/streams/start       -> body: { "tableNumber": 15, "title"?: "...", "privacy"?: "public|unlisted|private", "overlays"?: { "sponsors": true, "scoreboard": true, "jumbotron": false }, "tournamentId"?: 83049058, "streamType"?: "challenge|competitie", "spelerA"?: "...", "spelerB"?: "...", "matchId"?: 88259371, "niveau"?: "Eerste Klasse", "thuisteam"?: "...", "uitteam"?: "..." } (vrije camera; enqueuet startStream + setOverlay per overlay. Mét tournamentId = beheerd, zonder = ad-hoc)
GET  /api/manage/competitie/wedstrijden -> aankomende teamwedstrijden die BIJ MOKUM gespeeld worden (bron: mokum-competitie-API), voor de competitie-wizard; vorm zie v0.58 in de wijzigingslog
POST /api/manage/streams/stop        -> body: { "tableNumber": 15 }
POST /api/manage/streams/overlay     -> body: { "tableNumber": 15, "sponsors"?: bool, "scoreboard"?: bool, "jumbotron"?: bool, "competitie"?: bool } (overlay(s) live aan/uit op een lopende stream; enqueuet setOverlay per opgegeven sleutel)
   NB: content-overlays (sponsors/scoreboard) staan standaard AAN;
   break-overlays (jumbotron) staan standaard UIT (alleen tijdens pauzes tonen).
   Ook `competitie` (OBS-bron `Competitiestand`, v0.62) staat standaard UIT.
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
  "plannedStop":  "2026-07-14T21:00:00Z",   // uit Cuescore (.stoptime), kan null zijn — plaatsvuller,
                                            // stuurt sinds v0.45 NIET de auto-stop (zie #76)
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
  uit te werken). **`plannedStop` telt hierin niet mee** (v0.45, #76): dat veld is
  een Cuescore-plaatsvuller. Bovendien stopt géén enkele automatische regel een tafel
  zolang Cuescore daar een wedstrijd met status `playing` op meldt; het laatste
  vangnet is de nachtstop van 02:00.
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
  (officiële Cuescore-overlay: toernooikop + eigen scorebord); plus de break-overlays
  `overlays.jumbotron` en `overlays.competitie`.
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
- 2026-07-15: v0.23 — **nachtelijke veiligheids-stop** (`nachtStop`, timer elke 30 min). Na
  sluitingstijd (default **02:00** Amsterdam, t/m 08:00) stopt 'ie **ALLE** nog-lopende streams —
  óók handmatig gestarte (adhoc) — door per tafel een `stopStream` te enqueuen en de entry als
  `stopped` te markeren. Checkt zowel de store van vandaag als gisteren (een avondstream zit na
  middernacht nog in gisteren's `broadcasts/<datum>.json`). Bewust **NIET** achter `AUTOMATION_ARMED`
  (stoppen is altijd veilig; dit is juist het vangnet). Aanpasbaar via app-settings
  `NACHT_STOP_SLUITING_MIN` / `NACHT_STOP_OCHTEND_MIN`. Reden: op 14-07 bleven streams 's nachts
  doorzenden met een bevroren beeld; dit garandeert dat er nooit meer iets blijft hangen. Pure logica
  (`src/planning/nachtstop.js`) unit-getest.
- 2026-07-15: v0.24 — **agent-heartbeat / "agent offline"-indicator**. `GET /api/agent/commands` schrijft
  bij elke poll (~3s) een hartslag naar `agent/heartbeat.json` (geen agent-wijziging nodig). `GET /api/live`
  geeft nu een top-level **`agent`**-veld door: `{ online, lastSeenAt, secondsAgo }`, met `online` = laatste
  contact < 20s geleden. Frontend: een duidelijke **rode balk "Agent offline"** bovenaan het dashboard als
  de OBS-pc niet reageert (starten/stoppen werkt dan niet), en een subtiel groen "Agent online" als 't goed
  is. Reden: op 14-07 zag je pas via Remote Desktop dat de pc offline was; nu meldt het dashboard het direct.
- 2026-07-15: v0.25 — **zichtbaarheid van de live stream + privacy-filter Mokum Live**. `listActiveBroadcasts`
  haalt nu ook `status.privacyStatus` op; `koppelVideosAanTafels` levert per tafel `{ videoId, visibility }`
  (i.p.v. alleen videoId) → `live-videos.json`. `GET /api/live` geeft per tafel een nieuw veld
  **`liveVisibility`** (`public`|`unlisted`|`private`|null) naast `liveVideoId` (met compat voor de oude
  string-vorm). **Mokum Live** (`/mokumlive`) embedt de stream nu alléén als `liveVisibility === 'public'`
  — verborgen/privé-streams verschijnen niet meer op de publieke pagina (was een lek). Dashboard: toont een
  **zichtbaarheid-badge + tooltip** op een live tafelkaart, en de **"● LIVE"-badge + YouTube-gloed zijn groen**
  (was rood). Reden: Peter zag een als Verborgen aangemaakte teststream tóch op Mokum Live.
- 2026-07-15: v0.26 — **fix: stream stopbaar over middernacht heen** (bug 15-07). De broadcasts-store is
  per dag (`broadcasts/<datum>.json`); een stream die na 00:00 doorloopt verdween uit `GET /api/live`
  (status `offline`, geen Stop-knop) terwijl 'ie op YouTube gewoon live was. `buildLiveTables` behandelt een
  tafel nu ook als **`live`** als de agent `streaming` meldt of YouTube een actieve broadcast heeft
  (`liveVideoId`) terwijl er **geen store-entry** is (`!b`) — dan valt `videoId` terug op `liveVideoId`, en
  `quality`/`overlays` volgen de agent-status. Een expliciet gestopte entry (`stopped:true`) blijft `offline`.
  Gevolg: het dashboard toont zo'n stream weer als live + met een werkende Stop-knop, ongeacht de opslag-datum.
- 2026-07-18: v0.27 — **pre-flight camera-check vóór automatische start** (#43, blok A3 van de
  arming-roadmap). Voorkomt dat een bevroren/dode camera (storing 15-07) onbewaakt de lucht in gaat.
  - **Commando:** `startStream` krijgt een optioneel veld **`preflight: true`**. Alleen de
    timer-automatisering (`createBroadcasts`) zet het; **handmatige** starts vanaf het dashboard
    (`/api/manage/streams/*`) laten het weg — daar kijkt een mens naar de preview.
  - **Agent:** bij een `startStream` met `preflight` maakt de agent eerst twee kleine
    schermafbeeldingen van de camerabron (config `cameraSource`, default `Camera Tafel <nr>`) en
    vergelijkt ze. Verschillend → live → starten. Identiek (bevroren) of geen beeld → **niet
    starten en het commando NIET bevestigen**, zodat het de volgende poll opnieuw probeert (de
    camera kan herstellen, zeker met auto-reconnect A2).
  - **Agent-status** (`POST /api/agent/status`, per tafel): twee nieuwe **optionele** velden
    **`preflightFailed: true`** + **`preflightReason: <tekst>`** wanneer een auto-start op de
    cameracheck strandt — bedoeld als bron voor een dashboard-alarm (frontend nog te doen).
    Beide velden ontbreken bij een geslaagde of handmatige start.
- 2026-07-18: v0.28 — **freeze-watchdog: bevroren camera automatisch herstellen** (#43, blok A2).
  Draait in de agent voor **élke** streamende tafel (ook handmatig gestarte streams — de storing
  van 15-07 was een handmatige stream). Periodiek (throttled) maakt de agent twee schermafbeeldingen
  van de camerabron en vergelijkt ze; na **`herstelNa`** opeenvolgende bevriezingen (debounce tegen
  flukes) forceert hij een herlading van de bron — media-herstart, met terugval op het opnieuw
  toepassen van de instellingen (het equivalent van handmatig *Properties → OK*).
  - **Agent-config:** optioneel **`cameraWatchdog`** — `null`/afwezig = **uit** (standaard, tot
    validatie op echte camera's). Aanzetten met bijv. `{ "intervalMs": 30000, "herstelNa": 2 }` of
    `true` (defaults). Reden voor default-uit: een vals-positieve bevriezing zou een korte herlading
    (hapering) geven.
  - **Agent-status** (`POST /api/agent/status`, per tafel): optionele velden **`cameraFrozen: true`**
    + **`cameraRecovered: true|false`** + **`cameraReason: <tekst>`** wanneer de watchdog een
    bevriezing behandelde — bron voor een dashboard-alarm (frontend nog te doen). Ontbreken normaal.
- 2026-07-18: v0.29 — **zaalbreed tafelraster in `GET /api/live`** (#54, eigen Mokum-jumbotron).
  `GET /api/live` krijgt een array **`venueTables`**: per fysieke tafel (over álle toernooien van
  vandaag, niet alleen de cameratafels) de meest relevante wedstrijd. Elk item:
  `{ table, status, round, tournament, playerA, playerB, scoreA, scoreB }`, waarbij
  **`playerA`/`playerB`** objecten zijn: **`{ name, image, flag }`** (`image` = spelersfoto-URL,
  `flag` = landvlag-URL, beide uit de Cuescore-API en mogelijk `null`). Een **lopende**
  (`playing`) wedstrijd wint van een afgeronde; tafels zonder toegewezen wedstrijd vallen weg;
  gesorteerd op tafelnummer. Gevoed door de `liveMatches`-timer (`bouwZaalRaster` → `live-matches.json`).
  Leeg (`[]`) tot die timer draait. Vervangt de Cuescore-jumbotron (met zijn onverwijderbare
  instellingenvenster) door een eigen raster in de Mokum-huisstijl in het pauzescherm-deck.
- 2026-07-19: v0.30 — **camera-alarm per tafel in `GET /api/live`** (#40-prep, observability).
  Elke tafel in `tables[]` krijgt een veld **`cameraAlarm`**: `null` als er niks is, anders
  `{ type: 'preflight'|'frozen', reason, recovered }`. Bron: de agent-status (v0.27 pre-flight
  `preflightFailed`/`preflightReason` + v0.28 freeze-watchdog `cameraFrozen`/`cameraRecovered`/
  `cameraReason`), samengevat door `buildLiveTables`. `preflight` = een automatische start werd
  uitgesteld omdat de camera niet live is; `frozen` = de camera bevroor tijdens een stream
  (`recovered` geeft aan of het herstel lukte). Het dashboard toont dit als waarschuwing op de
  tafelkaart + een samenvatting bovenaan — bedoeld om onbewaakt auto-streamen observeerbaar te maken.
- 2026-07-19: v0.31 — **nieuw agent-commando `refreshSource`** (#54). `{ type:'refreshSource',
  tableNumber, sourceName }` — de agent drukt de "Refresh cache of current page"-knop van de
  browserbron in (`PressInputPropertiesButton` → `refreshnocache`). Gebruikt om het
  Cuescore-scorebord opnieuw te laten laden zodat oude toernooi-info verdwijnt. De
  pauze-automatiek stuurt dit bij **elke play/pauze-omslag** voor de bronnen in de nieuwe
  app-setting **`PAUZESCHERM_REFRESH`** (komma-gescheiden, standaard leeg; zet op `scoreboard`).
  Een oudere agent die het type niet kent, dropt het commando netjes (geen fout).
- 2026-07-19: v0.33 — **podium-eindscherm in `GET /api/live`** (#54, winnaar-moment).
  `GET /api/live` krijgt een top-level veld **`podium`**: `null` als er niks te tonen is,
  anders `{ tournamentName, podium: [ { positie, medaille, speler } ] }`. Elke plek:
  **`positie`** (1|2|3), **`medaille`** (`'goud'|'zilver'|'brons'`) en **`speler`**
  `{ name, image, flag }` (foto-/vlag-URL uit Cuescore, mogelijk `null`). Afgeleid uit de
  wedstrijden: winnaar Finale = 1e, verliezer Finale = 2e, beide halvefinale-verliezers =
  gedeeld 3e (`podiumVan`). De keuze (`podiumVoorZaal`) kijkt **uitsluitend naar de cameratafels**
  (besluit 19-07): het podium verschijnt zodra **geen cameratafel meer speelt** én er een
  afgerond, gefilmd toernooi met gespeelde finale is — losse challenges/niet-camera­tafels tellen
  niet mee; bij meerdere de laatste. Gevoed door de `liveMatches`-timer (`live-matches.json`),
  `null` tot die draait of zolang een cameratafel nog speelt. Het pauzescherm (jumbotron-overlay) toont bij
  een niet-lege `podium` een medaillescherm met de spelersfoto's + confetti/laser (finalewinnaar
  extra) i.p.v. het roterende tafelraster.
- 2026-07-21: v0.34 — **beheerde streams: toernooi koppelen bij handmatige start** (#40/#56).
  `POST /api/manage/streams/start` accepteert optioneel **`tournamentId`** (Cuescore-id). Met
  koppeling wordt de broadcast **beheerd** (`adhoc: false`, `tournamentId` opgeslagen): de
  auto-stop (checkStops, podium-grace) mag 'm na de finale sluiten, en de nieuwe **finalize-timer**
  (`finalizeVideos`, elke minuut, gated op `AUTOMATION_ARMED`) zet er automatisch de thumbnail +
  hoofdstukken op zodra 'ie gestopt is (idempotent via `finalized`). Zonder `tournamentId` blijft
  de stream ad-hoc (handmatig sluiten, geen finalize). De wizard stuurt het gekozen toernooi uit
  de dropdown mee. Nieuw hulp-endpoint **`GET /api/manage/video?videoId=`** (admin) geeft
  titel/starttijd van een video terug — om er één te identificeren vóór handmatig finaliseren.
- 2026-07-23: v0.35 — **ad-hoc streams doen mee met de automatisering** (#69). Twee fixes na het
  incident van 22-07 (tafels handmatig gestart, nooit automatisch gesloten, geen medaillescherm,
  geen thumbnail/hoofdstukken):
  1. **Cuescore-import zag nooit iets.** De toernooien-pagina staat standaard op "Active/Finished"
     (`s=2`); toernooien die nog moeten beginnen staan onder **"Upcoming" (`s=0`)**. We halen nu
     **beide** weergaven op (`getTodaysTournamentIds` + `getUpcomingTournaments`), zodat een
     toernooi van vanavond al vóór de start bekend is. Faalt één weergave, dan werken we door met
     de andere. Geverifieerd: 0 → 8 toernooien in het venster van 14 dagen.
  2. **Automatische koppeling van ad-hoc streams.** `checkStops` koppelt een handmatig gestarte
     stream (`adhoc: true`, `tournamentId: null`) alsnog aan het Cuescore-toernooi dat op die tafel
     speelt (`backend/src/planning/koppel.js`, puur + getest). Lukt dat, dan wordt de entry
     **beheerd** (`adhoc: false`, `tournamentId` gezet, extra veld **`autoGekoppeld`** =
     ISO-tijdstip) en loopt de bestaande keten door: podium-grace → `stopStream` → `finalizeVideos`
     (thumbnail + hoofdstukken). Bewust conservatief: alleen bij een **ondubbelzinnige** match
     (het toernooi dat nú op die tafel speelt, of precies één toernooi met wedstrijden op die tafel
     die dag) — anders blijft de stream handmatig. Een automatisch gekoppelde tafel sluit pas als er
     die dag ook in een **ander** toernooi niets meer op die tafel staat (twee qualifiers op één avond).
  3. **Podium-grace van 60s → 180s**, instelbaar via app-setting **`PODIUM_GRACE_SEC`**. De keten
     liveMatches (1×/min) → pauzescherm (debounce 20s) → overlay-poll had aan één minuut te weinig
     om het medaillescherm daadwerkelijk op de uitzending te krijgen vóór de stop.
- 2026-07-23: v0.36 — **Wedstrijd-archief + zoekmachine (#59/#67)**. Elke gefilmde wedstrijd wordt
  vastgelegd met een deep-link naar het exacte moment in de video, zodat je terug kunt zoeken wat
  je gespeeld hebt (en kunt filteren op bijv. run-outs).
  - **`GET /api/archief?limit=`** (publiek) → `{ generatedAt, aantal, items: [...] }`. Eén item =
    `{ videoId, url, offsetSec, datum, tafel, toernooi, tournamentId, ronde, spelers: [a,b],
    score: [a,b], runouts: [{ speler, aantal }] }`. `url` = `https://youtu.be/<videoId>?t=<offsetSec>`.
    Zonder `limit` komt het hele archief mee (paar honderd kB) — de zoekmachine haalt het één keer
    op en filtert **in de browser**, dus geen call per toetsaanslag.
  - **`GET /api/runouts?limit=`** (publiek, default 50, max 500) → hetzelfde archief gefilterd op
    run-outs, één regel per speler-met-run-out: `{ …, speler, tegenstander, aantal }`.
  - **`POST /api/manage/archief/rebuild`** (admin) → herbouwt de aggregatie-blob `archief.json` uit
    alle `video-index/`-records + Cuescore. Kost **geen YouTube-quota**. Nodig als eenmalige
    backfill en als vangnet; de finalize-keten werkt het archief daarna per video bij (idempotent).
  - Koppeling wedstrijd ↔ moment gaat via het **spelerspaar** uit de bewaarde hoofdstukken
    (`video-index/<videoId>.json`), dus dit werkt ook voor video's die al eerder gefinaliseerd zijn.
  - `normalizeMatch` neemt voortaan **`runoutsA`/`runoutsB`** mee uit de Cuescore-API.
  - CORS-allowlist gelijk aan `/api/live`. YouTube kent geen clip-/timestamp-playlists
    (startAt/endAt afgeschaft), vandaar deep-links; echte clips zijn #67 fase 2 (1.600 quota/upload).
- 2026-07-23: v0.37 — **run-out-precisie + soort-filter (#67)**. Drie correcties op het archief
  na test met echte data:
  1. **Run-out linkt naar het rack, niet naar de partij.** Cuescore houdt per wedstrijd een
     rack-log bij (`notes`: "frame start" / "B frame win runout", met tijdstempel).
     `normalizeMatch` geeft die mee als **`runoutRacks: [{ kant, start, eind, duurSec }]`**.
     Een archiefregel heeft nu `runouts: [{ speler, offsetSec, url, exact }]` — één per
     gewonnen rack, met een eigen moment. Zonder rack-log (oudere data) valt 'ie terug op
     het begin van de partij met `exact: false`.
  2. **Valse run-outs eruit.** Een rack korter dan **30 s** telt niet mee: als de teller de
     stand achteraf in één keer intikt, logt Cuescore racks van tienden van seconden.
     Gemeten over 590 racks: mediaan 205 s, alles onder 30 s zat in dat ingetikte cluster.
     Is er wél een log maar blijft er niets over, dan géén terugval op `runoutsA/B` — die
     tellers komen uit dezelfde tikken.
  3. **Hoofdstukken begrensd op de videolengte** (`hoofdstukData(..., { eindISO })`, gevoed uit
     `video.actualEndTime`). Een afgebroken stream kreeg anders alle wedstrijden van die tafel
     als hoofdstuk, wat elke partij dubbel in het archief zette. De herbouw filtert bestaande
     records alsnog op de echte duur (`videos.list`, 1 quota-eenheid per 50 id's).

  Verder heeft elke archiefregel nu **`soort`**: de toernooi-serie los van seizoen/editienummer
  ("Fluke ranking 9ball Seizoen 3 #24" → `"Fluke Ranking"`), afgeleid met dezelfde
  `templateVoorToernooi`-classificatie als de thumbnails. De archiefpagina filtert daarop, zodat
  de keuzelijst 6 opties heeft in plaats van ruim honderd. Onbekende series → `"Overig"`.
- 2026-07-23: v0.38 — **Ticker op het pauzescherm (#65)**. `GET /api/live` krijgt er een veld
  **`ticker: string[]`** bij: de regels die onderin de jumbotron voorbij scrollen. Leeg in de
  opslag → de backend geeft de standaardregel `"Waiting for next match..."` terug, zodat de
  overlay nooit een lege balk toont. Beheer via **`GET /api/manage/ticker`** en
  **`POST /api/manage/ticker`** (admin, body `{ regels: string[] }`) → opgeslagen als
  `ticker.json`. Regels worden genormaliseerd: getrimd, lege regels weg, maximaal 20 regels
  van elk 200 tekens. Bewust géén scores in de ticker — die staan al in de tafelkaarten.
  De jumbotron-slide leest het veld uit de bestaande 15s-poll (geen extra verzoek). De balk is
  verankerd aan de ONDERRAND van het beeld (onderin de middengang tussen de twee tafels) en in
  OBS bij te stellen met de URL-parameters `?tickerOnder=` (afstand tot de onderrand),
  `?tickerBreedte=`, `?tickerHoogte=` en `?tickerSnelheid=` (px/s). Kale getallen gelden als
  pixels, procenten schalen mee met het venster.
- 2026-07-23: v0.39 — **Clipvensters voor run-out-highlights (#71)**. Elke run-out in
  `GET /api/runouts` (en in `runouts[]` op een archiefregel) heeft er drie velden bij:
  **`eindSec`** (moment waarop het rack gewonnen werd) en **`clipVan`/`clipTot`** — het
  venster om af te spelen. De rackduur telt vanaf het einde van het vórige rack, dus de
  clipvenster is het rack tot even na de laatste bal, **hoogstens de laatste 3 min**:
  `clipVan = max(rackstart, eind − 180s)`, `clipTot = eind + 4s`. Kort rack → helemaal (met
  afstoot); lang rack → de laatste 3 min (afstoot valt weg, die clip keur je af). Zonder
  rack-log (2 van de 131) blijven ze `null` —
  die zijn niet af te spelen. Gemeten: 129 clips, mediaan 154s, kortste 38s.
  Afspelen gebeurt met een **ingesloten YouTube-speler** (`start`/`end` werken daar wél; het
  zijn `startAt`/`endAt` op playlist-items die zijn afgeschaft), dus zonder knippen of
  her-uploaden. Alle 61 video's met run-outs zijn openbaar én insluitbaar (geverifieerd).
  Testpagina voor OBS: `frontend/public/pauze/highlight-test.html` (`?debug=1` toont de
  speler-status, `?aantal=` het aantal clips in de roulatie).
- 2026-07-23: v0.40 — **Keuring van highlight-clips (#71)**. Niet elke run-out levert bruikbaar
  beeld op (pauzescherm in beeld, camera de verkeerde kant op), dus clips worden vooraf
  goedgekeurd en de uitzending speelt uitsluitend wat is goedgekeurd.
  - **`GET /api/highlights?limit=`** (publiek) → alleen goedgekeurde clips, plus de tellers
    `{ totaal, goed, afgekeurd, tekeuren }`.
  - **`GET /api/manage/highlights`** (admin) → álle clips met `sleutel` en
    `keuring: "goed" | "afgekeurd" | null`.
  - **`POST /api/manage/highlights`** (admin) → body `{ sleutel, status }` met status
    `"goed"`, `"afgekeurd"` of `null` (oordeel terugdraaien).
  - Sleutel per clip = **`<videoId>:<offsetSec>`** (het rack-moment, v0.41 — niet meer de
    start van het clipvenster, zodat een aangepast venster het oordeel niet wist). Blijft
    gelijk bij een herbouw van het archief. Opslag: `highlight-keuring.json`.
  - Keuringspagina: `frontend/public/keuring/` — clip voor clip bekijken en met de pijltjes
    (of J/N) goed- of afkeuren. Gebruikt hetzelfde admin-token als het dashboard
    (localStorage `mokum_admin_token`).
- 2026-07-23: v0.41 — **highlight-clips: hele rack + eigen startseconde (#71)**. Peter keurde
  43 van de 129 clips af; veel hadden een lang rack waarbij de afstoot buiten beeld viel door
  de 150s-trim. Cap verruimd naar **180s** (max 3 min): korte racks spelen nu helemaal
  inclusief afstoot, lange blijven getrimd (die keur je af). Voor de uitschieter kan de start
  per clip met de hand: `POST
  /api/manage/highlights` accepteert nu **`start`** (beginseconde in de video; `null` = terug
  naar het rack-moment), naast `status`. De keuringspagina heeft daarvoor knoppen (`[` / `]` =
  −5/+5s, `0` = standaard). De keuring-sleutel hangt voortaan aan het rack-moment
  (`<videoId>:<offsetSec>`), niet aan `clipVan`, zodat het bijstellen van een venster de al
  gegeven oordelen niet wist.
- 2026-07-25: v0.42 — **jumbotron-info-sheets: winnaars + komende toernooien (#72)**. Nieuw
  publiek endpoint **`GET /api/sheets`** → `{ generatedAt, winners: [...], upcoming: [...] }`.
  - `winners` (max 5, nieuwste eerst): `{ winner, toernooi, discipline, datum }` — de winnaar
    is wie de **finale** won (Cuescore `roundName: "Final"`, hoogste score). Bron: recent
    afgeronde toernooien van de org-pagina.
  - `upcoming` (max 5, vroegste eerst): `{ dag, mnd, tijd, naam, discipline }` — uit
    `getUpcomingTournaments`. NB: Cuescore geeft géén live inschrijf-aantal terug voor een
    nog-niet-geloot toernooi (alleen `maxParticipants`), daarom tonen we de **aanvangstijd**
    i.p.v. een aantal.
  - Server-cache in blob `sheets.json`, ~30 min vers; bij een verlopen cache herbouwt het
    endpoint zelf (scrape + detail-calls). Gevoed in de jumbotron-rotatie als twee extra
    sheets (na de scores-fase, vóór de poster; duur per sheet `?winnaarsSec=`/`?komendeSec=`).
- 2026-07-27: v0.44 — **keuring: eigen eindseconde per clip + afspeelsnelheid (#71)**.
  `POST /api/manage/highlights` accepteert nu ook **`eind`** (eigen eindseconde in de video;
  `null` = terug naar het standaard-venster), naast `status`/`start`. `metKeuring` past 'm toe
  op `clipTot`; de start wordt geklemd tegen de (evt. aangepaste) eindseconde, en het einde
  ligt altijd ná de start. Nodig omdat sommige clips vóór het rack klaar was afkapten. De
  keuringspagina heeft er knoppen voor (`,`/`.` = eind −5/+5s, `/` = standaard) plus
  afspeelsnelheid **1×/1.5×/2×** (toetsen 1/2/3; YouTube-speler max = 2×).
- 2026-07-27: v0.43 — **planner: start- en eindtijd instelbaar (#42)**. De Toernooi planner
  toont nu tijd-invoervelden voor **Start** en **Eind**; die schrijven naar de al bestaande
  velden `startOverride` / `stopOverride` op `POST /api/manage/planning/{id}` (geen nieuwe
  API — alleen de UI gebruikt ze nu). `effectiveStart` = `startOverride || plannedStart`;
  de eindtijd stuurt de auto-stop-vangnet (`shouldStop` via `stopOverride`). **Standaard eind
  = 01:00** (nachtelijke veiligheids-stop); is de eindtijd ≤ de starttijd, dan geldt 'ie de
  volgende dag (bijv. eind 01:00 bij start 19:00). Bij "Plan" worden start/eind meegepersisteerd.
- 2026-07-28: v0.45 — **auto-stop kapt nooit meer een lopende wedstrijd af (#76)**. Aanleiding:
  incident 27-07 bij "Mokum MEGA Summer Ranking #25" — de finale begon om 23:57:47 op tafel 1 en
  liep tot 00:10, maar de stream werd om 23:59:00 gestopt. Oorzaak: `shouldStop` gebruikte
  **`plannedStop`** (de Cuescore-eindtijd) als noodrem zonder grace, en Cuescore had daar de
  plaatsvuller 23:59 staan. Sinds gisteren toonde de planner 01:00 als eind, waardoor weergave en
  werkelijkheid 61 minuten uiteenliepen. Drie wijzigingen, alle in de backend (geen API-vorm
  gewijzigd — dezelfde velden, ander gedrag):
  1. **`plannedStop` is geen stopreden meer.** De tijdgestuurde stop komt uitsluitend uit
     `stopOverride` (de eindtijd in de planner, standaard 01:00); `plannedStop` blijft in het
     record staan voor weergave en voor de `type`-detectie (span plannedStop − plannedStart).
  2. **Harde regel:** meldt Cuescore een wedstrijd met status `playing` op die tafel, dan stopt
     géén enkele automatische regel de stream — ook `stopOverride` en #72 niet. Blijft een partij
     ten onrechte op `playing` hangen, dan ruimt de nachtstop van 02:00 het op.
  3. **`stopReden()`** (nieuw, naast `shouldStop`) geeft een leesbare reden; `checkStops` logt die
     per tafel: `[checkStops] tafel 1: stoppen — <reden>`.
- 2026-08-02: v0.46 — **lopende doorlopende toernooien komen binnen (#86)**. Een meerdaags
  toernooi (zoals "Mokum 14.1 Summer league", 16 juni t/m 31 augustus) stond niet op
  `/tournaments` en viel bovendien buiten het venster van veertien dagen, want het staat
  onder zijn startdatum. Het kwam daardoor nooit in `planning.json`, waardoor een stream op
  zo'n avond niet gekoppeld werd: geen auto-stop, geen thumbnail, geen hoofdstukken (30 en
  31 juli; tafel 3 liep dertien uur door tot de nachtstop).
  1. De import leest nu óók de organisatiepagina en pikt daar de toernooien op die Cuescore
     zelf als lopend markeert (`class="date live"`). Diezelfde lijst gaat naar
     `getTodaysTournaments()`, zodat de ad-hoc koppeling op een league-avond werkt.
     Gecachet voor tien minuten — `pauzeScherm` vraagt dit elke 30 seconden op.
  2. **`planned` is nu ook voor `competition` de arm-vlag.** Eerder keek `createBroadcasts`
     bij competities alleen naar `enabled`, en dat staat bij import standaard op `true` —
     een binnenkomende league zou dus meteen elke avond met een wedstrijd op een cameratafel
     gaan streamen. Nu geldt overal hetzelfde: plannen in de Toernooi planner = draaien.
     Geen wijziging in de API-vorm, wel in het gedrag.
- 2026-08-02: v0.47 — **nieuwe stream als wizard in vier stappen (#87)**. Het startformulier vroeg
  alles tegelijk en beloofde bij élke stream dezelfde automatisering, terwijl het gedrag per soort
  fors verschilt: een competitie heeft geen finale (dus geen medaillescherm), en een stream zonder
  Cuescore-koppeling wordt nooit automatisch gestopt of afgerond. De wizard vraagt nu éérst het
  soort stream (toernooi / 14.1 league / challenge / custom) en laat in stap 4 per soort zien wat
  er wél en niet automatisch gebeurt.
  1. `POST /api/manage/streams/start` accepteert drie nieuwe optionele velden: **`streamType`**
     (`"challenge"`; andere soorten zijn al af te leiden uit `tournamentId`), **`spelerA`** en
     **`spelerB`** (namen, max 60 tekens). Ze worden opgeslagen op de broadcast-entry en verder
     nog niet gebruikt — ze zijn de basis voor de challenge-koppeling (#88), die er de
     Cuescore-challenge mee moet opzoeken. Zonder deze velden verandert er niets.
  2. Geen wijziging aan de respons of aan bestaande velden. `tournamentId` stond al sinds v0.34
     in de body maar ontbrak in de regel hierboven; nu compleet.

## Challenges aanmaken (leden, eigen Cuescore-sessie)
Aparte groep endpoints voor Mokum-**leden** (niet voor beheerders). Doel: een challenge in
Cuescore aanmaken vanaf een sjabloon, in plaats van elke keer het formulier invullen.

Auth werkt hier ANDERS dan bij `/api/manage/*`: er is geen gedeeld beheerderstoken. Een lid
logt in met zijn **eigen Cuescore-gegevens**; wij controleren die bij Cuescore zelf en geven
daarna een eigen ondertekend token terug (`Authorization: Bearer <token>`, 90 dagen geldig,
HMAC-SHA256). Cuescore kent geen OAuth en geen app-toegang, dus dit is de enige manier om
namens een lid te handelen.

POST /api/challenge/login      -> body: { "email": "...", "wachtwoord": "..." }
                                  Logt in bij Cuescore, bewaart het wachtwoord VERSLEUTELD
                                  (AES-256-GCM, sleutel uit Key Vault) en geeft terug:
                                  { "token", "speler": { "playerId", "naam" }, "sjablonen": [...] }
GET  /api/challenge/me         -> { "speler", "sjablonen", "tafels": [...] }
GET  /api/challenge/spelers?q= -> { "spelers": [ { "playerId", "naam" } ] } (zoeken via Cuescore)
POST /api/challenge/aanmaken   -> body: { "tegenstanderId": 3404805, "tafel": 1,
                                  "discipline"?: 3, "raceTo"?: 5, "breakrule"?: "winner|alternate" }
                                  -> { "challengeId", "matchId", "url" }
POST /api/challenge/sjablonen  -> body: { "sjablonen": [ { "naam", "tegenstanderId"?, "discipline",
                                  "raceTo", "breakrule" } ] } (max 12) -> { "sjablonen" }
POST /api/challenge/loskoppelen-> wist het opgeslagen wachtwoord en de sessie -> { "ok": true }

Ledenrecord (opslag `challenge/leden/<playerId>.json`, nooit naar de frontend):
{
  "playerId": 1234567,
  "naam": "Peter de Swart",
  "email": "...",
  "geheim": { "iv", "tag", "data" },   // AES-256-GCM; sleutel staat in Key Vault
  "cookies": { "..." },                 // laatste Cuescore-sessie, om niet elke keer in te loggen
  "sjablonen": [ ... ],
  "aangemaakt": "2026-08-02T13:00:00Z",
  "laatstGebruikt": "2026-08-02T13:00:00Z"
}

Regels:
- Het wachtwoord gaat **nooit** terug naar de frontend en staat **nooit** in logging.
- De opgeslagen Cuescore-sessie wordt hergebruikt; pas als die verlopen is loggen we opnieuw
  in met het opgeslagen wachtwoord. Lukt dat ook niet, dan krijgt het lid een 401 en moet het
  opnieuw inloggen (bijv. na een wachtwoordwijziging bij Cuescore).
- `tafel` is het ECHTE zaalnummer (1..19); de vertaling naar Cuescore's `tableId` gebeurt
  serverside — die id's zijn niet af te leiden uit het nummer.
- Wie mag beginnen (de lag) wordt bewust NIET geautomatiseerd; dat is een fysieke uitkomst.

- 2026-08-02: v0.48 — **challenges aanmaken door leden (#90)**. Nieuwe groep `/api/challenge/*`
  hierboven. Reden: leden spelen vaak dezelfde challenge (9-ball, race naar 5, winner break) en
  moeten die elke keer met de hand in Cuescore aanmaken. Cuescore heeft geen officiële API en
  geen OAuth; het koppelvlak is uitgezocht en live geverifieerd — zie
  `docs/cuescore-challenge.md`. Bewuste keuze van Peter (02-08) om wachtwoorden versleuteld te
  bewaren zodat leden ze één keer invullen; de risico's daarvan staan in dat document.
  Raakt de bestaande endpoints niet.
- 2026-08-02: v0.49 — **keuzelijsten en favorieten (#90)**. `GET /api/challenge/me` geeft er drie
  velden bij: **`disciplines`** (`[{id, naam}]`, uit CueScore.Discipline — 9-Ball=3, 8-Ball=2,
  14.1=5, carambole 201-203, English pool 301-302), **`breakregels`** (`[{id, naam}]` — `winner`
  of `alternate`) en **`maxRace`**. Reden: het speltype, de racelengte en de breakregel stonden
  vast op 9-ball/race 5/winner break en waren niet te kiezen. De lijsten komen van de backend en
  niet uit de frontend, zodat een nieuwe spelsoort maar op één plek bijgewerkt hoeft te worden.
  De sjablonen heten in de interface **favorieten**; de opslagvorm en `/api/challenge/sjablonen`
  blijven ongewijzigd.
- 2026-08-02: v0.50 — **favoriet onthoudt ook de tafel (#90)**. Een sjabloon mag nu een
  optionele **`tafel`** bevatten (echt zaalnummer 1..19; onbekende waarden worden weggelaten).
  Reden: de pagina stelt de naam automatisch samen uit alle instellingen — "Lennert Duyn,
  race to 5, 9-Ball, tafel 1" — en dan moet het aantikken van die favoriet die tafel ook echt
  kiezen, anders belooft de naam iets wat niet gebeurt. `MAX_NAAM` daarom van 40 naar 60.
- 2026-08-02: v0.51 — **speler zoeken geeft meer dan alleen een naam (#90)**.
  `GET /api/challenge/spelers` geeft per speler nu ook **`foto`**, **`land`**, **`vlag`**,
  **`club`** en **`plaats`** (allemaal `null` als Cuescore ze niet levert). Reden: zoeken op
  "chris jones" levert dertien spelers op die in een lijst met alleen namen niet uit elkaar te
  houden zijn. Het `playerId` wordt in de interface getoond — dat is het enige veld dat
  gegarandeerd uniek is.
- 2026-08-04: v0.52 — **overlays per stuk + tafel vrijmaken vóór een toernooi (#93)**.
  1. Het planning-record kent nu ook **`overlays.jumbotron`** (standaard `true`). De Toernooi
     planner had drie vaste combinaties ("Alle / Alleen scorebord / Geen") waarmee de
     jumbotron niet aan te zetten was, terwijl je een avond juist graag begint met het
     pauzescherm en de highlights erop. Het is nu een vinkje per overlay. Ontbreekt de
     sleutel in een record, dan geldt dezelfde standaard als in de backend: sponsors en
     scorebord AAN, jumbotron UIT (OVERLAY_DEFAULT_OFF). Nieuw geïmporteerde toernooien krijgen
     jumbotron expliciet op true; records van vóór 04-08 hebben de sleutel niet en starten dus
     zonder jumbotron tot je hem aanvinkt.
  2. Nieuw veld **`vrijgemaaktVoor`** op een broadcast-entry: het tournamentId waarvoor de
     uitzending automatisch is gesloten. Vanaf 30 minuten vóór de start van een ingepland
     toernooi sluit `checkStops` alles wat er nog op zijn tafels draait en er niet bij hoort
     (`backend/src/planning/vrijmaken.js`, puur + getest; achter app-instelling `TAFEL_VRIJMAKEN=true`, standaard uit). Reden: op 03-08 bleef een losse
     challenge op tafel 1 acht uur openstaan, waarna diezelfde tafel voor het toernooi werd
     gebruikt — één video van 8u31 met tweeënhalf uur lege tafel aan het begin. Een
     uitzending van hét toernooi zelf blijft met rust, en na de starttijd grijpt de regel niet
     meer in.
- 2026-08-09: v0.53 — **posters uit Blob Storage in de pauzerotatie (#96)**.
  Nieuw publiek endpoint **`GET /api/pauze/posters`** → `{ generatedAt, posters: [...] }`
  (vorm hierboven in "Publiek"). Reden: er hing één poster hard in
  `frontend/public/pauze/slides/02-jumbotron.html` (`<img src="../img/poster-10ball.png">`).
  Een poster toevoegen betekende een commit en een Pages-deploy — te veel gedoe voor iets dat
  twee weken moet hangen. Nu is het een bestand in de container `pauze-posters` neerzetten.
  1. **Verloopdatum per poster** via blob-metadata `tot` (en optioneel `van` om vooruit te
     kunnen uploaden, en `volgorde` voor de plek in de rij). Zonder `tot` blijft een poster
     hangen — dat is bewust het oude gedrag, zodat een bestaande poster niet stilletjes
     verdwijnt als iemand vergeet een datum te zetten.
  2. **Het filteren gebeurt in de backend, niet in de browser.** De pauzekaart hoeft dan niets
     van datums te weten, en aan het antwoord van het endpoint zie je meteen wat er hoort te
     draaien — dat scheelt zoeken als er iets niet in beeld komt.
  3. **De poster wordt een eigen fase** in de pauzerotatie (besluit Peter 09-08):
     `SCORES (30s) → HIGHLIGHT (duur van de clip) → INFO-SHEET (15s) → POSTER (15s)`. Was:
     één van de info-sheets, 5 seconden. Met meerdere posters kwam elke poster anders pas
     één keer per acht rondes langs. `?posterSec=` blijft bestaan om af te wijken.
  4. Container `pauze-posters` is **blob-niveau openbaar leesbaar** (akkoord Peter 09-08).
     Het opslagaccount heeft daarvoor `allowBlobPublicAccess: true` gekregen; de container
     `mokum-streams` met de interne JSON blijft privé — toegang is per container.
- 2026-08-17: v0.54 — **inactiviteits-vangnet voor het stoppen van een uitzending (#100, #105)**.
  Nieuw veld **`laatsteActiviteit`** (ISO-tijdstip) op een broadcast-entry: het laatste
  moment dat er, over alle toernooien van vandaag heen, een wedstrijd `playing` stond op
  deze tafel (bron: `venueTables` uit `live-matches.json`). Ontbreekt het veld nog (oude
  entries, of nooit activiteit gezien), dan geldt `scheduledStart` als referentie.
  `checkStops` gebruikt dit als vangnet in twee gevallen die anders nooit vanzelf stoppen:
  1. Een **losse uitzending die niet aan een toernooi te koppelen is** (bijv. een
     challenge). Vier vergeten streams van 8-11 uur op 09-08 kwamen hierdoor.
  2. Een **wél gekoppelde uitzending waarvan Cuescore voor dat toernooi-ID 0 wedstrijden
     teruggeeft.** Op 16-08 had Cuescore de wedstrijddata van het koppeltoernooi op een
     ánder toernooi-ID staan dan waar wij aan gekoppeld waren — de gekoppelde ID bleef de
     hele avond leeg, dus de gewone toernooi-klaar-detectie werd nooit `true`.
  Grens: **een uur** onafgebroken stilte op de tafel (besluit Peter, 09-08), instelbaar via
  `inactiviteitsCheck()`'s `grensMs`-parameter. Puur/getest in `planning/inactiviteit.js`.
- 2026-08-18: v0.55 — **podium per cameratafel i.p.v. zaalbreed** (#104). Het bestaande
  `podium`-veld (v0.33) is zaalbreed: zodra ergens in de zaal nog een cameratafel speelt,
  blijft het podium OVERAL weg, ook op een tafel waar de eigen finale al lang klaar is. Kwam
  aan het licht op 16-08 (koppeltoernooi-finale klaar op tafel 1, tafel 15 speelde nog een
  ander toernooi → geen medaillescherm op tafel 1).
  Nieuw veld **`podiumPerTafel`** op `GET /api/live` (en op `live-matches.json`):
  `{ "1": { tournamentName, podium: [...] } | null, "3": ..., "15": ..., "16": ... }` — per
  cameratafel dezelfde vorm als het bestaande `podium`-veld, maar nu bepaald op basis van
  ALLEEN de tafels waar dát toernooi zelf op gespeeld werd (`podiumPerTafel()` in
  `planning/podium.js`). Het oude `podium`-veld blijft ongewijzigd bestaan (backward-
  compatible; geen risico voor een lopende uitzending bij deze deploy).
  **Activering is een aparte, latere stap:** de jumbotron-pagina
  (`frontend/public/pauze/slides/02-jumbotron.html`) gebruikt `podiumPerTafel` pas als de
  OBS-browserbron van die tafel `?tafel=N` in de URL heeft staan (bijv.
  `...02-jumbotron.html?tafel=1`); zonder die parameter blijft het oude gedeelde `podium`-
  gedrag gelden. Bewust zo gebouwd — de vier OBS-instanties tegelijk aanpassen terwijl er
  wordt uitgezonden is te riskant (#104), dus dat doet Peter op een rustig moment per tafel.
- 2026-09-17: v0.56 — **planning-records met een verdwenen Cuescore-ID worden opgeruimd** (#127).
  Aanleiding: op 16-09 gingen de streams van tafel 1 en 3 vier keer aan en uit. Cuescore had de
  MEGA Winter Ranking-serie opnieuw aangemaakt onder nieuwe ID's; het oude ID `88433581` werd
  ongeldig, maar het record bleef met `planned: true` naast het nieuwe record voor hetzelfde
  toernooi staan. Die twee vochten om dezelfde tafel (#128) en leverden video's van 51 seconden
  op. De bestaande wees-migratie (v0.53) ving dit niet: die werkt alleen als het oude ID
  verdwijnt in dezelfde import waarin het nieuwe verschijnt, en bij deze serie stonden beide
  toernooien een tijd tegelijk bij Cuescore.
  Twee nieuwe, optionele velden op een planning-record:
  - **`cuescoreWegSinds`** (ISO-tijd) — sinds wanneer dit toernooi-ID niet meer in de
    Cuescore-import voorkomt, terwijl de datum wél binnen het importvenster (vandaag t/m
    +35 dagen) valt. Puur een stempel; het record doet gewoon nog mee.
  - **`cuescoreWeg`** (bool) — gezet zodra dat stempel ouder is dan drie uur (~3 imports).
    Het record wordt dan óók op `planned: false` gezet: een toernooi dat niet bestaat mag geen
    broadcasts meer maken.
  Waarom die vertraging: `haalToernooienPaginas()` tolereert één mislukte weergave, dus een
  half-mislukte ophaal kan tijdelijk alle aankomende toernooien missen. Meteen ontwapenen zou
  in één klap de hele agenda uitzetten. Komt het ID terug, dan verdwijnen beide velden weer.
  Een record dat een **levende naamgenoot op dezelfde datum** heeft (precies het geval van
  16-09) is een achtergebleven dubbelganger en wordt direct verwijderd — dat is veilig, want
  het vereist per definitie een geslaagde import.
  Records buiten het importvenster blijven ongemoeid: het verleden zit nooit in de import.
  Zie `mergePlanning()`/`opschonenVerdwenen()` in `backend/src/planning/planning.js`.
  Daarnaast krijgt de fout uit `getTournament()` bij een onbekend ID een vlag
  **`toernooiOnbekend`**, zodat `createBroadcasts` "dit ID bestaat niet" kan onderscheiden van
  "Cuescore is even onbereikbaar". Bij het eerste wordt er géén broadcast meer aangemaakt
  (voorheen viel hij terug op de geplande tafels — precies wat de lus van 16-09 voedde).
- 2026-09-17: v0.57 — **noodrem op het aanmaken van broadcasts + scherpere koppel-vangrails**
  (#128, #129). Vervolg op v0.56: dat haalt de oorzaak weg (dubbele planning-records), dit
  zorgt dat dezelfde klap nooit meer zó hard aankomt.
  Drie dingen, alle drie naar aanleiding van 16-09:
  1. **Noodrem (#128).** Een tafel krijgt op één zaal-dag maximaal `MAX_BROADCASTS_PER_TAFEL`
     broadcasts (standaard **4**, app-setting). Daarboven maakt `createBroadcasts` niets meer
     aan, logt hij op `[FOUT]`-niveau, en gaat er éénmalig een alarm uit (mail + ntfy) via
     `bouwBroadcastLimietAlert()`. Op 16-09 waren het er vier in een kwartier en hield niets
     dat tegen. Twee nieuwe velden op een broadcast-entry: **`gemaaktVandaag`** (teller, telt
     door over opeenvolgende entries van dezelfde tafel) en **`limietGemeld`** (voorkomt dat
     het alarm elke vijf minuten opnieuw afgaat).
  2. **`vrijTeMaken()` laat verse uitzendingen met rust (#128).** Nieuw veld
     **`aangemaaktOp`** (ISO-tijd) op een door `createBroadcasts` gemaakte entry. Is die
     later dan het moment waarop het vrijmaak-venster openging (een half uur vóór de start),
     dan is het géén vergeten uitzending van eerder op de dag en blijft hij staan. Precies
     dat maakte de lus van 16-09: record A maakte om 19:05 een uitzending aan, record B
     sloot 'm om 19:06 als "van een ander toernooi". Een entry zónder `aangemaaktOp`
     (handmatig gestart, of van vóór deze versie) telt als oud en wordt gewoon opgeruimd —
     dat is het gedrag waar #93 voor gemaakt is.
  3. **Herkoppelen alleen binnen dezelfde soort (#129).** Het zelfherstel in `checkStops`
     koppelt een uitzending met een dood toernooi-ID niet langer aan een record van een
     ander `type`. Op 16-09 belandde een enkeldaags toernooi zo bij "Mokum 14.1 Summer
     league" (een `competition`), die een andere stopregel heeft — de stream stopte meteen.
     Daarnaast telt het woord **"mokum"** niet meer mee bij het vergelijken van een
     ingetypte titel met een toernooinaam (`NEGEER_WOORDEN` in `planning/koppel.js`): het
     staat in vrijwel élke toernooinaam van deze zaal, waardoor de vangrail van #103
     praktisch alles doorliet.
- 2026-09-17: v0.58 — **competitie-wizard: nu starten** (#120). Een vijfde soort stream in de
  wizard, voor een Mokum-teamwedstrijd. Inplannen volgt apart in #145.
  1. **Nieuw: `GET /api/manage/competitie/wedstrijden`** (beheer-auth). Leest de
     mokum-competitie-API (`backend/src/mokumCompetitie/`) en geeft alleen wedstrijden terug
     waarvan `venueName` "Mokum Pool" bevat en `starttime` op de huidige zaal-dag of later valt
     (een wedstrijd die in Cuescore nooit is afgesloten, blijft anders dagen op `playing` staan).
     Er wordt bewust niet op `isHome` gefilterd:
     bij een wedstrijd tussen twee Mokum-teams heeft één van beide `isHome: false`. Zo'n
     onderlinge wedstrijd staat er één keer in (op `matchId`), met beide teams in `teams`.
     Antwoord:
     `{ "wedstrijden": [{ "matchId", "matchUrl", "starttime", "roundName", "matchStatus",
     "niveauCategorie", "niveau", "thuisteam", "uitteam", "teams": [{ "teamSlug", "teamName" }] }],
     "mislukt": ["teamSlug", ...] }`, gesorteerd op `starttime`. `thuisteam` volgt uit
     `isHome` van het Mokum-team (in Cuescore is `playerA` altijd het thuisteam). `mislukt` =
     teams waarvan het ophalen faalde, zodat de wizard kan melden dat de lijst onvolledig is.
     Is `/teams` zelf onbereikbaar, dan komt er een 502.
  2. **`POST /api/manage/streams/start`**: `streamType` mag nu ook `"competitie"` zijn, met een
     nieuw optioneel veld **`matchId`** (Cuescore-teamwedstrijd, geheel getal). Beide worden
     opgeslagen op de broadcast-entry. De wizard stuurt als titel `{niveau} {thuisteam} vs. {uitteam}`
     mee, dus de YouTube-titel wordt `Tafel {nr} {niveau} {thuisteam} vs. {uitteam}`.
     Meerdere tafels = één aanroep per tafel. De wizard controleert vooraf of álle gekozen
     tafels vrij zijn, en start anders niets.
  3. **Gedrag van een entry met `streamType: "competitie"`:** wordt nooit aan een
     Cuescore-toernooi gekoppeld (`kiesToernooiVoorTafel`), valt nooit onder de
     inactiviteitsstop (ook niet met `INACTIVITEIT_STOP=true`), en krijgt geen automatische
     finalize (een thumbnail met de wedstrijdnaam is #82). Stoppen gaat handmatig of via de
     nachtstop van 02:00.
- 2026-09-17: v0.59 — **automatische thumbnail voor een competitiewedstrijd** (#82). Reden:
  video's van teamwedstrijden kregen tot nu toe geen eigen thumbnail, alleen de YouTube-still.
  1. **`POST /api/manage/streams/start`**: drie nieuwe optionele velden bij
     `streamType: "competitie"`: **`niveau`**, **`thuisteam`** en **`uitteam`** (tekst, elk
     max. 60 tekens). De wizard kent ze al uit `GET /api/manage/competitie/wedstrijden`. Ze
     worden op de broadcast-entry bewaard; de titel blijft ongewijzigd.
  2. **Finalize:** een gestopte entry met `streamType: "competitie"` en beide teams krijgt nu
     wél een automatische finalize (vervangt punt 3 van v0.58 op dit onderdeel): thumbnail uit
     de template `competitie` (AI-achtergrond, KNBB-logo, niveau, `thuisteam VS uitteam`,
     datumpil) plus een korte beschrijving. Geen hoofdstukken. Zonder teams (entries van vóór
     deze versie) blijft het zoals het was: geen finalize.
  3. Handmatig: `POST /api/manage/finalize` accepteert ook
     `{ videoId, type: "competitie", niveau, thuisteam, uitteam, tableNumber? }`.
- 2026-09-17: v0.60 — **automatische stop van een competitiestream** (#145, besluit Peter 17-09).
  Reden: een vergeten stream liep tot de nachtstop door, met uren beeld van een lege tafel.
  Geen wijziging aan een endpoint; alleen het gedrag van `checkStops` voor een entry met
  `streamType: "competitie"`. Vervangt de regel "stoppen handmatig" uit punt 3 van v0.58, en
  geldt zowel voor "nu starten" als straks voor ingeplande wedstrijden.
  1. **Bron:** het Cuescore-toernooi van de competitie (per `niveau` een vast id, zie
     `backend/src/mokumCompetitie/toernooien.js`; elk seizoen bijwerken). Daarin de wedstrijd
     met `matchId`. Hooguit eens per 2 minuten opgehaald.
  2. **Klaar** als Cuescore `matchstatus: "finished"` meldt, **óf** als `scoreA + scoreB` het
     aantal partijen bereikt (Klasse 6, Divisies en Eredivisie 7, volgens de KNBB-
     wedstrijdformulieren 2026-2027). De stand-regel telt pas vanaf 90 minuten na de start van
     de stream, als extra rem tegen afkappen. Nooit op tijd of inactiviteit (#134).
  3. **Wachttijd:** 5 minuten na het eerste "klaar"-signaal (`competitieKlaarSinds` op de entry),
     instelbaar met app-setting `COMPETITIE_STOP_WACHT_MIN`. Daarna stopStream + `stopped: true`,
     waarna finalize (v0.59) de thumbnail zet.
  4. **Vangnet ongewijzigd:** niveau onbekend, Cuescore onbereikbaar of wedstrijd nooit afgerond →
     de nachtstop.
- 2026-09-17: v0.61 — **competitiestream zonder teamnamen: backend zoekt ze zelf op** (#82, #145).
  Reden: bij de test van 17-09 draaide de browser nog de oude wizard (dashboard geopend vóór de
  deploy), waardoor `niveau`/`thuisteam`/`uitteam` ontbraken en er stil geen thumbnail en geen
  automatische stop kwam. Geen wijziging aan een endpoint.
  1. Mist een entry met `streamType: "competitie"` en een `matchId` het niveau of de teams, dan
     zoekt de backend de wedstrijd op in de Cuescore-competitietoernooien
     (`mokumCompetitie/toernooien.js`): niveau = het niveau van dat toernooi, teams = `playerA`
     (thuis) en `playerB` (uit). Het resultaat wordt op de entry bewaard (`teamsOpgezocht`).
  2. `checkStops` doet dit hooguit eens per 2 minuten; finalize doet het vlak vóór de thumbnail.
     Niet gevonden → bij finalize een gewone mislukte poging (retry/opgeven, #124), bij de stop
     het vangnet van de nachtstop.
  3. Finalize kiest nu `competitie` voor elke gestopte entry met `matchId`, ook zonder teams.
- 2026-09-18: v0.62 — **competitiescherm in de laatste minuten van een competitiestream** (#147,
  besluit Peter 18-09: automatisch, "optie B"). Reden: na de laatste partij keek de kijker tot
  de automatische stop (v0.60) 5 minuten naar een lege tafel.
  1. **Nieuwe overlay-sleutel `competitie`** → OBS-bron `Competitiestand` (browserbron, URL
     `https://mokum-streams.pdscloud.nl/competitie/?tafel=N`). Standaard UIT, net als de
     break-overlays, dus bij elke start uitgezet. Ook te schakelen via
     `POST /api/manage/streams/overlay` (`"competitie": true`) en het dashboard.
  2. **Automatisch aan:** `checkStops` enqueuet `setOverlay Competitiestand aan` op het moment dat
     een competitiestream `competitieKlaarSinds` krijgt, dus aan het begin van de wachttijd van
     5 minuten. De stop sluit daarna de hele stream; de volgende start zet de bron weer uit.
  3. **`/api/live` → `tables[].competitie`**: bij een actieve entry met `streamType: "competitie"`
     en een niveau dat in `mokumCompetitie/toernooien.js` staat
     `{ niveau, toernooiId, matchId, thuisteam, uitteam, klaarSinds, stopOm }`, anders `null`.
     Daaruit weet de pagina welke competitie en welke wedstrijd hij moet tonen. `stopOm` =
     `klaarSinds` + wachttijd (`COMPETITIE_STOP_WACHT_MIN`, nu op één plek:
     `competitieWachtMs()` in `config/automation.js`); `null` zolang de wedstrijd niet klaar is.
     checkStops tikt eens per minuut, dus de echte stop valt tussen `stopOm` en een minuut later.
  4. **De pagina haalt stand en uitslagen zelf uit Cuescore** (`api.cuescore.com/tournament/?id=`,
     CORS `*`). Geen extra endpoint, geen Azure- of YouTube-kosten. Uitslagen = gespeelde
     wedstrijden van de **laatste 2 rondes** (besluit Peter 25-09; eerder de afgelopen 31 dagen,
     maar dat gaf bij 3+ rondes te veel pagina's). Met `?maand=` blijft een kalendermaand kiesbaar.
  5. Bestaat de bron niet in OBS, dan dropt de agent het commando (`SOURCE_NOT_FOUND`). Uitrollen
     kan dus al voordat de OBS-bron er staat.
  6. **Volgorde en bedankscherm** (wens Peter 18-09): de pagina telt af naar `stopOm`:
     stand 2 min → uitslagen 2 min → de laatste minuut "Bedankt voor het kijken!" met de eindstand
     (niveau als gekleurde pil, zelfde kleur als de thumbnail) en een bedankje aan de KNBB,
     CueScore en alle vrijwilligers en teamcaptains. Sinds 25-09 toont elk scherm een kleine
     **timer** (leeglopend balkje + "nog 1:24") tot het scherm wisselt of de uitzending stopt.
     Puur de pagina; geen extra endpoint.
  7. **Speling van 30 s in de stopregel** (`competitieStop.js`, `TIK_SPELING_MS`): checkStops
     tikt eens per minuut, en de tik na 5 minuten viel door timer-jitter soms nét vóór
     `klaarSinds + 5:00`, waardoor de stop pas na 6 minuten kwam. Nu valt de stop voorspelbaar
     op de 5-minutentik, zodat het aftellen van de pagina klopt.

- 2026-09-21: v0.63 — **fix: een doorlopende stream blijft stopbaar, ook als de store al "gestopt"
  zegt** (#148, storing 21-09). Tegenhanger van v0.26: die maakte een stream zichtbaar als er
  **geen** store-entry meer was (middernacht-rollover), maar een entry met `stopped: true` bleef
  hard `offline`. Op 21-09 bleef daardoor een verborgen teststream bijna een uur onzichtbaar
  doorzenden (OBS 16 Mbps, YouTube "Live now") terwijl het dashboard tafel 1 als offline toonde —
  zonder Stop-knop, dus alleen nog via de API te sluiten.
  - **`buildLiveTables`**: meldt de agent `streaming` op die tafel, of heeft YouTube er een actieve
    broadcast (`liveVideoId`), dan is de status **`live`** — ook bij een store-entry met
    `stopped: true`. Kort gezegd: de werkelijkheid wint van de administratie.
  - `videoId` valt in dat geval terug op `liveVideoId` (de stream die écht loopt, niet de
    geadministreerde), en `quality`/`overlays` volgen zoals altijd de agent-status.
  - `title`/`tournamentName`/`scheduledStart`/`competitie` blijven leeg bij een gestopte entry: die
    beschrijven de afgeronde uitzending, niet wat er nog de lucht in gaat. Het dashboard toont zo'n
    tafel dus als live zonder titel — precies het signaal "hier loopt iets wat niet hoort".
  - Reden dat dit veilig is: `POST /api/manage/streams/stop` werkte al ongeacht de store-stand; het
    ontbrak alleen aan een knop. De oorzaak dát de stop niet aankwam is een agent-bug (#149).

- 2026-09-21: v0.64 — **overlay `pauzemelding` verwijderd** (#151, besluit Peter 21-09). De OBS-bron
  `Pauzemelding` bestaat in geen enkele van de vier instanties meer: de pauze-slides zitten sinds de
  jumbotron-verbouwing in de bron `Jumbotron` (`/pauze/slides/02-jumbotron.html?tafel=N`). Omdat
  `startCommandsFor` bij élke start een expliciete stand stuurt voor iedere sleutel uit `OVERLAY_BRON`,
  liep er bij elke streamstart een `[DROP] setOverlay tafel N: bron 'Pauzemelding' niet gevonden`
  (permanente fout, dus onschuldig — maar wel ruis, en het verborg de echte valkuil hieronder).
  - De sleutel `pauzemelding` is weg uit `OVERLAY_BRON` en `OVERLAY_DEFAULT_OFF`
    (`backend/src/agent/commandQueue.js`) en uit `DEFAULT_OVERLAY_SOURCES` (`agent/src/agent.js`).
    De `overlays`-map op `POST /api/manage/streams/start`, de body van
    `POST /api/manage/streams/overlay` en de `overlays`-stand in `GET /api/live` kennen de sleutel
    dus niet meer; een meegestuurde `pauzemelding` wordt genegeerd i.p.v. gehonoreerd.
  - **`pauzeSchermKeys()`** (`backend/src/config/automation.js`) geeft zonder app-setting nu
    `['jumbotron']` terug i.p.v. `['pauzemelding']`. Dat was de echte valkuil: in productie staat
    `PAUZESCHERM_KEYS=jumbotron`, dus het pauzescherm werkte — maar wie die app-setting weghaalt,
    viel terug op een bron die niet bestaat, zonder zichtbare fout. Code en productie zeggen nu
    hetzelfde.
  - Het dashboard had de knop al niet meer (#75). Ongewijzigd: de overige overlays, het uitlezen van
    de werkelijke overlay-standen voor het dashboard, en het expliciet zetten van elke bekende
    overlay bij een start.
  - Terug te zetten (zoals bij v0.18): OBS-bron aanmaken + sleutel weer toevoegen in `OVERLAY_BRON`,
    `OVERLAY_DEFAULT_OFF`, agent `DEFAULT_OVERLAY_SOURCES` en frontend `OVERLAYS`.
  - Meegenomen: `cuescoreLogo` stond nog in de agent-`DEFAULT_OVERLAY_SOURCES` terwijl de OBS-bron
    `Cuescore logo` per v0.18 (13-07) al was verwijderd — dezelfde dode verwijzing, nu ook weg.
    Dat gaf geen `[DROP]` (de backend stuurde er geen setOverlay meer voor), alleen twee nutteloze
    OBS-calls per tafel per statusronde.
  - Vastgelegd bij het uitzoeken: de `config.overlaySources`-override in `agent-config.json` doet
    niets — `normalizeConfig()` geeft dat veld (net als `rotations`) niet door. De bronnamen in de
    agent komen dus altijd uit `DEFAULT_OVERLAY_SOURCES`. Geen actie nodig op de OBS-pc.

- 2026-09-22: v0.65 — **het automatische pauzescherm slaat competitiestreams over** (#155).
  Ontdekt bij het uitzoeken van #153; dit is 21-09 nét niet misgegaan.
  - **Het gat:** de timer `pauzeScherm` bepaalt per streamende tafel of er gespeeld wordt met
    `tafelSpeeltNu(tournaments, tafel)` — die zoekt een lopende wedstrijd **op die tafel** in de
    Cuescore-toernooidata van vandaag. Bij een teamwedstrijd bestaat die koppeling niet
    (`table: []`, `frames: []`), dus het antwoord is altijd "er speelt niets" terwijl er gewoon
    gespeeld wordt. De timer maakte geen onderscheid tussen een competitiestream en een
    toernooistream.
  - **Waarom het 21-09 goed ging:** toeval. Een tafel zonder eerdere toestand begint neutraal in
    `pauze` (`volgendeToestand`), en zolang de toestand niet *verandert* stuurt de timer geen
    commando's. De tafels bleven de hele avond in die begintoestand. Was er tussendoor één keer
    een lopende partij op die tafel opgedoken (precies wat een losse partij op de tafel doet),
    dan was de tafel naar `spelen` geslagen en daarna weer naar `pauze` — met de **jumbotron over
    de lopende competitiewedstrijd** en het scorebord uit (`PAUZESCHERM_UIT=scoreboard`).
  - **Wijziging:** `pauzeScherm` leest nu ook de broadcast-store van de zaal-dag en slaat elke
    tafel over waarop een lopende competitiestream staat (`streamType: 'competitie'`, niet
    `stopped`). Nieuwe pure helper `competitieTafels(store)` in `backend/src/planning/pauze.js`.
    Zo'n tafel krijgt géén pauzescherm-commando's en houdt de overlay-stand waarmee hij is
    gestart.
  - **Niet gewijzigd:** toernooistreams (rankings), waar Cuescore de tafeltoewijzing wél beheert,
    werken precies als voorheen. Het handmatig schakelen vanaf het dashboard blijft voor alle
    streams werken.
  - Waarom overslaan en niet "slimmer maken": voor een competitiestream bestaat er geen bron die
    betrouwbaar zegt of er op die tafel gespeeld wordt. Een automaat die dat tóch raadt, raadt op
    een gegeven moment verkeerd — over een lopende wedstrijd heen. Zie ook #153 voor het
    scorebord, dat aan dezelfde lege bron hangt.

- 2026-09-22: v0.66 — **vangnet: scorebord verdwijnt als de stand stilstaat** (#153, besluit
  Peter 22-09). Sluit het gat dat op 21-09 drie en een half uur lang een 0-0 in beeld hield.
  - **Waarom dit nodig is:** bij een competitiewedstrijd hangt het Cuescore-scorebord aan wat
    spelers zelf aan de tafel koppelen en bijhouden. Doen ze dat (17-09), dan is het het mooiste
    beeld dat er is: spelersnamen én de partijstand. Doen ze het niet (21-09), dan staat er
    urenlang een leugen. Het scorebord blijft dus aan, maar verdwijnt zodra het aantoonbaar
    achterloopt.
  - **Nieuwe timer-Function `scorebordWacht`** (elke minuut, seconde 50 — naast checkStops/
    liveMatches op 0, liveVideos op 20 en pauzeScherm op 40). Per tafel met een lopende
    competitiestream haalt hij op wat de overlay zelf ophaalt:
    `POST cuescore.com/ajax/scoreboard/overlay-v2.php` met `tableId`. Zo zien we exact wat de
    kijker ziet, in plaats van een andere bron te raadplegen die iets anders kan zeggen.
  - **Werking:** van elk antwoord wordt een vingerafdruk gemaakt (spelers + stand + matchId).
    Verandert die niet gedurende `SCOREBORD_STIL_MIN` minuten (standaard 30), dan gaat er een
    `setOverlay scoreboard false` naar die tafel. Verandert de vingerafdruk daarna weer, dan
    gaat het scorebord meteen terug aan. Toestand per zaal-dag in
    `scorebord-state/<zaaldag>.json`.
  - **Fail-safe:** herkent de code de stand niet in het antwoord (onbekende veldnamen, Cuescore
    onbereikbaar, `status: WAITING` omdat er niets op de tafel staat), dan gebeurt er **niets** —
    het scorebord blijft zoals het stond. Liever niet ingrijpen dan verkeerd ingrijpen; de
    ruwe respons wordt bij een omslag gelogd zodat de veldnamen na de eerste competitieavond
    exact af te stellen zijn.
  - **Alleen competitiestreams.** Bij een toernooistream beheert Cuescore de tafeltoewijzing zelf
    en dekt het pauzescherm dit al af (`PAUZESCHERM_UIT=scoreboard`). Competitiestreams zijn
    sinds v0.65 juist uitgesloten van het pauzescherm (#155), dus dit vangnet neemt daar die rol
    over.
  - **App-settings:** `SCOREBORD_WACHT` (standaard aan, op `false` zetten schakelt de timer uit)
    en `SCOREBORD_STIL_MIN` (standaard 30). Geen deploy nodig om bij te stellen.
  - Geen wijziging aan endpoints; het dashboard kan het scorebord altijd met de hand weer
    aanzetten via `POST /api/manage/streams/overlay`.

- 2026-09-22: v0.67 — **correctie op v0.66: het scorebord wordt ververst, niet verborgen** (#153).
  Dezelfde dag nog rechtgezet, nadat een van de teams liet zien dat de diagnose niet klopte.
  - **Wat er mis was aan v0.66:** die ging ervan uit dat de stand in Cuescore niet werd
    bijgehouden. Een captain weersprak dat, en Cuescore geeft hem gelijk. Challenge `89921515`
    van 21-09: `table.tableId 61403800` (= tafel 15), `matchstatus finished`, eindstand
    `Joris de Winkel 1 - 8 Moudar Ali`. De partijen stonden dus op de juiste tafels, werden
    bijgewerkt en netjes afgesloten — de hele avond door.
  - **De echte oorzaak:** de data klopte, het beeld niet. De OBS-browserbron was bevroren. De
    overlay-pagina van Cuescore stopt permanent met verversen zodra één aanvraag mislukt:
    `.fail(function(a){ Scoreboard.Overlay.pollerInterval = null })` — geen retry, geen herstel.
    Eén hapering en de pagina blijft staan waar hij stond. Dat verklaart ook waarom meerdere
    tafels tegelijk bevroren (één netwerkhapering raakt alle bronnen) en waarom het de ene avond
    wel en de andere niet gebeurt. Het tweede kanaal van die pagina, een websocket, herstelt zich
    wél (`onclose` → opnieuw verbinden na 5 s); de poll-lus niet.
  - **Nieuwe werking van `scorebordWacht`:** dezelfde timer, ander werk. Hij haalt nog steeds op
    wat de overlay zelf ophaalt, maar stuurt nu een **`refreshSource`** voor de bron `Scoreboard`
    zodra de stand is veranderd — hooguit eens per `SCOREBORD_REFRESH_MIN` minuten (standaard 10).
    Verandert er niets, dan geen refresh: een bevroren bron doet op dat moment geen kwaad, want er
    is toch niets nieuws te tonen.
  - **Voor álle streams**, niet alleen competitie: een browserbron kan op elke avond bevriezen.
    Wel alleen op tafels die de agent als `streaming` meldt.
  - **Vervallen:** het verbergen bij stilstand en de app-setting `SCOREBORD_STIL_MIN`. Die regel
    rustte op de weerlegde aanname en zou een kloppend scorebord kunnen verbergen tijdens een
    trage partij. `SCOREBORD_WACHT` (standaard aan) blijft de aan/uit-schakelaar.
  - **Kosten:** verwaarloosbaar. De timer draait toch al elke minuut — dat bepaalt de
    Flex Consumption-rekening, niet of hij een commando wegschrijft. De werkelijke prijs is
    zichtbaar: de bron is bij een refresh ongeveer een seconde uit beeld. Vandaar de rem van 10
    minuten, zonder deploy bij te stellen.
