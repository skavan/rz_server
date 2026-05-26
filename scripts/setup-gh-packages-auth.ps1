# scripts/setup-gh-packages-auth.ps1
# One-time machine setup so pnpm publish/install can talk to GitHub Packages
# without you ever managing a PAT. Idempotent - safe to re-run.

$ErrorActionPreference = "Stop"
Write-Host "`n=== GitHub Packages auth setup ===" -ForegroundColor Cyan

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  Write-Host "Install GitHub CLI first: https://cli.github.com/ (winget install GitHub.cli)" -ForegroundColor Red
  exit 1
}
Write-Host "[1/4] gh CLI found." -ForegroundColor Green

$null = gh auth status -h github.com 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "[2/4] gh not logged in. Launching browser login with write:packages scope..." -ForegroundColor Yellow
  gh auth login -h github.com -s write:packages -w
  if ($LASTEXITCODE -ne 0) { throw "gh auth login failed." }
} else {
  Write-Host "[2/4] gh logged in to github.com." -ForegroundColor Green
}

$statusOutput = (gh auth status -h github.com 2>&1 | Out-String)
if ($statusOutput -notmatch "write:packages") {
  Write-Host "[3/4] Adding write:packages scope..." -ForegroundColor Yellow
  gh auth refresh -h github.com -s write:packages
  if ($LASTEXITCODE -ne 0) { throw "Failed to add write:packages scope." }
} else {
  Write-Host "[3/4] write:packages scope already granted." -ForegroundColor Green
}

$marker = "# >>> GITHUB_PACKAGES_TOKEN from gh CLI (for @skavan/* publish + install) <<<"
$block = @"

$marker
# Re-run scripts/setup-gh-packages-auth.ps1 to update.
if (Get-Command gh -ErrorAction SilentlyContinue) {
  `$env:GITHUB_PACKAGES_TOKEN = (gh auth token 2>`$null)
}
"@

if (-not (Test-Path -LiteralPath $PROFILE)) {
  New-Item -ItemType File -Path $PROFILE -Force | Out-Null
}
$existing = Get-Content -LiteralPath $PROFILE -Raw -ErrorAction SilentlyContinue
if ($existing -and $existing.Contains($marker)) {
  Write-Host "[4/4] Profile already configured (no change)." -ForegroundColor Green
} else {
  Add-Content -LiteralPath $PROFILE -Value $block
  Write-Host "[4/4] Appended auto-token block to $PROFILE" -ForegroundColor Green
}

$env:GITHUB_PACKAGES_TOKEN = (gh auth token 2>$null)
$len = if ($env:GITHUB_PACKAGES_TOKEN) { $env:GITHUB_PACKAGES_TOKEN.Length } else { 0 }
Write-Host ""
Write-Host "Done. Token in this session: $len chars. Open a fresh PowerShell to pick up the profile." -ForegroundColor Cyan

$stale = [Environment]::GetEnvironmentVariable("GITHUB_PACKAGES_TOKEN", "User")
if ($stale) {
  Write-Host ""
  Write-Host "Note: a stale persistent GITHUB_PACKAGES_TOKEN exists at the User level and will" -ForegroundColor Yellow
  Write-Host "shadow the gh-CLI value. Remove with:" -ForegroundColor Yellow
  Write-Host '  [Environment]::SetEnvironmentVariable("GITHUB_PACKAGES_TOKEN", $null, "User")' -ForegroundColor Yellow
}
