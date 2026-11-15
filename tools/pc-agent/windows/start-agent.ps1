# Starts the runner hidden and detached, unless one is already alive.
# Safe to call any number of times (the watchdog calls it every 5 minutes).
$ErrorActionPreference = 'Stop'
$state = if ($env:LUNO_AGENT_HOME) { $env:LUNO_AGENT_HOME } else { Join-Path $env:USERPROFILE '.luno-agent' }
$entry = Join-Path (Split-Path -Parent $PSScriptRoot) 'src\index.mjs'
New-Item -ItemType Directory -Force (Join-Path $state 'logs') | Out-Null

$lock = Join-Path $state 'agent.lock'
if (Test-Path $lock) {
  $runnerPid = 0
  [void][int]::TryParse((Get-Content $lock -Raw).Trim(), [ref]$runnerPid)
  if ($runnerPid -gt 0 -and (Get-Process -Id $runnerPid -ErrorAction SilentlyContinue)) {
    Write-Output "runner already running (pid $runnerPid)"
    exit 0
  }
}
if (-not (Test-Path (Join-Path $state 'config.json'))) {
  Write-Output 'runner not configured yet (no config.json) - run setup\provision.mjs'
  exit 0
}
$node = (Get-Command node -ErrorAction Stop).Source
$proc = Start-Process -FilePath $node -ArgumentList "`"$entry`"" -WindowStyle Hidden -PassThru `
  -RedirectStandardOutput (Join-Path $state 'logs\stdout.log') -RedirectStandardError (Join-Path $state 'logs\stderr.log')
Write-Output "runner started (pid $($proc.Id))"
