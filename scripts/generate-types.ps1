# ==============================================================================
# CampusUNSA — Generate TypeScript Types from FastAPI OpenAPI (PowerShell)
# Synchronizes backend Pydantic models directly with frontend TypeScript types.
# ==============================================================================

$ErrorActionPreference = "Stop"

$openapiUrl = "http://localhost:9000/openapi.json"
$outputDir = "frontend/src/types"
$outputFile = "$outputDir/api.ts"

Write-Host "Fetching OpenAPI schema from FastAPI ($openapiUrl)..." -ForegroundColor Cyan

if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

try {
    npx -y openapi-typescript $openapiUrl -o $outputFile
    Write-Host "TypeScript API contracts successfully generated in $outputFile" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Failed to generate TypeScript types. Ensure FastAPI backend is running on port 9000." -ForegroundColor Red
    exit 1
}
