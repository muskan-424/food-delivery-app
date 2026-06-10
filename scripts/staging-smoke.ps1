# Run staging smoke checks against a running API.
# Usage: .\scripts\staging-smoke.ps1
#        .\scripts\staging-smoke.ps1 -BaseUrl "https://staging.example.com"

param(
  [string]$BaseUrl = $env:BASE_URL
)

if (-not $BaseUrl) { $BaseUrl = "http://localhost:4000" }

$env:BASE_URL = $BaseUrl
Write-Host "Staging smoke -> $BaseUrl"
Set-Location (Join-Path $PSScriptRoot "..")
npm run smoke:staging
exit $LASTEXITCODE
