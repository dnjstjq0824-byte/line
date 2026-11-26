# Installs the always-on pieces for the current Windows user (no admin, no
# stored password): power settings, a 5-minute watchdog task, and a logon
# task. Both tasks only call start-agent.ps1, which is a no-op while a runner
# is alive. They run in the logged-on session, so after a reboot the runner
# comes back at the next sign-in (turn on automatic sign-in for full
# hands-off recovery).
$ErrorActionPreference = 'Stop'
$watchdog = Join-Path $PSScriptRoot 'watchdog.ps1'
$conhost = "$env:SystemRoot\System32\conhost.exe"
$ps = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$headlessArgs = "--headless `"$ps`" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$watchdog`""
$run = "`"$conhost`" $headlessArgs"

& (Join-Path $PSScriptRoot 'power-setup.ps1')

schtasks /Create /F /TN 'LUNO\pc-agent-watchdog' /SC MINUTE /MO 5 /TR $run | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'could not create the watchdog task' }
# A logon-triggered task needs elevation; without it the Startup folder does the same job.
$ErrorActionPreference = 'Continue'
$logonOk = $false
try {
  schtasks /Create /F /TN 'LUNO\pc-agent-logon' /SC ONLOGON /TR $run 2>&1 | Out-Null
  $logonOk = ($LASTEXITCODE -eq 0)
} catch { $logonOk = $false }
$ErrorActionPreference = 'Stop'
if (-not $logonOk) {
  # ONLOGON needs elevation on some systems; the Startup folder does the same job.
  $startup = [Environment]::GetFolderPath('Startup')
  $lnk = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $startup 'LUNO pc-agent.lnk'))
  $lnk.TargetPath = $conhost
  $lnk.Arguments = $headlessArgs
  $lnk.WindowStyle = 7
  $lnk.Save()
  Write-Output 'logon start: Startup folder shortcut'
} else {
  Write-Output 'logon start: scheduled task LUNO\pc-agent-logon'
}
Write-Output 'watchdog: scheduled task LUNO\pc-agent-watchdog (every 5 minutes)'
& $watchdog
Write-Output (& (Join-Path $PSScriptRoot 'start-agent.ps1'))
