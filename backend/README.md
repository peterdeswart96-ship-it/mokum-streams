# backend — Mokum Streams (Azure Functions)

Azure Functions-backend (Node.js, **v4-programmeermodel**) die straks:

- op tijd **YouTube-broadcasts aanmaakt** (timer-trigger, titel uit Cuescore);
- een **HTTP-API** biedt voor het dashboard, de live-pagina/widget en de agent;
- **secrets** (YouTube OAuth) leest uit Key Vault `kv-mokum-streams`.

Zie het API-contract in [`../docs/api-contract.md`](../docs/api-contract.md) en de
architectuur in de wiki (`wiki/architecture.md`).

## Status
Dit is het **map-skeleton** (issue #7). Er zit nog maar één functie in als
levensteken: `GET /api/health`. De echte functies volgen:

- #8 — YouTube API-wrapper (`liveBroadcasts` + `liveStreams`)
- #9 — broadcast aanmaken op basis van het schema (`liveBroadcasts.insert`)
- #10 — agent-koppeling (OBS-websocket, meerdere portable instanties)
- #11 — end-to-end test (testcase: Fluke ranking, di 19:30, tafel 1 & 3)

## Mapstructuur
```
backend/
├─ host.json                    # runtime-config (extension bundle v4)
├─ package.json                 # dependencies + scripts, main = src/functions/*.js
├─ local.settings.json.example  # voorbeeld; kopieer naar local.settings.json (NIET committen)
├─ .funcignore                  # wat NIET meegaat bij deploy
└─ src/functions/
   └─ health.js                 # GET /api/health — levensteken
```

In het v4-model registreert elke functie zichzelf via `app.http(...)` /
`app.timer(...)`; er zijn géén losse `function.json`-bestanden meer.

## Lokaal draaien
Vereist: **Node.js 20** en de **Azure Functions Core Tools v4** (`func`).

```powershell
# eenmalig: dependencies installeren
npm ci

# lokale instellingen aanmaken (bevat straks connection strings — wordt genegeerd door git)
Copy-Item local.settings.json.example local.settings.json

# de functions-host starten
npm start   # = func start
```

Test daarna in een tweede terminal:

```powershell
curl http://localhost:7071/api/health
# verwacht: { "service": "mokum-streams-backend", "status": "ok", "time": "..." }
```

## Deploy
CI/CD via `.github/workflows/` (develop = test, main = productie). De echte
Azure-deploy wordt in fase 2 ingericht met
`func azure functionapp publish <app>` zodra de Function App bestaat — zie
`wiki/conventions.md`.
