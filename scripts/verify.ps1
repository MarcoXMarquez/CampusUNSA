# ==============================================================================
# CampusUNSA — Verification Oracle Script (PowerShell)
# Enforces: Linters, Pytest with coverage, Vitest, and Zero-Emoji policy.
# ==============================================================================

$ErrorActionPreference = "Continue"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " CampusUNSA: Running Deterministic Verification Suite" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$allPassed = $true

# 1. Emoji Scanner (Zero Emojis Policy)
Write-Host "`n[1/5] Checking Zero-Emoji Policy..." -ForegroundColor Yellow
$emojiPattern = "[\uD83C-\uDBFF\uDC00-\uDFFF]|[\u2600-\u27BF]"

$changedFiles = git status --porcelain | ForEach-Object {
    $line = $_.Trim()
    if ($line.Length -gt 3) {
        $line.Substring(3).Trim()
    }
}

$emojiFound = $false
foreach ($file in $changedFiles) {
    if (Test-Path $file -PathType Leaf) {
        $extension = [System.IO.Path]::GetExtension($file)
        if ($extension -match "\.(py|ts|tsx|js|jsx|json|md|yml|yaml|ini|sh|ps1)$") {
            $content = Get-Content -Path $file -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
            if ($content -match $emojiPattern) {
                Write-Host "  [FAIL] Emoji detected in: $file" -ForegroundColor Red
                $emojiFound = $true
            }
        }
    }
}

if ($emojiFound) {
    Write-Host "  FAILED: Zero-Emoji policy violated in modified files." -ForegroundColor Red
    $allPassed = $false
} else {
    Write-Host "  PASSED: No emojis detected in tracked/modified files." -ForegroundColor Green
}

# 2. Docker Health Verification
Write-Host "`n[2/5] Checking Docker Compose Environment..." -ForegroundColor Yellow
$dockerPs = docker compose ps --status running --format "{{.Service}}" 2>$null
if ($LASTEXITCODE -ne 0 -or -not $dockerPs) {
    Write-Host "  FAILED: Docker daemon is not running or containers are stopped." -ForegroundColor Red
    Write-Host "  Tip: Open Docker Desktop and execute 'docker compose up -d' before running verification." -ForegroundColor DarkYellow
    $allPassed = $false
} else {
    Write-Host "  PASSED: Docker services are running ($($dockerPs -join ', '))." -ForegroundColor Green
}

if (-not $allPassed -and ($LASTEXITCODE -ne 0 -or -not $dockerPs)) {
    Write-Host "`n============================================================" -ForegroundColor Cyan
    Write-Host " VERIFICATION ABORTED: Docker environment is offline." -ForegroundColor Red
    Write-Host "============================================================" -ForegroundColor Cyan
    exit 1
}

# 3. Backend Linter (Ruff)
Write-Host "`n[3/5] Running Backend Linter (Ruff)..." -ForegroundColor Yellow
$ruffOutput = docker compose exec -T backend ruff check app tests 2>&1
Write-Host $ruffOutput
if ($LASTEXITCODE -ne 0) {
    Write-Host "  FAILED: Ruff linter errors detected." -ForegroundColor Red
    $allPassed = $false
} else {
    Write-Host "  PASSED: Ruff linter checks clean." -ForegroundColor Green
}

# 4. Backend Unit Tests with Coverage (Pytest)
Write-Host "`n[4/5] Running Backend Pytest Suite with Coverage..." -ForegroundColor Yellow
$pytestOutput = docker compose exec -T backend python -m pytest tests/ -v --cov=app --cov-report=term-missing 2>&1
Write-Host $pytestOutput
if ($LASTEXITCODE -ne 0) {
    Write-Host "  FAILED: Pytest suite failed or coverage threshold not met." -ForegroundColor Red
    $allPassed = $false
} else {
    Write-Host "  PASSED: Pytest suite passed." -ForegroundColor Green
}

# 5. Frontend Component Tests (Vitest)
Write-Host "`n[5/5] Running Frontend Component Test Suite (Vitest)..." -ForegroundColor Yellow
$vitestOutput = docker compose exec -T frontend npm run test 2>&1
Write-Host $vitestOutput
if ($LASTEXITCODE -ne 0) {
    Write-Host "  FAILED: Vitest frontend test suite failed." -ForegroundColor Red
    $allPassed = $false
} else {
    Write-Host "  PASSED: Vitest frontend tests passed." -ForegroundColor Green
}

# Summary
Write-Host "`n============================================================" -ForegroundColor Cyan
if ($allPassed) {
    Write-Host " VERIFICATION SUCCESSFUL: All quality gates passed cleanly." -ForegroundColor Green
    Write-Host " Ready for commit and Pull Request." -ForegroundColor Green
    Write-Host "============================================================" -ForegroundColor Cyan
    exit 0
} else {
    Write-Host " VERIFICATION FAILED: One or more checks failed." -ForegroundColor Red
    Write-Host " Please resolve the issues before committing or opening a PR." -ForegroundColor Red
    Write-Host "============================================================" -ForegroundColor Cyan
    exit 1
}
