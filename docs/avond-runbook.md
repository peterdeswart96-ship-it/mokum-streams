# Avond-runbook — uitrol na de toernooien

Afvinkbare checklist voor als de streams vrij zijn. Doe dit **buiten toernooitijd** en
in overleg met Nick. Bijgewerkt **2026-07-11 (avond)**.

## Al gedaan vandaag ✅
- Kwaliteit **1080p60 / NVENC / 9000 kbps / Normale latentie** op **alle 4 tafels** (#16 opgelost).
- **Officiële Cuescore-overlay** (Nederlands, spelersfoto's) op alle 4 + sponsors rechtsboven uitgelijnd.
- Backend + frontend **één keer gedeployed**; dashboard live op mokum-streams.pdscloud.nl.
- App draait, timers **uit** (`AzureWebJobs.*.Disabled=true`) + `AUTOMATION_ARMED=false` → slapend.

## Nog te doen vanavond

### 1. Her-deploy (nieuwe code sinds vanmiddag: v0.11 break-overlays + rotatie)
- [ ] **Backend** (app draait al, timers slapend → simpel opnieuw publishen):
  ```powershell
  cd backend; func azure functionapp publish mokum-streams-func
  Invoke-RestMethod "https://mokum-streams-func.azurewebsites.net/api/health"
  ```
- [ ] **Frontend** → merge `develop`→`main` (jij pusht; triggert Pages):
  ```powershell
  git checkout main; git merge --ff-only develop; git push origin main; git checkout develop
  ```

### 2. Kwaliteit-load-test (config staat al goed, alleen stabiliteit checken)
- [ ] Draai **alle 4 OBS tegelijk** op 1080p60 en kijk naar **dropped frames / "Encoding overloaded"**.
- [ ] Rood? → één of meer tafels terug naar **1080p30** of preset **P4**. Liever stabiel dan haperend.
- [ ] Let ook op CPU/GPU met alles aan (relevant voor latere NDI-PiP, zie `break-productie.md`).

### 3. OBS-opruiming + nieuwe bronnen (per instantie, alle 4)
- [ ] **Hernoem** `Scoreboard Cuescore` → **`Scoreboard`** en **verwijder** de oude pixelgrid-`Scoreboard`.
      *(Anders schakelt de dashboardknop "Scorebord" de verkeerde bron — zie obs-standaard.)*
- [ ] Voeg bron **`Jumbotron`** toe: *Browser*, `https://cuescore.com/venue/table/jumbotron/?venueId=60451687&branchId=1`, 1920×1080, **verborgen**, bovenaan.
- [ ] Voeg bron **`Pauzemelding`** toe: *Text (GDI+)*, tekst bijv. "We wachten op de volgende wedstrijd…", **verborgen**, bovenaan.
- [ ] Zet **`Scores other tables`** op de **bovenbalk-plek** (voor de rotatie-ticker) — bron mag verborgen blijven, de agent-rotatie toggelt 'm.
- [ ] **obs-websocket** aan per instantie (Tools → WebSocket Server Settings → Enable, poort 4455/4456/4457/4458 + wachtwoord noteren) indien nog niet gedaan.

### 4. Stream keys per tafel
- [ ] Elke OBS op de **`Mokum Streams — Tafel N`**-key zetten (Settings → Stream) zodat backend-broadcasts correct binden.
- [ ] Nicks **dubbele** handmatige `Tafel N`-keys opruimen (in overleg).

### 5. Echte agent op de OBS-pc (alle 4 tafels)
- [ ] Code ophalen: `git clone` (of `git pull` als de repo er al staat) — bevat alle code van vandaag.
- [ ] `cd agent; npm ci`
- [ ] `Copy-Item agent-config.example.json agent-config.json` (poorten 4455–4458 staan goed; `rotations` staat al ingevuld: `scoresOtherTables` elke 180s, 20s).
- [ ] Secrets via env (niet in het bestand):
  ```powershell
  $env:AGENT_TOKEN = "<agent-token>"
  $env:OBS_PASSWORD_TAFEL_1 = "..."   # idem 3/15/16
  ```
- [ ] `npm start` → agent pollt de backend, meldt status (dashboard toont dan live kwaliteit + overlay-standen), en draait de rotatie.
- [ ] Later als **Windows-service** (NSSM/node-windows) — zie `agent/README.md`.

### 6. Verifiëren
- [ ] **Dashboard**: tafels tonen live status + **1080p60** + overlay-standen; toggles werken (incl. Jumbotron/Pauzemelding).
- [ ] **Rotatie**: `Scores other tables` verschijnt periodiek in de bovenbalk.
- [ ] **Ad-hoc start**: dashboard → + Nieuwe stream → unlisted → Start → agent start OBS → YouTube live → Stop.
- [ ] **#11 acceptatietest** (volautomatisch): `AUTOMATION_ARMED=true`, een **testtoernooi in Cuescore** (dummy-spelers, starttijd binnen pre-roll-venster) → timer maakt broadcast + agent start → na afloop stop. **Zet daarna `AUTOMATION_ARMED` weer op `false`.**
- [ ] **Automatisch pauzescherm (A, optioneel):** pas nadat de agent draait én de OBS-bronnen `Jumbotron` + `Pauzemelding` bestaan → app-setting **`PAUZESCHERM_AUTO=true`**. De timer `pauzeScherm` zet dan tussen wedstrijden vanzelf het pauzescherm aan/uit (per streamende tafel, 20s debounce). Los van `AUTOMATION_ARMED`. Zie `docs/pauzescherm-auto.md`.

### 7. Opruimen
- [ ] Oude test-/auto-broadcasts (unlisted/leeg) verwijderen via YouTube Studio.
- [ ] Sessie samenvatten in de wiki-log (`/wiki-update`).

## Belangrijke waarden
- Function App: `mokum-streams-func` · resource group `rg-mokum-streams`
- Cuescore venueId `60451687` (branchId 1) · tafel-id's 1=61403749, 3=61403764, 15=61403800, 16=61403803
- Timers blijven **gated door `AUTOMATION_ARMED`** — vóór scherpzetten de planning nalopen welke toernooien echt automatisch mogen.
