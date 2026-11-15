# Watchdog (scheduled every 5 minutes): restarts the runner when it is gone
# or its heartbeat is older than 3 minutes (hung).
$ErrorActionPreference = 'Continue'
$state = if ($env:LUNO_AGENT_HOME) { $env:LUNO_AGENT_HOME } else { Join-Path $env:USERPROFILE '.luno-agent' }
$log = Join-Path $state 'logs\watchdog.log'
New-Item -ItemType Directory -Force (Join-Path $state 'logs') | Out-Null
function Note($text) { Add-Content -Path $log -Value "$((Get-Date).ToString('s')) $text" -Encoding utf8 }

$lock = Join-Path $state 'agent.lock'
$beat = Join-Path $state 'heartbeat'
$runnerPid = 0
if (Test-Path $lock) { [void][int]::TryParse((Get-Content $lock -Raw).Trim(), [ref]$runnerPid) }
$alive = $runnerPid -gt 0 -and (Get-Process -Id $runnerPid -ErrorAction SilentlyContinue)

if ($alive -and (Test-Path $beat)) {
  $age = (Get-Date) - (Get-Item $beat).LastWriteTime
  if ($age.TotalSeconds -le 180) { exit 0 }
  Note "heartbeat is $([int]$age.TotalSeconds)s old; killing pid $runnerPid"
  & taskkill /PID $runnerPid /T /F | Out-Null
  Remove-Item $lock -Force -ErrorAction SilentlyContinue
} elseif (-not $alive -and (Test-Path $lock)) {
  Remove-Item $lock -Force -ErrorAction SilentlyContinue
}
$result = & (Join-Path $PSScriptRoot 'start-agent.ps1')
Note "start: $result"
