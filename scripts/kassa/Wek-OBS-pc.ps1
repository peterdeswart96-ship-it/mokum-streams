# Wek-OBS-pc.ps1 - zet de OBS-pc aan vanaf de kassa-pc (Wake-on-LAN), met een bevestiging (#60).
#
# Wat het doet, stap voor stap:
#   1. Vraagt bij de backend (/api/live, openbaar) of de agent op de OBS-pc online is.
#      Staat hij al aan, dan meldt het dat en stopt het - er valt niets te wekken.
#   2. Vraagt om BEVESTIGING (standaardknop is Nee, zodat een per ongeluk aangeklikte knop of
#      Stream Deck-toets niets doet).
#   3. Bij Ja: stuurt een "magic packet" (het wek-signaal) naar het MAC-adres van de OBS-pc,
#      via elke actieve netwerkkaart van deze pc (dus ook als er meerdere zijn).
#   4. Wacht tot de agent zich weer meldt (standaard max. 5 minuten) en zegt dan of het gelukt is.
#
# Werkt alleen als deze pc op HETZELFDE netwerk zit als de OBS-pc (Wake-on-LAN gaat niet over
# internet), en alleen bij een netjes afgesloten pc of een pc die zonder stroom stond.
# Een pc die BEVROREN is (aan maar niet reagerend) wek je hiermee niet.
#
# Geen geheimen: het MAC-adres is geen wachtwoord en /api/live is openbaar.
#
# Gebruik:  powershell -NoProfile -ExecutionPolicy Bypass -File Wek-OBS-pc.ps1
# Proefrun (verstuurt NIETS en toont alleen de tekst): ... -Proef
#
# NB: dit bestand bevat bewust alleen ASCII-tekens. Windows PowerShell 5.1 leest een bestand
# zonder BOM als ANSI, en dan gaan tekens als e-trema en accenten fout.

param(
    [string]$Mac = 'C8:53:09:C5:60:1E',                        # bekabelde netwerkkaart van de OBS-pc
    [string]$ApiBasis = 'https://mokum-streams-func.azurewebsites.net',
    [int]$WachtMinuten = 5,
    [switch]$Proef
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms

# Het wek-signaal: 6x FF, daarna 16x het MAC-adres.
function Get-MagicPacket([string]$adres) {
    $bytes = [byte[]]($adres -split '[:-]' | ForEach-Object { [Convert]::ToByte($_, 16) })
    if ($bytes.Length -ne 6) { throw "Ongeldig MAC-adres: $adres" }
    return [byte[]]((,[byte]0xFF * 6) + ($bytes * 16))
}

# Status van de agent volgens de backend, of $null als de backend niet te bereiken is.
function Get-AgentStatus {
    try {
        return (Invoke-RestMethod -Uri "$ApiBasis/api/live" -TimeoutSec 10).agent
    } catch {
        return $null
    }
}

# Stuurt het signaal via ELKE actieve netwerkkaart. Alleen naar 255.255.255.255 sturen kan op
# de verkeerde kaart uitkomen (bijv. wifi of een VPN) en dan komt het nooit bij de OBS-pc aan.
# Geeft terug via hoeveel kaarten het is verstuurd.
function Send-MagicPacket([byte[]]$pakket) {
    $aantal = 0
    foreach ($nic in [Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()) {
        if ($nic.OperationalStatus -ne 'Up' -or $nic.NetworkInterfaceType -eq 'Loopback') { continue }
        foreach ($ua in $nic.GetIPProperties().UnicastAddresses) {
            if ($ua.Address.AddressFamily -ne 'InterNetwork') { continue }
            if ($ua.Address.ToString().StartsWith('169.254.')) { continue }  # geen echt adres
            $udp = New-Object Net.Sockets.UdpClient -ArgumentList (New-Object Net.IPEndPoint($ua.Address, 0))
            try {
                $udp.EnableBroadcast = $true
                foreach ($poort in 7, 9) {
                    [void]$udp.Send($pakket, $pakket.Length, (New-Object Net.IPEndPoint([Net.IPAddress]::Broadcast, $poort)))
                }
                $aantal++
            } finally {
                $udp.Close()
            }
        }
    }
    return $aantal
}

# Een venster dat altijd bovenop komt (belangrijk als dit vanaf een Stream Deck start).
function Toon([string]$tekst, $knoppen, $icoon, $standaard) {
    $eigenaar = New-Object Windows.Forms.Form
    $eigenaar.TopMost = $true
    $eigenaar.ShowInTaskbar = $false
    $eigenaar.Opacity = 0
    $eigenaar.Show()
    try {
        return [Windows.Forms.MessageBox]::Show($eigenaar, $tekst, 'OBS-pc wekken', $knoppen, $icoon, $standaard)
    } finally {
        $eigenaar.Close()
    }
}

function Format-Geleden($seconden) {
    if ($null -eq $seconden) { return 'nog nooit' }
    if ($seconden -lt 120) { return "$seconden seconden geleden" }
    if ($seconden -lt 7200) { return "$([math]::Round($seconden / 60)) minuten geleden" }
    return "$([math]::Round($seconden / 3600, 1)) uur geleden"
}

# --- 1. Staat hij al aan? ---------------------------------------------------------------
$status = Get-AgentStatus

if ($status -and $status.online) {
    $tekst = "De OBS-pc staat al aan (de agent meldde zich $(Format-Geleden $status.secondsAgo)).`n`nWekken is niet nodig."
    if ($Proef) { Write-Host "[PROEF] $tekst"; exit 0 }
    [void](Toon $tekst 'OK' 'Information' 'Button1')
    exit 0
}

# --- 2. Bevestiging ---------------------------------------------------------------------
if ($status) {
    $vraag = "De OBS-pc lijkt UIT te staan (de agent meldde zich voor het laatst $(Format-Geleden $status.secondsAgo)).`n`n" +
             "Wek-signaal sturen? De pc start dan op; OBS en de agent starten daarna vanzelf (ongeveer 2 tot 3 minuten)."
} else {
    $vraag = "Ik kon de status niet ophalen (geen internet, of de server reageert niet).`n`n" +
             "Toch het wek-signaal naar de OBS-pc sturen? Staat hij al aan, dan gebeurt er niets."
}

if ($Proef) {
    $pakket = Get-MagicPacket $Mac
    Write-Host "[PROEF] $vraag"
    Write-Host "[PROEF] wek-signaal is $($pakket.Length) bytes voor $Mac; er wordt NIETS verstuurd."
    exit 0
}

# Standaardknop = Nee: een Enter of dubbelklik per ongeluk doet dus niets.
$antwoord = Toon $vraag 'YesNo' 'Question' 'Button2'
if ($antwoord -ne 'Yes') { exit 0 }

# --- 3. Wek-signaal sturen --------------------------------------------------------------
$kaarten = Send-MagicPacket (Get-MagicPacket $Mac)
if ($kaarten -eq 0) {
    [void](Toon "Er is geen actieve netwerkverbinding op deze pc gevonden, dus er is niets verstuurd." 'OK' 'Error' 'Button1')
    exit 1
}

# --- 4. Wachten tot de agent terug is ---------------------------------------------------
$venster = New-Object Windows.Forms.Form
$venster.Text = 'OBS-pc wekken'
$venster.TopMost = $true
$venster.StartPosition = 'CenterScreen'
$venster.Size = New-Object Drawing.Size(420, 130)
$venster.FormBorderStyle = 'FixedDialog'
$venster.ControlBox = $false
$label = New-Object Windows.Forms.Label
$label.Dock = 'Fill'
$label.TextAlign = 'MiddleCenter'
$venster.Controls.Add($label)
$venster.Show()

$eind = (Get-Date).AddMinutes($WachtMinuten)
$online = $false
while ((Get-Date) -lt $eind) {
    $rest = [int]($eind - (Get-Date)).TotalSeconds
    $label.Text = "Wek-signaal verstuurd.`nWachten tot de OBS-pc zich meldt... (nog max. $rest s)"
    [Windows.Forms.Application]::DoEvents()
    $s = Get-AgentStatus
    if ($s -and $s.online) { $online = $true; break }
    for ($i = 0; $i -lt 5; $i++) { Start-Sleep -Seconds 1; [Windows.Forms.Application]::DoEvents() }
}
$venster.Close()

if ($online) {
    [void](Toon "De OBS-pc is aan en de agent meldt zich. Klaar." 'OK' 'Information' 'Button1')
    exit 0
}
[void](Toon ("De OBS-pc heeft zich na $WachtMinuten minuten nog niet gemeld.`n`n" +
             "Kijk in het dashboard of hij alsnog komt. Blijft hij uit, dan is hij misschien bevroren of zonder stroom: " +
             "dan is iemand ter plekke nodig.") 'OK' 'Warning' 'Button1')
exit 2
