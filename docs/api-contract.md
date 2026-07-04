# API-contract — Mokum Streams

Enige waarheid voor de koppelvlakken tussen frontend/widget, backend en (later) de
agent. Wijzigen? Eerst dit bestand bijwerken (met datum + reden onderaan), dan code.

Status: CONCEPT v0.1 — velden worden definitief in fase 2.

## Conventies
- Alle velden camelCase. Tijden in ISO 8601 met tijdzone (Europe/Amsterdam
  serverside bepaald, als UTC geserialiseerd). Tafelnummers = echte zaalnummering.
- Publieke endpoints: alleen lezen. Schrijfacties vereisen auth (zie backend/CLAUDE.md).

## Publiek (live-pagina + widget)
GET /api/live
Antwoord:
{
  "generatedAt": "2026-07-04T18:00:00Z",
  "tables": [
    {
      "tableNumber": 15,
      "sponsor": "GO Customs",
      "status": "live" | "scheduled" | "offline",
      "videoId": "_TG4cEuVt98" | null,
      "title": "Tafel 15 ‘GO Customs’ Amsterdam Open Qualifier 1" | null,
      "scheduledStart": "2026-07-04T19:30:00Z" | null,
      "tournamentName": "Amsterdam Open Qualifier 1" | null
    }
  ]
}

GET /api/schedule?days=7
Antwoord: { "items": [ { "date", "startTime", "tournamentName", "tableNumbers": [..] } ] }

## Beheer (dashboard, auth vereist)
GET  /api/admin/config          -> tafelconfig (tableNumber, sponsor, streamKeyRef)
GET  /api/admin/schedule        -> volledig schema incl. terugkerende regels
POST /api/admin/schedule        -> regel toevoegen/wijzigen
POST /api/admin/streams/start   -> body: { "tableNumber": 15 }  (handmatig ingrijpen)
POST /api/admin/streams/stop    -> body: { "tableNumber": 15 }

## Agent (fase 2, auth vereist) — richting, nog uit te werken
GET  /api/agent/commands        -> openstaande commandos (polling)
POST /api/agent/status          -> OBS-status, streamstatus, bitrate per tafel

## Wijzigingslog
- 2026-07-04: eerste concept (Peter + Claude).
