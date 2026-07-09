@echo off
REM ======================================================================
REM  Start-alle-OBS.bat  -  Mokum Streams
REM  Start alle 4 portable OBS-instanties tegelijk (tafels 1, 3, 15, 16).
REM
REM    --portable  = elke instantie gebruikt z'n eigen map/config
REM    --multi     = onderdrukt de "OBS draait al"-waarschuwing
REM    /D "<map>"  = zet de werkmap op de tafel-map (zoals je snelkoppelingen)
REM    timeout 3   = kleine pauze zodat ze niet over elkaar heen starten
REM
REM  LET OP: pas BASE hieronder aan als jouw "OBS Tafel N"-mappen
REM  ergens anders staan. Controleer met de Properties van een bestaande
REM  OBS-snelkoppeling (Target + Start in).
REM ======================================================================

setlocal
set "BASE=C:\Users\poole\OneDrive\Desktop"

start "" /D "%BASE%\OBS Tafel 1"  "%BASE%\OBS Tafel 1\obs-studio\bin\64bit\obs64.exe"  --portable --multi
timeout /t 3 >nul
start "" /D "%BASE%\OBS Tafel 3"  "%BASE%\OBS Tafel 3\obs-studio\bin\64bit\obs64.exe"  --portable --multi
timeout /t 3 >nul
start "" /D "%BASE%\OBS Tafel 15" "%BASE%\OBS Tafel 15\obs-studio\bin\64bit\obs64.exe" --portable --multi
timeout /t 3 >nul
start "" /D "%BASE%\OBS Tafel 16" "%BASE%\OBS Tafel 16\obs-studio\bin\64bit\obs64.exe" --portable --multi

endlocal
