# agent — Mokum Streams (OBS-agent)

Lokale Node.js-agent die op de streaming-pc draait en de **meerdere portable
OBS-instanties** aanstuurt via `obs-websocket`. De agent maakt **alleen uitgaande
HTTPS-verbindingen** naar de Azure-backend: hij pollt commando's op en stuurt
status terug. Er hoeft dus **geen enkele poort** open in de zaalfirewall.

Zie het agent-protocol in [`../docs/api-contract.md`](../docs/api-contract.md)
(v0.3) en de architectuur in de wiki (`wiki/architecture.md`,
`wiki/obs-websocket-reference.md`).

## Status
Dit is het **skeleton** (issue #10): werkende structuur en kernlogica, klaar om
tegen echte OBS-instanties + backend te draaien.

## Wat het doet
- Verbindt (lazy) met één OBS-instantie per tafel (eigen host/poort/wachtwoord).
- Voert commando's uit: `startStream`, `stopStream`, `setOverlay` (een OBS-bron
  zoals een sponsorlogo of het Cuescore-scoreboard aan/uit zetten).
- Rapporteert per tafel: `obsConnected`, `streaming`, `bitrateKbps`, en bevestigt
  verwerkte commando's (`verwerkteCommandoIds`).

## Mapstructuur
```
agent/
├─ index.js                    # entrypoint: laadt config, start de lus
├─ agent-config.example.json   # voorbeeld; kopieer naar agent-config.json (gitignored)
└─ src/
   ├─ config.js                # config laden + normaliseren (defaults, validatie)
   ├─ commands.js              # commando-validatie (puur)
   ├─ obs.js                   # ObsPool: obs-websocket per tafel (start/stop/overlay/status)
   ├─ backend.js               # commando's ophalen + status posten (uitgaande HTTPS)
   └─ agent.js                 # kernlus (runOnce/startLoop)
```

## Configuratie
Kopieer `agent-config.example.json` → `agent-config.json` (dit bestand is
gitignored). Vul per tafel de OBS-`port` in (elke portable instantie heeft een
eigen poort, bijv. 4455/4456/4457/4458).

**Secrets** (OBS-wachtwoorden, agent-token) bij voorkeur via env-vars, niet in
het bestand:
- `AGENT_TOKEN` — Bearer-token voor de backend.
- `OBS_PASSWORD_TAFEL_<nr>` — obs-websocket-wachtwoord per tafel (bijv.
  `OBS_PASSWORD_TAFEL_1`).

## Lokaal draaien
Vereist **Node.js 20**.
```powershell
npm ci
Copy-Item agent-config.example.json agent-config.json   # daarna invullen
npm start
```

## Tests
```powershell
npm test   # node --test — pure logica (config, commando-validatie, kernlus met fakes)
```

## Als Windows-service (op de streaming-pc)
De agent moet automatisch opstarten met de pc. Twee beproefde opties:
- **NSSM** (Non-Sucking Service Manager): `nssm install MokumStreamsAgent "C:\Program Files\nodejs\node.exe" "C:\pad\naar\agent\index.js"` — env-vars en working directory instelbaar in de NSSM-GUI.
- **node-windows**: een klein install-script dat de service registreert.

> Let op (remote beheer): gebruik een console-spiegelende schermtool (RustDesk /
> Chrome Remote Desktop) i.p.v. klassieke RDP — RDP vergrendelt de console en kan
> OBS-capture/NVENC verstoren. Zie `wiki/decisions.md`.

## Meer OBS-mogelijkheden
De agent gebruikt nu StartStream/StopStream/SetSceneItemEnabled/GetStreamStatus.
`obs-websocket` kan veel meer (scène wisselen, lokaal opnemen, microfoon dempen,
een browser-source-URL wijzigen, CPU/FPS-stats). Zie
`wiki/obs-websocket-reference.md` voor de curated referentie + feature-ideeën.
