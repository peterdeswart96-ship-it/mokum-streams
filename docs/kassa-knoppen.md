# Knoppen op de kassa-pc (OBS-pc wekken)

Doel: de OBS-pc aan kunnen zetten vanaf de kassa-pc, ook via de Stream Deck, met een
bevestiging zodat een verkeerde klik niets doet. Zie #60 (Wake-on-LAN).

## Wat er is

| Script | Doet | Geheimen nodig? |
|---|---|---|
| `scripts/kassa/Wek-OBS-pc.ps1` | Controleert of de agent online is, vraagt om bevestiging, stuurt het wek-signaal en wacht tot de agent zich meldt | Nee (MAC-adres en `/api/live` zijn openbaar) |

Het wek-signaal (Wake-on-LAN) gaat alleen over het **zaalnetwerk**, dus de kassa-pc moet op
hetzelfde netwerk zitten als de OBS-pc. Het werkt bij een netjes afgesloten pc en bij een pc
die zonder stroom stond (BIOS: After Power Loss = Power On). Een **bevroren** pc (aan, maar
reageert niet) wek je hiermee niet: dan is een slimme stekker of iemand ter plekke nodig.

## Installeren op de kassa-pc

1. Maak een map `C:\Mokum\` en zet `Wek-OBS-pc.ps1` daarin. Ophalen kan in de browser:
   `github.com/peterdeswart96-ship-it/mokum-streams` > `scripts/kassa/Wek-OBS-pc.ps1` > Raw >
   opslaan als. (Bij het opslaan mag er geen `.txt` achter komen.)
2. Maak een snelkoppeling op het bureaublad, in PowerShell:
```powershell
$s = (New-Object -ComObject WScript.Shell).CreateShortcut("$env:USERPROFILE\Desktop\OBS-pc wekken.lnk")
$s.TargetPath = 'powershell.exe'
$s.Arguments  = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\Mokum\Wek-OBS-pc.ps1"'
$s.IconLocation = 'shell32.dll,27'   # alleen het plaatje
$s.Save()
```
3. Dubbelklik om te testen. Staat de OBS-pc aan, dan meldt het: "staat al aan, wekken is niet nodig".

## Stream Deck

1. Sleep een actie **Systeem > Openen** op een toets.
2. Kies bij "App / Bestand" de snelkoppeling `OBS-pc wekken.lnk` van het bureaublad.
3. Geef de toets de titel "OBS-pc wekken".

Bij een druk op de toets verschijnt het bevestigingsvenster op het scherm van de kassa-pc, met
**Nee** als standaardknop. Er gebeurt niets voordat je op **Ja** klikt.

## Testen zonder iets te versturen

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\Mokum\Wek-OBS-pc.ps1 -Proef
```
Toont alleen de tekst die je zou zien en verstuurt niets.

---

# OBS-pc herstarten

`scripts/kassa/Herstart-OBS-pc.ps1` herstart de OBS-pc vanaf de kassa-pc, voor personeel bij grote
problemen. Het vraagt om bevestiging (standaard **Nee**); zendt er een stream live, dan volgt een
tweede waarschuwing met de tafels die worden afgebroken. Daarna wacht het tot de agent terug is en
meldt dat je weer een stream kunt starten.

**Waarom rechtstreeks via Windows en niet via de agent:** zit OBS of de agent zelf vast, dan doet een
commando via de agent niets. Windows leeft dan meestal nog wel. Een echt bevroren pc (Windows
reageert niet meer) herstart dit **niet**; dan is de stekker of iemand ter plekke nodig.

**Beveiliging:** er staat geen wachtwoord in het script of de repo. De inloggegevens van het
beheerdersaccount van de OBS-pc staan in het Windows-referentiebeheer van de kassa-pc. Wie op de
kassa-pc met dat Windows-account is ingelogd, kan dus de OBS-pc herstarten. Op de OBS-pc staat geen
belangrijke data, dus dat is een bewuste afweging (besluit Peter, 24-09).

## Eenmalig instellen

**A. Op de OBS-pc** (PowerShell als beheerder). Nodig zodat een lokaal beheerdersaccount van afstand
mag herstarten en de firewall dat toestaat, alleen vanaf het eigen netwerk:
```powershell
# 1. Sta beheer op afstand toe voor lokale beheerdersaccounts
Set-ItemProperty -Path HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System `
  -Name LocalAccountTokenFilterPolicy -Value 1 -Type DWord

# 2. Zoek de firewallgroepen (de namen verschillen per Windows-taal)
Get-NetFirewallRule | Where-Object { $_.DisplayGroup -match 'WMI|beheerinstrumentatie|File and Printer|Bestands' } |
  Select-Object -ExpandProperty DisplayGroup -Unique
```
Zet daarna van **de twee groepen die je ziet** (Windows Management Instrumentation en File and
Printer Sharing) de regels aan, en beperk ze tot het eigen netwerk. Vervang de namen door precies
wat de vorige opdracht toonde:
```powershell
$groepen = 'NAAM-VAN-DE-WMI-GROEP', 'NAAM-VAN-DE-BESTANDS-EN-PRINTERDELING-GROEP'
foreach ($g in $groepen) {
  Enable-NetFirewallRule -DisplayGroup $g
  Get-NetFirewallRule -DisplayGroup $g | Set-NetFirewallRule -RemoteAddress LocalSubnet
}
```
Noteer ook de **naam** van de OBS-pc (`hostname`). Een vast IP-adres (reservering in de router) is
betrouwbaarder dan een naam.

**B. Op de kassa-pc** (PowerShell): sla de inloggegevens van het beheerdersaccount van de OBS-pc
eenmalig op. Je krijgt zelf een wachtwoordvraag; typ het wachtwoord daar, nooit in een chat of bestand.
```powershell
cmdkey /add:OBS-PC-NAAM /user:OBS-PC-NAAM\BEHEERDERSACCOUNT /pass
```

**C. Test de rechten, zonder te herstarten:**
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\Mokum\Herstart-OBS-pc.ps1 -Pc OBS-PC-NAAM -TestVerbinding
```
Dit plant een herstart over 10 minuten en breekt die direct af. Je moet **GELUKT** zien. Zie je een
foutmelding, plak die dan (zonder wachtwoord) bij Claude; zo stellen we de firewall bij.

**D. Snelkoppeling en Stream Deck**, net als bij het wekken, maar met de naam erbij:
```powershell
$s = (New-Object -ComObject WScript.Shell).CreateShortcut("$env:USERPROFILE\Desktop\OBS-pc herstarten.lnk")
$s.TargetPath = 'powershell.exe'
$s.Arguments  = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\Mokum\Herstart-OBS-pc.ps1" -Pc OBS-PC-NAAM'
$s.IconLocation = 'shell32.dll,238'   # alleen het plaatje
$s.Save()
```
Op de Stream Deck: **Systeem > Openen** met deze snelkoppeling.

## Testen zonder iets te herstarten

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\Mokum\Herstart-OBS-pc.ps1 -Pc OBS-PC-NAAM -Proef
```
Toont alleen de tekst en verstuurt niets.
