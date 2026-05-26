param(
  [string]$Note,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$RemainingArgs
)

$ErrorActionPreference = 'Stop'

function Run-Step {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Title,
    [Parameter(Mandatory = $true)]
    [scriptblock]$Action
  )

  Write-Host ""
  Write-Host "==> $Title" -ForegroundColor Cyan
  $global:LASTEXITCODE = 0
  & $Action
  if ($LASTEXITCODE -ne 0) {
    throw "Step failed: $Title (exit code $LASTEXITCODE)"
  }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

if ([string]::IsNullOrWhiteSpace($Note)) {
  if ($RemainingArgs -and $RemainingArgs.Count -gt 0) {
    $Note = ($RemainingArgs -join ' ').Trim()
  }
}

if ([string]::IsNullOrWhiteSpace($Note)) {
  $Note = Read-Host "Enter release note/comment"
}

if ([string]::IsNullOrWhiteSpace($Note)) {
  throw "Release note/comment is required."
}

Run-Step -Title "Set workspace root" -Action {
  Set-Location $repoRoot
  Write-Host "Root: $(Get-Location)"
}

Run-Step -Title "Go to drizzle/shared" -Action {
  Set-Location (Join-Path $repoRoot "drizzle/shared")
  Write-Host "Working dir: $(Get-Location)"
}

Run-Step -Title "Run shared release (patch)" -Action {
  npm run release:shared -- patch -- --note "$Note" --skip-clean-check
}

Run-Step -Title "Return to repo root" -Action {
  Set-Location $repoRoot
}

Run-Step -Title "Push main and tags" -Action {
  git push origin main --follow-tags
}

Run-Step -Title "Trigger shared publish workflow" -Action {
  npm run publish:shared
}

Run-Step -Title "Show publish workflow status" -Action {
  npm run publish:shared:status
}

Write-Host ""
Write-Host "Done. Shared patch release flow completed." -ForegroundColor Green
