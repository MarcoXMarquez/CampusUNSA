#!/usr/bin/env bash
# ==============================================================================
# CampusUNSA — Generate TypeScript Types from FastAPI OpenAPI (Bash)
# Synchronizes backend Pydantic models directly with frontend TypeScript types.
# ==============================================================================

set -eo pipefail

OPENAPI_URL="http://localhost:9000/openapi.json"
OUTPUT_DIR="frontend/src/types"
OUTPUT_FILE="$OUTPUT_DIR/api.ts"

echo "Fetching OpenAPI schema from FastAPI ($OPENAPI_URL)..."

mkdir -p "$OUTPUT_DIR"

if npx -y openapi-typescript "$OPENAPI_URL" -o "$OUTPUT_FILE"; then
    echo "TypeScript API contracts successfully generated in $OUTPUT_FILE"
    exit 0
else
    echo "ERROR: Failed to generate TypeScript types. Ensure FastAPI backend is running on port 9000."
    exit 1
fi
