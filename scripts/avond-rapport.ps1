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

# Werkruimte opzoeken via de App Insights-resource, zodat een verhuizing niets breekt.
$wsId = az monitor app-insights component show -g $ResourceGroup -a $AppInsights --query workspaceResourceId -o tsv --only-show-errors
if (-not $wsId) { throw "Geen werkruimte gevonden voor $AppInsights in $ResourceGroup." }
$cid = az monitor log-analytics workspace show --ids $wsId --query customerId -o tsv --only-show-errors

# Amsterdamse avond -> UTC. De zaal draait op +02:00 in de zomer; ConvertTimeToUtc
# regelt de winter- en zomertijd zelf.
$tz = [TimeZoneInfo]::FindSystemTimeZoneById('W. Europe Standard Time')
$van = [TimeZoneInfo]::ConvertTimeToUtc([datetime]::ParseExact("$Datum 12:00", 'yyyy-MM-dd HH:mm', $null), $tz)
$tot = [TimeZoneInfo]::ConvertTimeToUtc([datetime]::ParseExact("$Datum 12:00", 'yyyy-MM-dd HH:mm', $null).AddHours(20), $tz)

# De query MOET op één regel: een KQL-string met regeleindes komt via de Azure CLI
# verminkt aan, waarna het filter stilzwijgend wegvalt en je de volledige hostruis krijgt.
$q = "AppTraces | where TimeGenerated between (datetime($($van.ToString('o'))) .. datetime($($tot.ToString('o')))) | where Message startswith '[' | where Message !contains 'niets te doen' | project TimeGenerated, Message | order by TimeGenerated asc"

$rijen = (az monitor log-analytics query -w $cid --analytics-query $q -o json --only-show-errors) | ConvertFrom-Json

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
