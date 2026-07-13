# obs-backup.ps1 — config-bundel-backup voor de streaming-pc → Azure Blob
# (zie docs/obs-backup-runbook.md)
#
# Zipt de kritieke OBS-/agent-config + sponsorafbeeldingen, roteert lokaal, en uploadt
# (eenrichting) naar een PRIVÉ Azure Blob-container. Bedoeld voor handmatig of via Task
# Scheduler (wekelijks is genoeg).
#
# LET OP: de zip bevat de OBS-profielen MÉT stream keys → alleen naar een PRIVÉ container,
# evt. extra versleutelen (7-Zip AES, zie runbook). Auth via env-var (niet in het script):
#   $env:AZURE_STORAGE_CONNECTION_STRING = "<connection string uit rg-mokum-streams storage>"

$ErrorActionPreference = 'Stop'

# ── Instellingen (pas aan naar jouw pc) ─────────────────────────────────────
$Bronnen = @(
  'C:\MokumOBS',                       # de 4 portable OBS-mappen (incl. profiel/stream keys)
  'C:\Mokum-Sponsors',                 # sponsorafbeeldingen + overlay-assets
  'C:\Mokum-Agent\agent-config.json'   # agent-config (secrets staan in env, niet hierin)
)
$LokaalDoel = 'D:\MokumBackup'         # externe schijf / tweede disk voor de lokale kopie
$Container  = 'obs-backup'             # privé Azure Blob-container
$Bewaar     = 8                        # aantal lokale zips bewaren (rotatie)
$LogPad     = Join-Path $LokaalDoel 'backup.log'

# ── Uitvoering ──────────────────────────────────────────────────────────────
function Log($m) { $t = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'; "$t $m" | Tee-Object -FilePath $LogPad -Append }

if (-not $env:AZURE_STORAGE_CONNECTION_STRING) {
  Log 'FOUT: AZURE_STORAGE_CONNECTION_STRING niet gezet (env). Gestopt.'; exit 1
}

New-Item -ItemType Directory -Force -Path $LokaalDoel | Out-Null
$stamp    = Get-Date -Format 'yyyyMMdd-HHmmss'
$zip      = Join-Path $LokaalDoel "mokum-obs-$stamp.zip"
$blobNaam = "mokum-obs-$stamp.zip"

$teZippen = $Bronnen | Where-Object { Test-Path $_ }
if (-not $teZippen) { Log 'GEEN bronnen gevonden — gestopt. Controleer de paden bovenaan.'; exit 1 }
foreach ($b in $Bronnen) { if ($b -notin $teZippen) { Log "WAARSCHUWING: bron ontbreekt: $b" } }

Log "Zip maken: $zip"
Compress-Archive -Path $teZippen -DestinationPath $zip -CompressionLevel Optimal -Force
Log ('Zip klaar: {0:N1} MB' -f ((Get-Item $zip).Length / 1MB))

# Container bestaat? (idempotent aanmaken als privé)
& az storage container create --name $Container --public-access off --only-show-errors | Out-Null

Log "Upload naar Azure Blob: $Container/$blobNaam"
& az storage blob upload --container-name $Container --file $zip --name $blobNaam --overwrite --only-show-errors 2>&1 |
  ForEach-Object { Log "az: $_" }
if ($LASTEXITCODE -ne 0) { Log "WAARSCHUWING: az-exitcode $LASTEXITCODE (upload mogelijk mislukt)" }
else { Log 'Upload OK' }

# Lokale rotatie: alleen de nieuwste $Bewaar zips behouden
Get-ChildItem $LokaalDoel -Filter 'mokum-obs-*.zip' | Sort-Object LastWriteTime -Descending |
  Select-Object -Skip $Bewaar | ForEach-Object { Log "Oud verwijderd: $($_.Name)"; Remove-Item $_.FullName -Force }

Log 'Klaar.'
