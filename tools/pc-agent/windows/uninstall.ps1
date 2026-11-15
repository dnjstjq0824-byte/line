# Removes the scheduled tasks / Startup shortcut and stops the runner.
# The state folder (%USERPROFILE%\.luno-agent) is left in place.
schtasks /Delete /F /TN 'LUNO\pc-agent-watchdog' 2>$null | Out-Null
schtasks /Delete /F /TN 'LUNO\pc-agent-logon' 2>$null | Out-Null
Remove-Item (Join-Path ([Environment]::GetFolderPath('Startup')) 'LUNO pc-agent.lnk') -Force -ErrorAction SilentlyContinue
$state = if ($env:LUNO_AGENT_HOME) { $env:LUNO_AGENT_HOME } else { Join-Path $env:USERPROFILE '.luno-agent' }
$lock = Join-Path $state 'agent.lock'
if (Test-Path $lock) {
  $runnerPid = 0
  [void][int]::TryParse((Get-Content $lock -Raw).Trim(), [ref]$runnerPid)
  if ($runnerPid -gt 0) { & taskkill /PID $runnerPid /T /F 2>$null | Out-Null }
  Remove-Item $lock -Force -ErrorAction SilentlyContinue
}
Write-Output 'pc-agent uninstalled (state folder kept)'
