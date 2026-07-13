# obs-config — geback-upte OBS scene-collections (per tafel)

Hier komen de **Scene Collection → Export** JSON's van elke OBS-instantie, zodat de
overlay-config versie-gecontroleerd in GitHub staat. Zie `docs/obs-backup-runbook.md`.

## Wat hier hoort
- `tafel-1.json`, `tafel-3.json`, `tafel-15.json`, `tafel-16.json` — de geëxporteerde
  scene collections (scenes + bronnen). **Bevat geen stream keys** (die zitten in het OBS-
  profiel, niet in de scene collection).

## Wat hier NIET hoort (repo is PUBLIC)
- **Stream keys**, **websocket-wachtwoorden**, `AGENT_TOKEN` → Azure Key Vault `kv-mokum-streams`.
- **Sponsorafbeeldingen** / de volledige portable OBS-map (met profiel) → privé Azure Blob
  (`obs-backup`), zie het runbook.

## Terugzetten
OBS → **Scene Collection → Import** → kies `tafel-<N>.json` → er naartoe wisselen.
Controleer daarna de bronnamen + Scoreboard-URL via `docs/obs-herstel-runbook.md` §4.

## Agent-config
De template staat in `agent/agent-config.example.json` (poorten 4455–4458, secrets via env).

> Vóór committen even checken dat er geen stream key/wachtwoord in de JSON is beland
> (zou er niet in moeten zitten).
