# Backup & restore-runbook — streaming-pc (2026-07-13)

> Doel (prioriteit): **1)** snel een restore kunnen doen op een nieuwe pc/schijf zodat de
> streams weer werken, **2)** zoveel mogelijk geautomatiseerd, **3)** kosten zo laag mogelijk.
> Aanpak = **gelaagd**: een volledige disk-image (snelste restore, zelfde hardware) + een
> kleine config-bundel off-site (snelste route op ándere hardware, bijna gratis) + de
> reproduceerbare documentatie.

## Wat er beschermd moet worden
Kritiek en **klein** (verandert zelden):
- `C:\MokumOBS\` — de 4 portable OBS-mappen (scenes, profielen, kwaliteit, websocket, **stream keys**)
- `C:\Mokum-Sponsors\` — sponsorafbeeldingen + overlay-assets
- `agent-config.json` + de env-secrets (`AGENT_TOKEN`, `OBS_PASSWORD_TAFEL_*`)
- Tailscale/RustDesk-config
Groot maar herinstalleerbaar: Windows + OBS-installatie + GPU/NVENC-drivers.

## Twee restore-scenario's (bepaalt de aanpak)
| Scenario | Snelste redmiddel |
|---|---|
| **Zelfde pc, nieuwe/kapotte schijf** | Volledige **disk-image** terugzetten → boot → klaar (~15–30 min) |
| **Andere/nieuwe pc** | Verse OBS-portable + de **config-bundel** erin (een image boot vaak niet op afwijkende hardware) |

---

## Laag 1 — Volledige disk-image (Veeam Agent for Windows, gratis)
Snelste restore bij zelfde hardware; kan ook naar afwijkende hardware (driver-injectie).
1. Installeer **Veeam Agent for Windows (Free)**.
2. **Backup job:** doel = **externe SSD/HDD** (of NAS). Schema: **wekelijks volledig +
   dagelijks incrementeel**. "Entire computer" of minimaal de systeemschijf.
3. Maak de **Recovery Media (USB)** aan en berg 'm bij de pc.
4. **Maak de eerste image ná** het OBS-herstel + OneDrive-fix (dan zit de góéde staat erin).
5. **Restore:** boot de recovery-USB → kies de laatste image → terugzetten.
- **Kosten:** software gratis; alleen een externe schijf (~€50 eenmalig, herbruikbaar).
- Alternatieven (ook gratis): AOMEI Backupper Standard, Hasleo Backup Suite, Macrium/Clonezilla.

## Laag 2 — Config-bundel, geautomatiseerd + off-site (bijna gratis)
Script: **`scripts/obs-backup.ps1`** — zipt de kritieke config, roteert lokaal, en pusht
**eenrichting** naar de cloud via `rclone` (géén live twee-weg-sync zoals OneDrive — dat was
juist het probleem).

**Eenmalig instellen:**
1. Installeer **rclone** (`winget install Rclone.Rclone`) en configureer één remote:
   - `rclone config` → **Backblaze B2** (aanrader, centen/maand) *of* **Google Drive** (gratis, 15GB).
   - Noem de remote bv. `b2` en maak een **privé** bucket `mokum-obs-backup`.
2. Pas bovenin `scripts/obs-backup.ps1` de paden + `$RcloneRemote` aan (bv. `b2:mokum-obs-backup`;
   leeg = alleen lokaal). Zet `$LokaalDoel` op de externe schijf.
3. **Test handmatig:** `pwsh -File scripts\obs-backup.ps1` → controleer de zip + `backup.log`
   + dat 'ie in de bucket staat.
4. **Plan met Task Scheduler** (dagelijks, bv. 04:00):
   - Program: `pwsh.exe` (of `powershell.exe`)
   - Arguments: `-NoProfile -ExecutionPolicy Bypass -File "C:\pad\naar\scripts\obs-backup.ps1"`
   - "Run whether user is logged on or not" + "Run with highest privileges".
- **Kosten:** rclone gratis; B2 ≈ **paar cent/maand** voor een paar honderd MB (of Drive gratis).

## Laag 3 — Reproduceerbaar via documentatie (gratis)
`docs/obs-standaard.md` (config-standaard + bronnamen) en `docs/obs-herstel-runbook.md`
(scenes importeren, uit OneDrive, websocket, agent) maken een schone herinstallatie
reproduceerbaar. **Scene-collection JSON's (zonder secrets)** kun je in de repo versioneren;
stream keys/wachtwoorden **niet** in de repo.

---

## Secrets (belangrijk)
- De backup-zip bevat **stream keys** (in de OBS-profielen). Bewaar 'm daarom in een **privé**
  bucket/Drive, óf **versleuteld**: met 7-Zip AES-256, of een `rclone crypt`-remote.
  - 7-Zip-variant (i.p.v. de Compress-Archive-regel): installeer 7-Zip en zip met
    `-p<wachtwoord> -mhe=on` (wachtwoord uit een env-var, niet in het script).
- `AGENT_TOKEN` + `OBS_PASSWORD_TAFEL_*` bewaar je in een **wachtwoordkluis** (niet in de repo/zip).
- Kwijt geraakt? De **herbruikbare stream keys** kunnen we via de backend opnieuw ophalen/zetten
  (`/api/manage/setup/streams`), maar dan opnieuw in OBS plakken.

## Restore-procedures
**A. Zelfde pc, nieuwe schijf:** boot Veeam recovery-USB → laatste image terugzetten → klaar.
**B. Nieuwe/andere pc:** installeer Windows + NVIDIA-drivers + OBS (portable), pak de laatste
config-bundel uit → `C:\MokumOBS\` + `C:\Mokum-Sponsors\` terugzetten → OBS vanaf `C:\MokumOBS`
starten → websocket-wachtwoorden + `AGENT_TOKEN` opnieuw zetten → volg `obs-herstel-runbook.md`
voor de check. Streams weer live in ~30 min.

## Test je restore (één keer!)
Een ongeteste backup is geen backup. Zet minimaal **één keer** de config-bundel terug op een
reserve-schijf/pc en start OBS, en doe een proef-boot van de Veeam-image. Herhaal na grote
wijzigingen.

## Optioneel — koude reserve-pc
De állersnelste swap: een tweede pc met alles vooraf geïnstalleerd, uit in de kast. Kost een
extra pc; voor lage kosten is image + externe schijf de sweet spot.

## Kosten-samenvatting
| Onderdeel | Kosten |
|---|---|
| Veeam Agent Free + rclone + Task Scheduler | **gratis** |
| Externe SSD/HDD (image + lokale bundel) | ~€50 eenmalig |
| Cloud off-site (Backblaze B2) | ~centen/maand — of Google Drive **gratis** |
