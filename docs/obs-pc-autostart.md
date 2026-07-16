# Streaming-pc: zelfstandig opstarten (account, auto-login, OBS-autostart)

> **Status: ingericht en getest op 2026-07-16.** ✅ Koude herstart → bureaublad →
> 4 OBS-instanties → agent verbonden, zonder dat er iemand aan de pc zit.

## Waarom dit bestaat
Op **14-07** liep dit mis: de pc vergrendelde zichzelf en vroeg om **Nick's PIN**.
Niemand anders had die. Gevolg: niet op afstand herstartbaar, streams bleven met
bevroren beeld doorlopen en er was geen weg terug tot Nick fysiek in de zaal stond.

De kern van het probleem was niet de lock, maar de **afhankelijkheid van één persoon**.
Daarom draait de pc nu op een eigen streaming-account dat Peter beheert.

## Het account
| | |
|---|---|
| Naam | `MokumStream` (lokaal, machine `MOKUMPOOLENDART`) |
| Groep | **Administrators** |
| Wachtwoord | Bij Peter in de wachtwoordmanager. **Nooit in de repo/chat.** |
| Verloopt | Nooit (`-PasswordNeverExpires`) |
| PIN / Windows Hello | **Niet ingesteld** — dat zou auto-login in de weg zitten |

Waarom admin: zonder eigen beheerdersaccount is `poole` (Nick) de enige admin op de
pc. Elke UAC-prompt zou dan weer om Nick's wachtwoord vragen. Nu is die
afhankelijkheid weg.

```powershell
$pw = Read-Host "Wachtwoord" -AsSecureString   # nooit op de commandoregel meegeven
New-LocalUser -Name 'MokumStream' -Password $pw -FullName 'Mokum Streaming' `
  -PasswordNeverExpires -AccountNeverExpires
Add-LocalGroupMember -Group 'Administrators' -Member 'MokumStream'
```

Controle dat het wachtwoord echt nooit verloopt (leeg = nooit — anders breekt de
auto-login na 42 dagen, precies wanneer er niemand is):
```powershell
Get-LocalUser MokumStream | Select Name,Enabled,PasswordExpires
```

## Auto-login
Via **Sysinternals Autologon** (`C:\MokumOBS\tools\Autologon64.exe`), GUI:
`MokumStream` / `MOKUMPOOLENDART` / wachtwoord → **Enable**.

Niet via de registersleutel `DefaultPassword`: die zet het wachtwoord **leesbaar**
in het register. Autologon bewaart het versleuteld als LSA-secret.

Controle: `AutoAdminLogon` moet `1` zijn.
```powershell
Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon' |
  Select AutoAdminLogon,DefaultUserName,DefaultDomainName
```

## OBS-autostart — via een geplande taak, NIET de Startup-map
De Startup-map (zowel die van de gebruiker als de gemeenschappelijke) **werkte niet**
op dit account: Windows kende het item (`Win32_StartupCommand` toonde het), het stond
niet uitgeschakeld (`StartupApproved` leeg), en het script werkte handmatig prima —
maar bij inloggen gebeurde er niets. Twee herstarts, twee keer geen OBS.

De Startup-map is een zwarte doos: mislukt het, dan hoor je niks. Daarom een geplande
taak — die kun je forceren en de Taakplanner houdt bij wanneer hij liep en met welk
resultaat.

```powershell
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument '-ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\MokumOBS\start-obs.ps1"'
$trigger = New-ScheduledTaskTrigger -AtLogOn -User 'MOKUMPOOLENDART\MokumStream'
$trigger.Delay = 'PT30S'
$principal = New-ScheduledTaskPrincipal -UserId 'MOKUMPOOLENDART\MokumStream' `
  -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName 'MokumOBS-Autostart' -Action $action -Trigger $trigger `
  -Principal $principal -Settings $settings -Force
```

Twee keuzes die je niet moet omdraaien:
- **`LogonType Interactive`, niet SYSTEM.** OBS heeft een echt bureaublad en de GPU
  nodig. Als SYSTEM start het onzichtbaar in sessie 0 en werkt de capture niet.
- **30 seconden vertraging.** Geeft netwerk, GPU-driver en de camera's tijd. OBS dat
  te vroeg start is een bekende oorzaak van bevroren RTSP-bronnen (#43).

Controle na een herstart (`LastTaskResult` moet `0` zijn):
```powershell
Get-ScheduledTask -TaskName 'MokumOBS-Autostart' | Get-ScheduledTaskInfo |
  Select LastRunTime,LastTaskResult
@(Get-Process obs64).Count    # moet 4 zijn
```

## Het startscript
`C:\MokumOBS\start-obs.ps1` — versie in de repo: [`docs/start-obs.ps1`](start-obs.ps1).

**Opgeloste bug (16-07):** het script herkende een draaiende OBS aan de venstertitel
`"*Profile: Tafel $n - *"`. Bij een Nederlandse OBS staat daar **`Profiel:`** → de
controle matchte nooit → het script dacht altijd "draait nog niet" en startte er
telkens een bij. Twee keer draaien = **8 OBS-instanties** die om dezelfde configmap
vechten.

Nu herkent het script de instantie aan het **pad in de commandline** (`\Tafel-N\`).
Dat is taal-onafhankelijk en meteen beschikbaar, terwijl een venstertitel pas
verschijnt als OBS klaar is met laden. OBS staat inmiddels op Engels, maar de fix
houdt stand als iemand dat ooit terugzet.

## Slaap en lock — let op: per gebruiker!
Power- en lock-instellingen zijn **per gebruikersprofiel**. Alles wat in Nick's sessie
was gezet, gold niet in het verse `MokumStream`-profiel. Bij een nieuw profiel dus
opnieuw:

```powershell
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
powercfg /SETACVALUEINDEX SCHEME_CURRENT SUB_NONE CONSOLELOCK 0
powercfg /SETACTIVE SCHEME_CURRENT
Set-ItemProperty 'HKCU:\Control Panel\Desktop' -Name ScreenSaveActive -Value '0'
Set-ItemProperty 'HKCU:\Control Panel\Desktop' -Name ScreenSaveTimeOut -Value '0'
```
Controle (moet `0x00000000` zijn):
```powershell
powercfg -q SCHEME_CURRENT SUB_SLEEP | Select-String -Context 0,6 'STANDBYIDLE'
```

## Wat gedeeld is tussen accounts (en dus blijft werken)
- **OBS-config** — `C:\MokumOBS\...` (portable), inclusief profielen, scenes en
  stream keys. `Geverifieerde gebruikers` heeft daar **Modify**, overgeërfd van `C:\`.
- **Sponsorlogo's** — `C:\Mokum-Sponsors`, machine-pad. De actieve scenes verwijzen
  hier naartoe, niet naar een gebruikersprofiel. (Gecontroleerd 16-07.)
- **De agent** — geplande taak `MokumAgent`, draait als **SYSTEM** en staat dus los
  van welk account is ingelogd.
- **Chrome Remote Desktop** — service `chromoting` draait als **LocalSystem** met de
  config in `C:\ProgramData\Google\Chrome Remote Desktop\`. Machine-breed, deelt de
  console-sessie. Daarom volgt CRD gewoon mee naar een ander account — je sluit
  jezelf niet buiten met een accountwissel. (Gecontroleerd 16-07 vóór het omschakelen.)

## Nog open (#43)
- [ ] Bekabeld netwerk verifiëren (geen wifi) + packet loss meten
- [ ] Fast Startup uit (schone boot bij herstart)
- [ ] BIOS: restore on power loss = on (na stroomuitval vanzelf opstarten)
- [ ] RTSP-bronnen automatisch laten herverbinden (camera-freeze, zie #43)
