# Herstart-OBS-pc.ps1 - herstart de OBS-pc vanaf de kassa-pc, met een bevestiging (#60).
#
# Bedoeld voor personeel als er grote problemen zijn met de OBS-pc: een knop (Stream Deck of
# snelkoppeling), een bevestiging, en de pc herstart. OBS en de agent starten daarna vanzelf
# weer op; daarna kan er weer een stream worden gestart.
#
# Waarom rechtstreeks via Windows en niet via de agent: als OBS of de agent zelf vastzit, doet
# een commando via de agent niets. Windows zelf leeft dan meestal nog wel, en kan van
# afstand worden herstart (shutdown /r /f /m). Een echt BEVROREN pc (Windows reageert niet
# meer) herstart je hiermee niet; dan blijft alleen de stekker of iemand ter plekke over.
#
# Wat het doet:
#   1. Controleert of de OBS-pc bereikbaar is op het netwerk (anders heeft herstarten geen zin).
#   2. Vraagt om BEVESTIGING (standaard Nee). Zendt er een stream live, dan volgt een extra,
#      duidelijke waarschuwing met de tafels die worden afgebroken.
#   3. Stuurt de herstartopdracht (met /f: programma's die hangen worden geforceerd afgesloten).
#   4. Wacht tot de agent weer online is en meldt dan dat je een stream kunt starten.
#
# GEEN wachtwoorden in dit bestand of in de repo. De inloggegevens van het beheerdersaccount van
# de OBS-pc staan in de Windows-referentiebeheer van DEZE pc (eenmalig instellen, zie
# docs/kassa-knoppen.md).
#
# Gebruik:
#   ... -File Herstart-OBS-pc.ps1 -Pc <naam of IP van de OBS-pc>
#   ... -Pc <naam of IP> -TestVerbinding   # controleert rechten; herstart NIET
#   ... -Pc <naam of IP> -Proef            # toont alleen de tekst; verstuurt niets
#
# NB: alleen ASCII-tekens in dit bestand (Windows PowerShell 5.1 leest een bestand zonder BOM
# als ANSI).

param(
    [Parameter(Mandatory = $true)][string]$Pc,
    [string]$ApiBasis = 'https://mokum-streams-func.azurewebsites.net',
    [int]$WachtMinuten = 10,
    [switch]$TestVerbinding,
    [switch]$Proef
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms

function Get-Live {
    try { return Invoke-RestMethod -Uri "$ApiBasis/api/live" -TimeoutSec 10 } catch { return $null }
}

function Toon([string]$tekst, $knoppen, $icoon, $standaard) {
    $eigenaar = New-Object Windows.Forms.Form
    $eigenaar.TopMost = $true
    $eigenaar.ShowInTaskbar = $false
    $eigenaar.Opacity = 0
    $eigenaar.Show()
    try {
        return [Windows.Forms.MessageBox]::Show($eigenaar, $tekst, 'OBS-pc herstarten', $knoppen, $icoon, $standaard)
    } finally {
        $eigenaar.Close()
    }
}

# Is de OBS-pc bereikbaar? Poort 135 (RPC) is wat shutdown /m nodig heeft; een ping is onbetrouwbaar
# omdat Windows die standaard blokkeert.
function Test-Bereikbaar([string]$naam, [int]$poort = 135, [int]$timeoutMs = 3000) {
    $tcp = New-Object Net.Sockets.TcpClient
    try {
        $taak = $tcp.ConnectAsync($naam, $poort)
        return ($taak.Wait($timeoutMs) -and $tcp.Connected)
    } catch {
        return $false
    } finally {
        $tcp.Close()
    }
}

# Draait een opdracht en geeft { Code, Tekst } terug. Gebruikt .NET Process i.p.v. de operator &
# zodat de foutmelding van shutdown.exe (die naar stderr gaat) altijd netjes wordt opgevangen.
function Invoke-Opdracht([string]$exe, [string]$argumenten) {
    $psi = New-Object Diagnostics.ProcessStartInfo
    $psi.FileName = $exe
    $psi.Arguments = $argumenten
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true
    $p = [Diagnostics.Process]::Start($psi)
    $tekst = ($p.StandardOutput.ReadToEnd() + $p.StandardError.ReadToEnd()).Trim()
    $p.WaitForExit()
    return [pscustomobject]@{ Code = $p.ExitCode; Tekst = $tekst }
}

# Legt een verbinding met de OBS-pc aan met de opgeslagen inloggegevens. Zonder deze stap
# probeert shutdown het met het account van de kassa-pc, en dat heeft geen rechten op de OBS-pc.
function Connect-ObsPc([string]$naam) {
    return Invoke-Opdracht 'net.exe' "use \\$naam\IPC$"
}

function Format-Geleden($seconden) {
    if ($null -eq $seconden) { return 'nog nooit' }
    if ($seconden -lt 120) { return "$seconden seconden geleden" }
    return "$([math]::Round($seconden / 60)) minuten geleden"
}

# --- Testmodus: controleert de rechten zonder te herstarten ---------------------------------
# Plant een herstart over 10 minuten en breekt die meteen af. Lukt dat, dan werkt de echte
# herstart ook. Bedoeld om de instelling te controleren, niet voor personeel.
if ($TestVerbinding) {
    Write-Host "Bereikbaar op poort 135? $(Test-Bereikbaar $Pc)"
    $c = Connect-ObsPc $Pc
    Write-Host "Verbinding maken: code $($c.Code) $($c.Tekst)"
    $plan = Invoke-Opdracht 'shutdown.exe' "/r /t 600 /m \\$Pc /c `"Test vanaf de kassa-pc (wordt meteen afgebroken)`""
    Write-Host "Herstart plannen: code $($plan.Code) $($plan.Tekst)"
    if ($plan.Code -eq 0) {
        $af = Invoke-Opdracht 'shutdown.exe' "/a /m \\$Pc"
        Write-Host "Herstart afbreken: code $($af.Code) $($af.Tekst)"
        if ($af.Code -eq 0) { Write-Host 'GELUKT: de kassa-pc mag de OBS-pc herstarten. Er is niets herstart.' }
        else { Write-Host 'LET OP: plannen lukte maar afbreken niet. Controleer op de OBS-pc: shutdown /a' }
    } else {
        Write-Host 'MISLUKT: zie de melding hierboven.'
    }
    exit $plan.Code
}

# --- 1. Bereikbaar? -------------------------------------------------------------------------
$live = Get-Live
$liveTafels = @()
if ($live -and $live.tables) {
    $liveTafels = @($live.tables | Where-Object { $_.status -eq 'live' } | ForEach-Object { $_.tableNumber })
}

if (-not $Proef -and -not (Test-Bereikbaar $Pc)) {
    [void](Toon ("De OBS-pc ('$Pc') reageert niet op het netwerk.`n`n" +
                 "Hij staat uit, of hij is bevroren. Staat hij uit, gebruik dan 'OBS-pc wekken'. " +
                 "Is hij bevroren, dan is iemand ter plekke nodig (aan/uit-knop of stekker).") 'OK' 'Warning' 'Button1')
    exit 1
}

# --- 2. Bevestiging -------------------------------------------------------------------------
$tekst = "De OBS-pc herstarten?`n`n" +
         "OBS en de agent starten daarna vanzelf weer op (ongeveer 3 minuten). Daarna kun je weer een stream starten."
if ($live -and $live.agent) {
    $tekst += "`n`n(De agent meldde zich $(Format-Geleden $live.agent.secondsAgo).)"
}

if ($Proef) {
    Write-Host "[PROEF] $tekst"
    if ($liveTafels.Count -gt 0) { Write-Host "[PROEF] EXTRA WAARSCHUWING: live op tafel $($liveTafels -join ', ')" }
    Write-Host "[PROEF] doel: $Pc; er wordt NIETS verstuurd."
    exit 0
}

if ((Toon $tekst 'YesNo' 'Question' 'Button2') -ne 'Yes') { exit 0 }

# Zendt er iets live, dan een tweede, duidelijk bevestigingsmoment: dit kapt de uitzending af.
if ($liveTafels.Count -gt 0) {
    $waarschuwing = "LET OP: er zendt nu een uitzending op tafel $($liveTafels -join ' en ').`n`n" +
                    "Herstarten breekt die uitzending af. Na de herstart moet je de stream opnieuw starten.`n`n" +
                    "Weet je het zeker?"
    if ((Toon $waarschuwing 'YesNo' 'Warning' 'Button2') -ne 'Yes') { exit 0 }
}

# --- 3. Herstartopdracht --------------------------------------------------------------------
[void](Connect-ObsPc $Pc)
# /f = geforceerd (hangende programma's worden afgesloten), /t 5 = 5 seconden uitstel.
$r = Invoke-Opdracht 'shutdown.exe' "/r /f /t 5 /m \\$Pc /c `"Herstart via de kassa-pc (Mokum Streams)`""
[void](Invoke-Opdracht 'net.exe' "use \\$Pc\IPC$ /delete")

if ($r.Code -ne 0) {
    [void](Toon ("De herstart is NIET gelukt.`n`n$($r.Tekst)`n`n" +
                 "Neem contact op met Peter of Nick. (Foutcode $($r.Code))") 'OK' 'Error' 'Button1')
    exit $r.Code
}

# --- 4. Wachten tot de agent terug is -------------------------------------------------------
$venster = New-Object Windows.Forms.Form
$venster.Text = 'OBS-pc herstarten'
$venster.TopMost = $true
$venster.StartPosition = 'CenterScreen'
$venster.Size = New-Object Drawing.Size(440, 130)
$venster.FormBorderStyle = 'FixedDialog'
$venster.ControlBox = $false
$label = New-Object Windows.Forms.Label
$label.Dock = 'Fill'
$label.TextAlign = 'MiddleCenter'
$venster.Controls.Add($label)
$venster.Show()

$eind = (Get-Date).AddMinutes($WachtMinuten)
$offlineGezien = $false
$terug = $false
while ((Get-Date) -lt $eind) {
    $rest = [int]($eind - (Get-Date)).TotalSeconds
    $label.Text = if ($offlineGezien) { "De OBS-pc is uit en start weer op...`nWachten tot de agent zich meldt (nog max. $rest s)" }
                  else { "Herstartopdracht verstuurd.`nWachten tot de OBS-pc uitgaat (nog max. $rest s)" }
    [Windows.Forms.Application]::DoEvents()
    $l = Get-Live
    $online = [bool]($l -and $l.agent -and $l.agent.online)
    if (-not $online) { $offlineGezien = $true }
    elseif ($offlineGezien) { $terug = $true; break }
    for ($i = 0; $i -lt 5; $i++) { Start-Sleep -Seconds 1; [Windows.Forms.Application]::DoEvents() }
}
$venster.Close()

if ($terug) {
    [void](Toon ("De OBS-pc is opnieuw opgestart en de agent meldt zich.`n`n" +
                 "Wacht nog een halve minuut tot de camera's in OBS beeld hebben. Daarna kun je weer een stream starten.") 'OK' 'Information' 'Button1')
    exit 0
}
if (-not $offlineGezien) {
    [void](Toon ("De agent bleef online: de OBS-pc lijkt niet te zijn herstart.`n`n" +
                 "Probeer het opnieuw, of neem contact op met Peter of Nick.") 'OK' 'Warning' 'Button1')
    exit 2
}
[void](Toon ("De OBS-pc is na $WachtMinuten minuten nog niet terug.`n`n" +
             "Kijk of hij aan het opstarten is. Blijft hij uit, neem dan contact op met Peter of Nick.") 'OK' 'Warning' 'Button1')
exit 3
