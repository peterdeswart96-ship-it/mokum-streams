<#
.SYNOPSIS
  Zet één stream-avond op een rij: wat ging live, wat schakelde er, waarom stopte het,
  en ging de afronding goed.

.DESCRIPTION
  Leest de logregels van de Function App uit de Log Analytics-werkruimte. Het venster
  loopt van 12:00 tot 08:00 de volgende ochtend, zodat een avond die na middernacht
  doorloopt in één overzicht blijft — dezelfde zaal-dag-gedachte als in de backend (#77).

  De ruis (elke minuut "bijgewerkt", elke 30 seconden "niets te doen") wordt eruit
  gefilterd; van liveMatches houden we alleen de momenten over waarop het aantal live
  tafels VERANDERT. Wat overblijft is de gebeurtenissenlijn van de avond.

  LET OP: gebruik hiervoor niet `az monitor app-insights query`. Die past stilzwijgend
  een venster van één uur toe als je geen tijdvak meegeeft, en dan lijkt het alsof er
  geen logs zijn.

.PARAMETER Datum
  De avond in de vorm jjjj-MM-dd. Standaard: gisteren.

.EXAMPLE
  .\scripts\avond-rapport.ps1
  .\scripts\avond-rapport.ps1 -Datum 2026-07-29
#>
param(
  [string]$Datum = (Get-Date).AddDays(-1).ToString('yyyy-MM-dd'),
  [string]$ResourceGroup = 'rg-mokum-streams',
  [string]$AppInsights = 'mokum-streams-func'
)

$ErrorActionPreference = 'Stop'

# We praten rechtstreeks met de ARM- en Log Analytics-API's, en gebruiken van de Azure CLI
# alleen `az rest` en `az account get-access-token` — beide kernopdrachten.
#
# Waarom: dit script hing eerst aan de extensies `application-insights` en `log-analytics`.
# Op 01-08 raakte die laatste beschadigd (onleesbare bestanden in .azure\cliextensions), en
# omdat de CLI bij élke opdracht alle extensies inleest, werkte daarna geen enkele
# az-opdracht meer — precies op de ochtend dat het rapport nodig was. Zonder extensies kan
# dat niet gebeuren.

$abonnement = (az account show --query id -o tsv --only-show-errors)
if (-not $abonnement) { throw "Niet ingelogd bij Azure. Draai eerst: az login" }

# App Insights -> gekoppelde werkruimte -> de id waarmee je de werkruimte bevraagt.
$ai = az rest --method get --url "https://management.azure.com/subscriptions/$abonnement/resourceGroups/$ResourceGroup/providers/microsoft.insights/components/$AppInsights`?api-version=2020-02-02" --only-show-errors | ConvertFrom-Json
$wsId = $ai.properties.WorkspaceResourceId
if (-not $wsId) { throw "Geen werkruimte gekoppeld aan $AppInsights in $ResourceGroup." }
$ws = az rest --method get --url "https://management.azure.com$wsId`?api-version=2022-10-01" --only-show-errors | ConvertFrom-Json
$cid = $ws.properties.customerId

# Amsterdamse avond -> UTC. De zaal draait op +02:00 in de zomer; ConvertTimeToUtc
# regelt de winter- en zomertijd zelf.
$tz = [TimeZoneInfo]::FindSystemTimeZoneById('W. Europe Standard Time')
$van = [TimeZoneInfo]::ConvertTimeToUtc([datetime]::ParseExact("$Datum 12:00", 'yyyy-MM-dd HH:mm', $null), $tz)
$tot = [TimeZoneInfo]::ConvertTimeToUtc([datetime]::ParseExact("$Datum 12:00", 'yyyy-MM-dd HH:mm', $null).AddHours(20), $tz)

$q = "AppTraces | where TimeGenerated between (datetime($($van.ToString('o'))) .. datetime($($tot.ToString('o')))) | where Message startswith '[' | where Message !contains 'niets te doen' | project TimeGenerated, Message | order by TimeGenerated asc"

$token = az account get-access-token --resource "https://api.loganalytics.io" --query accessToken -o tsv --only-show-errors
$antwoord = Invoke-RestMethod -Method Post -Uri "https://api.loganalytics.io/v1/workspaces/$cid/query" `
  -Headers @{ Authorization = "Bearer $token" } -ContentType 'application/json' `
  -Body (@{ query = $q } | ConvertTo-Json) -TimeoutSec 120

# De API geeft kolommen en rijen apart terug; hier weer aan elkaar knopen tot objecten.
$tabel = $antwoord.tables[0]
$kolom = @{}
for ($i = 0; $i -lt $tabel.columns.Count; $i++) { $kolom[$tabel.columns[$i].name] = $i }
$rijen = foreach ($r in $tabel.rows) {
  [pscustomobject]@{ TimeGenerated = $r[$kolom['TimeGenerated']]; Message = $r[$kolom['Message']] }
}

Write-Host ""
Write-Host "AVOND $Datum — $($rijen.Count) logregels" -ForegroundColor Cyan
Write-Host ("-" * 72)

$vorigeLive = $null; $vorigeYt = $null
$stops = @(); $finalized = @()
$laatsteM = $null; $herhaald = 0; $laatsteTijd = $null

# Problemen tellen we per unieke melding. Een fout die zich 300 keer herhaalt is één
# probleem, maar mag nooit wegvallen in de samenvatting — dan lijkt de avond goed
# gegaan terwijl er iets vastliep.
$problemen = @{}
$PROBLEEM_RE = 'WAARSCHUWING|Exception|niet bereikbaar|FOUT|mislukt|nog niet gelukt|niet gevonden|Unhealthy'

# Een regel die zich blijft herhalen (bijv. finalizeVideos dat elke minuut opnieuw
# probeert) tonen we één keer, met het aantal en het laatste tijdstip erachter.
function ToonHerhaling {
  if ($script:herhaald -gt 0) {
    Write-Host ("           ... $($script:herhaald)x herhaald, laatste om $($script:laatsteTijd)") -ForegroundColor DarkGray
    $script:herhaald = 0
  }
}

foreach ($r in $rijen) {
  $tijd = ([datetime]$r.TimeGenerated).ToUniversalTime()
  $lokaal = [TimeZoneInfo]::ConvertTimeFromUtc($tijd, $tz).ToString('HH:mm:ss')
  $m = ($r.Message -replace "`r?`n", ' ').Trim()

  # Eerst tellen, dan pas beslissen of we 'm tonen — anders verdwijnt een herhaalde
  # fout in de samenvouwing en meldt het rapport ten onrechte "geen problemen".
  if ($m -match $PROBLEEM_RE) { $problemen[$m] = 1 + ($(if ($problemen.ContainsKey($m)) { $problemen[$m] } else { 0 })) }

  # liveMatches / liveVideos: alleen tonen als het aantal live tafels verandert.
  if ($m -match '^\[liveMatches\].*?(\d+)/(\d+) tafels live') {
    if ($Matches[1] -eq $vorigeLive) { continue }
    $vorigeLive = $Matches[1]
    ToonHerhaling
    Write-Host "$lokaal  $m" -ForegroundColor DarkGray
    continue
  }
  if ($m -match '^\[liveVideos\] (\d+)/') {
    if ($Matches[1] -eq $vorigeYt) { continue }
    $vorigeYt = $Matches[1]
    ToonHerhaling
    Write-Host "$lokaal  $m" -ForegroundColor DarkGray
    continue
  }

  # Exact dezelfde regel als hiervoor? Optellen in plaats van herhalen.
  if ($m -eq $laatsteM) { $herhaald++; $laatsteTijd = $lokaal; continue }
  ToonHerhaling
  $laatsteM = $m

  if ($m -match $PROBLEEM_RE) {
    Write-Host "$lokaal  $m" -ForegroundColor Red
    continue
  }
  if ($m -match '^\[checkStops\].*stoppen') { $stops += "$lokaal  $m" }
  if ($m -match 'gefinaliseerd') { $finalized += "$lokaal  $m" }

  $kleur = if ($m -match '^\[pauzeScherm\]') { 'Yellow' } elseif ($m -match '^\[OK\]|^\[checkStops\]|^\[finalizeVideos\]') { 'Green' } else { 'Gray' }
  Write-Host "$lokaal  $m" -ForegroundColor $kleur
}

ToonHerhaling
Write-Host ("-" * 72)
Write-Host "SAMENVATTING" -ForegroundColor Cyan
Write-Host "  automatische stops : $($stops.Count)"
$stops | ForEach-Object { Write-Host "      $_" }
Write-Host "  afgeronde video's  : $($finalized.Count)"
$finalized | ForEach-Object { Write-Host "      $_" }
Write-Host "  problemen          : $($problemen.Count) soort(en)" -ForegroundColor $(if ($problemen.Count) { 'Red' } else { 'Green' })
$problemen.GetEnumerator() | Sort-Object Value -Descending | ForEach-Object {
  Write-Host ("      {0,4}x  {1}" -f $_.Value, $_.Key) -ForegroundColor Red
}
Write-Host ""
