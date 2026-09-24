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
