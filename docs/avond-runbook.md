# Avond-runbook — na de toernooien (11-07 e.v.)

Stappenplan voor als de streams vrij zijn: backend veilig herstarten, kwaliteit
gelijktrekken, de echte agent op alle 4 tafels, en de acceptatietest (#11). Doe dit
**buiten toernooitijd** en in overleg met Nick.

## 0. Uitgangspunt
- De Function App staat **gestopt** (om interferentie tijdens de toernooien te
  voorkomen). De **live app draait nog de oude code**; de nieuwe code (armed-schakelaar,
  stopped-fix, agent-robuustheid) staat op `develop` maar is **nog niet gedeployed**.
- `AUTOMATION_ARMED` staat straks default `false` → de timers doen niets tenzij we 't
  bewust aanzetten. Handmatige bediening (dashboard) werkt altijd.

## 1. Backend VEILIG herstarten + deployen
> Risico: als je de app "gewoon" start, draait de OUDE code en maken de timers
> opnieuw broadcasts aan voor geïmporteerde toernooien. Daarom eerst de timer-Functions
> uitzetten, dán starten, dán de nieuwe code deployen.

```powershell
$app="mokum-streams-func"; $rg="rg-mokum-streams"
# 1a. Timer-Functions tijdelijk uitzetten (host-niveau, los van de code)
az functionapp config appsettings set -n $app -g $rg --settings `
  AzureWebJobs.createBroadcasts.Disabled=true `
  AzureWebJobs.checkStops.Disabled=true `
  AUTOMATION_ARMED=false
# 1b. App starten (timers staan uit → veilig)
az functionapp start -n $app -g $rg
# 1c. Nieuwe code deployen
cd backend; func azure functionapp publish $app --javascript
# 1d. Health check
Invoke-RestMethod "https://$app.azurewebsites.net/api/health"
# 1e. Timers weer inschakelen (ze zijn nu gated door AUTOMATION_ARMED=false)
az functionapp config appsettings set -n $app -g $rg --settings `
  AzureWebJobs.createBroadcasts.Disabled=false `
  AzureWebJobs.checkStops.Disabled=false
```
Nu draait de nieuwe code, timers **slapend** (armed=false). Dashboard/ad-hoc werkt.

## 2. Streamkwaliteit gelijktrekken (issue #16) — alle 4 tafels
Per OBS-instantie (zie #16 voor de definitieve config):
- Video → 1920×1080, **60 fps**
- Output → bitrate **9000**, NVENC H.264, preset **P6**, Psycho Visual + Look-Ahead aan, CBR, keyframe 2s
- Camerabron → Scale Filtering **Lanczos**
- **Load-test:** draai alle 4 tegelijk, check dropped frames / "Encoding overloaded".
  Rood? → terug naar **1080p30** of preset P4. Liever stabiel 1080p30 dan haperend 1080p60.

## 3. Stream keys per tafel controleren
Elke OBS-instantie moet de **seeded stream key** van die tafel gebruiken (zodat de
backend-broadcasts correct binden). In YouTube Studio → *Manage stream keys* staan
`Mokum Streams — Tafel 1/3/15/16`. Zet de juiste per OBS-instantie (Settings → Stream).
`config/tables.json` bevat de bijbehorende `streamId`s (via de seed).

## 4. Echte agent op de OBS-pc (alle 4 tafels)
De echte agent (`agent/`) i.p.v. het testscriptje. Op de OBS-pc (heeft Node):
1. Code erheen: `git clone` van de repo, of de `agent/`-map kopiëren.
2. `cd agent; npm ci`
3. `Copy-Item agent-config.example.json agent-config.json` (ports 4455–4458 staan al goed; sceneName null = huidige programmascène).
4. Secrets via env (niet in het bestand):
   - `$env:AGENT_TOKEN = "<agent-token>"`
   - `$env:OBS_PASSWORD_TAFEL_1 = "..."` (idem 3/15/16)
5. `npm start` → "agent gestart — 4 tafel(s), poll elke 3000ms".
6. Later als Windows-service (NSSM/node-windows) — zie `agent/README.md`.

## 5. Testen
- **Ad-hoc (bewezen):** dashboard → + Nieuwe stream → tafel kiezen → unlisted → Start.
  Agent start OBS → YouTube live. Overlays togglen. Stop. (Werkt al; nu voor 4 tafels.)
- **#11 acceptatietest (volautomatisch, gepland):** zet `AUTOMATION_ARMED=true`, zorg
  voor een **testtoernooi in Cuescore** (dummy-spelers) met een starttijd binnen het
  pre-roll-venster, en kijk of de timer vanzelf de broadcast maakt + de agent start,
  en na afloop stopt. **Zet `AUTOMATION_ARMED` daarna weer op `false`** tot productie.

## 6. Opruimen
- Oude test-/auto-broadcasts op het kanaal (unlisted/leeg) verwijderen via YouTube Studio.
- Deze sessie samenvatten in de wiki-log.
