# Backup & herinstallatie-runbook — streaming-pc (2026-07-13)

> **Gekozen aanpak (13-07):** géén volledige disk-image, maar **documenteren + config
> backuppen (GitHub + Azure) + een herinstallatie-draaiboek**. Reden: de unieke data is
> klein/tekst-vriendelijk en een paar dagen downtime is acceptabel. Goedkoop, geen extra
> hardware, gebruikt wat we al hebben (GitHub-repo, `rg-mokum-streams` storage + Key Vault).
> Vervangt de eerdere Veeam-image-route (die blijft optioneel, zie onderaan).

## 1. Documenteren (bron van waarheid)
- **`docs/obs-standaard.md`** = de complete OBS-instellingen: kwaliteit-standaard, bronnamen,
  Scoreboard-URL's per tafel, websocket-poorten. Houd dit actueel.
- **`docs/obs-herstel-runbook.md`** = scenes terugzetten + uit OneDrive + agent.
- Dit document = wat waar geback-upt wordt + het **herinstallatie-draaiboek** (§4).

## 2. Wat gaat waar? (repo is PUBLIC → secrets nooit in GitHub)
| Onderdeel | Bevat secret? | Bewaarplek |
|---|---|---|
| Scene-collection JSON's (per tafel) | nee (stream key zit NIET in de scene collection) | **GitHub** → `obs-config/` |
| `agent-config.json` (template) | nee (tokens in env) | **GitHub** → `obs-config/agent-config.template.json` |
| Overlay-assets (QR-html, e.d.) | nee | **GitHub** → `overlays/`, `frontend/public/overlays/` |
| Sponsorafbeeldingen | nee, maar binair | **Azure Blob** (privé container `obs-backup`) |
| Volledige portable OBS-map (incl. profiel MÉT stream keys) | **JA** | **Azure Blob** (privé) — nooit GitHub |
| `AGENT_TOKEN`, OBS-websocket-wachtwoorden | **JA** | **Azure Key Vault** `kv-mokum-streams` |
| Stream keys | **JA** | Herleidbaar via de backend (`/api/manage/setup/streams`); of in de Azure-bundel |

## 3. Backuppen — hoe
### a) GitHub (handmatig, versioned, gratis)
1. In elke OBS: **Scene Collection → Export** → sla op als `obs-config/tafel-<N>.json`.
2. Commit die JSON's naar de repo (via develop → main, zoals gewoonlijk).
3. Controleer vóór commit dat er **geen stream key/wachtwoord** in de JSON staat (zou er niet
   in moeten zitten; bij twijfel even laten checken).
→ Hiermee staan de **scenes/bronnen** versie-gecontroleerd veilig; terugzetten = importeren.

### b) Azure Blob (binaries + volledige bundel, privé)
- Container **`obs-backup`** in de bestaande storage van `rg-mokum-streams`.
- Script **`scripts/obs-backup.ps1`** zipt `C:\MokumOBS` + `C:\Mokum-Sponsors` (+ agent-config)
  en uploadt naar de container. Draai 'm handmatig of via Task Scheduler (wekelijks is genoeg).
- Auth: connection string in env (`AZURE_STORAGE_CONNECTION_STRING`) — niet in het script/repo.
- Deze zip bevat stream keys → **privé container**, versleutel evt. extra (7-Zip AES).

### c) Azure Key Vault (secrets)
- Zet als secrets in `kv-mokum-streams`: `agent-token`, `obs-password-tafel-1/3/15/16`.
- Zo staan de secrets veilig en centraal; het draaiboek haalt ze daar op.

## 4. Herinstallatie-draaiboek (van kale pc → streams live)
Strektijd: ~30–60 min. Volgorde:
1. **Windows** installeren + updaten; **NVIDIA-drivers** (NVENC nodig).
2. **OBS Studio (portable)** downloaden → uitpakken naar `C:\MokumOBS\Tafel-1..16`.
3. **Config terugzetten:**
   - Scenes: pak `obs-config/tafel-<N>.json` uit de repo → OBS **Scene Collection → Import**.
   - Sponsorafbeeldingen: uit de Azure-bundel → `C:\Mokum-Sponsors\`; her-koppel de
     `Sponsor slideshow` naar die map.
   - (Sneller alternatief: de **volledige portable-map** uit de Azure-bundel terugzetten.)
4. **Secrets invullen** (uit Key Vault): OBS-websocket-wachtwoorden (Tools → WebSocket
   Server Settings, poort 4455/4456/4457/4458), stream key per tafel (Settings → Stream;
   of opnieuw ophalen via de backend), `AGENT_TOKEN` als env voor de agent.
5. **Kwaliteit** volgens `docs/obs-standaard.md` (1080p60, CBR 16000, NVENC P6).
6. **Controle** per tafel via `docs/obs-herstel-runbook.md` §4 (bronnamen exact, Scoreboard-URL).
7. **Agent** starten (`docs/obs-herstel-runbook.md` §7) → dashboard-knoppen werken weer.
8. **Netwerk/remote:** Tailscale + RustDesk/Chrome Remote Desktop opnieuw koppelen.
9. **Tot slot:** verse Azure-bundel maken (goede staat vastleggen).

## 5. Onderhoud
- Na elke wijziging aan de overlays/instellingen: **JSON opnieuw exporteren + committen**
  en (wekelijks/na wijziging) de **Azure-bundel** verversen.
- **Test één keer** een import van een JSON + het terugzetten van de Azure-bundel op een
  reserve-map, zodat je weet dat het werkt.

## Optioneel — volledige disk-image (indien je tóch snellere restore wilt)
Veeam Agent for Windows (gratis) → image + recovery-USB naar een externe schijf. Snelste
restore bij zelfde hardware. Niet nodig voor de gekozen aanpak, maar een prima aanvulling
als downtime later tóch kritischer wordt.
