# Start de 4 portable OBS-instanties (tafel 1, 3, 15, 16) en zet ze in kwadranten.
#
# Staat op de streaming-pc als C:\MokumOBS\start-obs.ps1 en wordt aangeroepen door
# de geplande taak 'MokumOBS-Autostart' (bij aanmelden, 30s vertraging).
# Zie docs/obs-pc-autostart.md voor de volledige inrichting.
#
# Deze kopie in de repo is de bron van waarheid — pas 'm hier aan en zet 'm daarna
# terug op de pc, zodat een herinstallatie (#36) niet afhangt van dat ene bestand.

$base = 'C:\MokumOBS'

# Zoek de OBS van tafel $n op z'n COMMANDLINE (het pad bevat \Tafel-N\).
# Niet op venstertitel: die is taalafhankelijk ("Profiel:" vs "Profile:") en pas
# gevuld zodra OBS klaar is met laden. Het pad klopt altijd en direct.
function Get-ObsProces($n) {
  $ci = Get-CimInstance Win32_Process -Filter "Name='obs64.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like "*\Tafel-$n\*" } | Select-Object -First 1
  if ($ci) { Get-Process -Id $ci.ProcessId -ErrorAction SilentlyContinue }
}

foreach ($n in 1,3,15,16) {
  if (-not (Get-ObsProces $n)) {
    $dir = "$base\Tafel-$n\obs-studio\bin\64bit"
    Start-Process -FilePath "$dir\obs64.exe" -WorkingDirectory $dir -ArgumentList '--portable','--multi'
    Start-Sleep -Seconds 3
  }
}

Start-Sleep -Seconds 6
if (-not ('WinArr' -as [type])) {
  Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class WinArr { [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h,int x,int y,int w,int ht,bool r); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int c); [DllImport("user32.dll")] public static extern int GetSystemMetrics(int i); }'
}
$sw = [WinArr]::GetSystemMetrics(0); $sh = [WinArr]::GetSystemMetrics(1)
$w = [int]($sw/2); $h = [int]($sh/2)
$pos = @{ 1=@(0,0); 3=@($w,0); 15=@(0,$h); 16=@($w,$h) }
foreach ($n in 1,3,15,16) {
  $p = Get-ObsProces $n
  if ($p -and $p.MainWindowHandle -ne 0) {
    [void][WinArr]::ShowWindow($p.MainWindowHandle,1)
    [void][WinArr]::MoveWindow($p.MainWindowHandle,$pos[$n][0],$pos[$n][1],$w,$h,$true)
  }
}
