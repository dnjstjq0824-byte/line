# One command to put the remote-work pipeline live on this PC:
#   powershell -ExecutionPolicy Bypass -File tools\pc-agent\windows\go-live.ps1 -Birthdate 1990-01-01
# Steps: owner account -> admin grant (Cloudflare secret) -> bot/room/token -> always-on runner.
# Running this is the account owner agreeing to the LUNO terms and privacy policy.
param(
  [Parameter(Mandatory = $true)][string]$Birthdate,
  [string]$Base = 'https://luno-messenger.dnjstjqppk.workers.dev/api/v1'
)
$ErrorActionPreference = 'Stop'
$agent = Split-Path -Parent $PSScriptRoot
$repo = Split-Path -Parent (Split-Path -Parent $agent)
$provision = Join-Path $agent 'setup\provision.mjs'
$state = if ($env:LUNO_AGENT_HOME) { $env:LUNO_AGENT_HOME } else { Join-Path $env:USERPROFILE '.luno-agent' }

Write-Output '== 1/4 owner account'
node $provision register --base $Base --birthdate $Birthdate
if ($LASTEXITCODE -ne 0) { throw 'register failed' }
$owner = Get-Content (Join-Path $state 'owner-login.json') -Raw | ConvertFrom-Json

Write-Output '== 2/4 admin grant (Cloudflare secret ADMIN_USER_IDS)'
Push-Location $repo
try {
  $owner.userId | npx wrangler secret put ADMIN_USER_IDS
  if ($LASTEXITCODE -ne 0) { throw 'wrangler secret put failed (is wrangler logged in, and is the worker deployed?)' }
} finally { Pop-Location }
Start-Sleep -Seconds 8

Write-Output '== 3/4 bot, work room, allowlist, token, config'
node $provision setup --base $Base
if ($LASTEXITCODE -ne 0) { throw 'setup failed' }

Write-Output '== 4/4 always-on runner'
& (Join-Path $PSScriptRoot 'install.ps1')

Write-Output ''
Write-Output '== LUNO login for the phone =='
Write-Output "ID : $($owner.email)"
Write-Output "PW : $($owner.password)"
Write-Output 'Open the room "PC 작업실" in the app and tap a quick command.'
