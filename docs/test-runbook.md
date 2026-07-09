# Testrunbook — eerste echte test (Mokum Streams)

Gefaseerd testen met een **vrije camera/OBS-instantie** (bijv. Tafel 3 of 16),
van laag naar hoog risico. Doe dit **in overleg met Nick** en bij voorkeur buiten
toernooitijd. Doel: bewijzen dat agent → OBS → YouTube werkt, zonder onbedoeld
publiek te gaan.

## Vooraf (per te testen OBS-instantie)
1. **obs-websocket aanzetten:** in die OBS-instantie → *Tools → WebSocket Server
   Settings* → *Enable*, noteer **poort** (uniek per instantie, bijv.
   4455/4456/4457/4458) en **wachtwoord**.
2. **Bronnamen noteren:** de overlay-bronnamen verschillen per instantie
   (screenshot toont o.a. `gO`, `sPON`, `bUFFAL`, `KaMUI`). Noteer de **exacte**
   naam van de sponsors-bron en de scoreboard-bron ("cs score") voor die tafel.
   > Als een overlay-naam niet klopt, faalt alleen dát `setOverlay`-commando
   > (de agent logt het en gaat door) — de **stream zelf werkt gewoon**.

## Backend draaien (voor de test)
Kies één:
- **Lokaal** (snelst voor een test): op de OBS-pc of Peters pc
  `cd backend; npm ci; func start` (vereist Azure Functions Core Tools + Azurite
  voor storage). De agent wijst dan naar `http://localhost:7071`.
- **Azure** (echte deploy): volg `docs/azure-setup.md`.

## Agent draaien
`cd agent; npm ci; Copy-Item agent-config.example.json agent-config.json` → vul in:
`backendUrl`, en per tafel de obs-websocket `port` + wachtwoord (via env
`OBS_PASSWORD_TAFEL_<nr>`). Zet `AGENT_TOKEN` gelijk aan de backend. `npm start`.

## Fase 1 — Agent ↔ OBS (nul risico, geen stream)
Bewijs dat de agent OBS kan aansturen zónder live te gaan: laat de agent een
**overlay togglen** en kijk of de bron in OBS aan/uit gaat.
- Zet een `setOverlay`-commando in de wachtrij (bijv. via een tijdelijke
  `commands.json` of een klein obs-websocket-scriptje) voor die tafel/bron.
- Verwacht: de bron gaat zichtbaar aan/uit in de OBS-preview. ✅ Dit bewijst de
  hele lokale koppeling (poort, wachtwoord, bronnaam) zonder YouTube.

## Fase 2 — Gecontroleerde live-test (UNLISTED)
Nu één keer echt live, maar **niet publiek**:
1. Zorg dat `config/tables.json` voor de testtafel een `streamId` heeft dat hoort
   bij de **stream key die in die OBS-instantie staat**. Twee wegen:
   - **Bestaande key hergebruiken** (minst invasief): zoek via YouTube Studio /
     `liveStreams.list` het `streamId` van de key die de instantie al gebruikt en
     zet dat in `config/tables.json`.
   - **Nieuwe key seeden:** `POST /api/manage/setup/streams`, lees de nieuwe key in
     YouTube Studio en zet die in de OBS-instantie (Stream-instellingen).
2. Start ad-hoc **unlisted**:
   ```powershell
   curl -X POST "<backend>/api/manage/streams/start" `
     -H "Authorization: Bearer <ADMIN_TOKEN>" -H "Content-Type: application/json" `
     -d '{ "tableNumber": 3, "title": "Test", "privacy": "unlisted" }'
   ```
   Verwacht: broadcast aangemaakt (unlisted) → agent start OBS → binnen ~30 s
   **unlisted live** op het kanaal. Controleer ook `GET /api/live`.
3. Stoppen:
   ```powershell
   curl -X POST "<backend>/api/manage/streams/stop" `
     -H "Authorization: Bearer <ADMIN_TOKEN>" -H "Content-Type: application/json" `
     -d '{ "tableNumber": 3 }'
   ```
   Verwacht: agent `StopStream` → `enableAutoStop` sluit de broadcast (~1 min).

## Fase 3 — Volautomatisch (op een toernooiavond)
Zet een gepland toernooi in het dashboard **enabled** op de testtafel. Verwacht:
`createBroadcasts` maakt vlak vóór de start de broadcast + startcommando's aan,
de stream gaat live met de Cuescore-titel, en `checkStops` stopt 'm zodra Cuescore
het toernooi `Finished` meldt. Dit is de acceptatietest van **#11**.

## Aandachtspunten
- Begin met **unlisted** en één tafel; schaal daarna op.
- OBS-mappen op OneDrive (gaps #9) — bij voorkeur eerst buiten OneDrive zetten.
- Overlay-bronnamen per tafel invullen in `config/tables.json` (`overlaySources`).
