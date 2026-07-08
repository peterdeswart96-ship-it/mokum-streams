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
  "tables": [
    {
      "tableNumber": 15,
      "status": "live" | "scheduled" | "offline",
      "videoId": "_TG4cEuVt98" | null,
      "title": "Tafel 15 Fluke ranking 9ball Seizoen 3 #22" | null,
      "scheduledStart": "2026-07-08T17:30:00Z" | null,
      "tournamentName": "Fluke ranking 9ball Seizoen 3 #22" | null
    }
  ]
}

GET /api/schedule?days=7
Antwoord: { "items": [ { "date", "startTime", "tournamentName", "tableNumbers": [..] } ] }

## Beheer (dashboard, auth vereist)
GET  /api/admin/config              -> tafelconfig, array van { tableNumber, streamId }
GET  /api/admin/planning?days=14    -> geplande toernooien (Cuescore-import + instellingen)
POST /api/admin/planning/{id}       -> instellingen van één toernooi wijzigen
GET  /api/admin/defaults            -> standaard-instellingen (één set, zie hieronder)
POST /api/admin/defaults            -> standaard-instellingen wijzigen
POST /api/admin/streams/start       -> body: { "tableNumber": 15, "title"?: "..." } (ad-hoc, vrije camera)
POST /api/admin/streams/stop        -> body: { "tableNumber": 15 }

Tafelconfig (GET /api/admin/config) — array:
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

Planning-record (GET /api/admin/planning → `{ "items": [ ... ] }`):
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
POST /api/admin/planning/{id} — body met te wijzigen velden (enabled, startOverride,
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

Standaard-instellingen (GET/POST /api/admin/defaults) — één set, toegepast bij
import:
{
  "enabled": true,
  "tafels": [1, 3, 15, 16],          // standaard alle camera's
  "preRollMinuten": 10,
  "overlays": { "sponsors": true, "scoreboard": true }
}

Ad-hoc stream (POST /api/admin/streams/start met een vrije camera):
- `tableNumber` verplicht; `title` optioneel (default `Tafel {nr}`).
- Een tafel is "vrij" als er nu geen geplande/lopende stream op draait.

## Interne opslag (Blob JSON — geen publiek endpoint, maar wel de bron voor /api/live)
- `config/tables.json`      — tafelconfig (zie GET /api/admin/config)
- `config/defaults.json`    — standaard-instellingen (één set, toegepast bij import)
- `planning.json`           — planning-records (Cuescore-import + overrides + ad-hoc)
- `broadcasts/<datum>.json` — per aangemaakte broadcast:
  { "tableNumber", "videoId", "broadcastId", "title", "scheduledStart" }
  Dit voedt GET /api/live (koppelt tafel -> videoId + titel + status).

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
    { "id": "c3", "type": "setOverlay",  "tableNumber": 1, "sourceName": "cs score", "enabled": true }
  ]
}
- `type`: `startStream` | `stopStream` | `setOverlay`.
- `setOverlay` zet een OBS-bron (overlay/scoreboard) aan of uit (`enabled`).
- De agent bevestigt verwerkte commando's via de status-post (`verwerkteCommandoIds`),
  zodat de backend ze niet opnieuw stuurt.

POST /api/agent/status  -> OBS-/streamstatus per tafel + bevestigingen
Body:
{
  "agentTime": "2026-07-08T18:00:00Z",
  "verwerkteCommandoIds": ["c1", "c2"],
  "tables": [
    { "tableNumber": 1, "obsConnected": true, "streaming": true, "bitrateKbps": 5200 }
  ]
}

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
  i.p.v. per-weekdag-templates. Ad-hoc streams via `/api/admin/streams/start`
  (vrije camera, optionele titel, default `Tafel {nr}`). Nieuwe opslag
  `config/defaults.json` + `planning.json` (vervangt `config/schedule.json`).
  Endpoints `/api/admin/planning[/{id}]` en `/api/admin/defaults`. Bevestigd door
  Peter (8 juli): import-alles, standaard alle camera's, scorebord + sponsors aan,
  preRoll 10 min, ad-hoc titel `Tafel {nr}`.
- 2026-07-08: v0.5 — planning-record krijgt `type` (`tournament` | `competition`).
  Competities (leagues) komen via dezelfde import binnen (staan ook op de org-
  pagina) maar zijn **doorlopend** (meerdaagse span) → streameenheid = wedstrijden
  per avond; auto-stop per avond i.p.v. `status=Finished`. Camera-toewijzing bij
  overlappende events wordt **automatisch afgeleid uit Cuescore's tafeltoewijzing
  per wedstrijd** met handmatige override (bevestigd Peter). Per-avond-afleiding +
  dashboard nog uit te werken.
