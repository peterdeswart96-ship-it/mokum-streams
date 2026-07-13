# obs-backup.ps1 — config-bundel-backup voor de streaming-pc (zie docs/obs-backup-runbook.md)
#
# Zipt de kritieke OBS-/agent-config + sponsorafbeeldingen, roteert lokaal, en pusht
# (eenrichting) naar de cloud via rclone. Bedoeld voor Windows Task Scheduler (dagelijks).
# LET OP: de zip bevat de OBS-profielen MÉT stream keys → bewaar op een privé-locatie
# (privé bucket / privé Drive) of versleutel (zie het runbook, sectie "Secrets").

$ErrorActionPreference = 'Stop'

# ── Instellingen (pas aan naar jouw pc) ─────────────────────────────────────
$Bronnen = @(
  'C:\MokumOBS',                       # de 4 portable OBS-mappen
  'C:\Mokum-Sponsors',                 # sponsorafbeeldingen + overlay-assets
  'C:\Mokum-Agent\agent-config.json'   # agent-config (zonder secrets; die staan in env)
)
$LokaalDoel   = 'D:\MokumBackup'       # externe schijf / tweede disk
$RcloneRemote = 'b2:mokum-obs-backup'  # rclone-remote:pad — leeg ('') = geen cloud-upload
$Bewaar       = 14                     # aantal lokale zips bewaren (rotatie)
$LogPad       = Join-Path $LokaalDoel 'backup.log'

# ── Uitvoering ──────────────────────────────────────────────────────────────
function Log($m) { $t = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'; "$t $m" | Tee-Object -FilePath $LogPad -Append }

New-Item -ItemType Directory -Force -Path $LokaalDoel | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$zip   = Join-Path $LokaalDoel "mokum-obs-$stamp.zip"

$teZippen = $Bronnen | Where-Object { Test-Path $_ }
if (-not $teZippen) { Log 'GEEN bronnen gevonden — gestopt. Controleer de paden bovenaan.'; exit 1 }
foreach ($b in $Bronnen) { if ($b -notin $teZippen) { Log "WAARSCHUWING: bron ontbreekt: $b" } }

Log "Zip maken: $zip"
Compress-Archive -Path $teZippen -DestinationPath $zip -CompressionLevel Optimal -Force
Log ('Zip klaar: {0:N1} MB' -f ((Get-Item $zip).Length / 1MB))

# Lokale rotatie: alleen de nieuwste $Bewaar zips behouden
Get-ChildItem $LokaalDoel -Filter 'mokum-obs-*.zip' | Sort-Object LastWriteTime -Descending |
  Select-Object -Skip $Bewaar | ForEach-Object { Log "Oud verwijderd: $($_.Name)"; Remove-Item $_.FullName -Force }

# Cloud-push via rclone (eenrichting; geen live twee-weg-sync zoals OneDrive)
if ($RcloneRemote) {
  Log "Upload naar $RcloneRemote"
  & rclone copy $zip $RcloneRemote --no-traverse 2>&1 | ForEach-Object { Log "rclone: $_" }
  if ($LASTEXITCODE -ne 0) { Log "WAARSCHUWING: rclone-exitcode $LASTEXITCODE (upload mogelijk mislukt)" }
  else { Log 'Upload OK' }
} else {
  Log 'Geen RcloneRemote ingesteld — alleen lokale backup.'
}

Log 'Klaar.'
