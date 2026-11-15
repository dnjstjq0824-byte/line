# Stops the running runner (if any) and starts it again, so a changed
# config.json or a re-issued bot token takes effect.
$ErrorActionPreference = 'Continue'
$state = if ($env:LUNO_AGENT_HOME) { $env:LUNO_AGENT_HOME } else { Join-Path $env:USERPROFILE '.luno-agent' }
$lock = Join-Path $state 'agent.lock'
if (Test-Path $lock) {
  $runnerPid = 0
  [void][int]::TryParse((Get-Content $lock -Raw).Trim(), [ref]$runnerPid)
  if ($runnerPid -gt 0 -and (Get-Process -Id $runnerPid -ErrorAction SilentlyContinue)) {
    & taskkill /PID $runnerPid /T /F | Out-Null
    Start-Sleep -Seconds 2
  }
  Remove-Item $lock -Force -ErrorAction SilentlyContinue
}
& (Join-Path $PSScriptRoot 'start-agent.ps1')
