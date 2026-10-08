#!/usr/bin/env bash
# ==============================================================================
# CampusUNSA — Verification Oracle Script (Bash)
# Enforces: Linters, Pytest with coverage, Vitest, and Zero-Emoji policy.
# ==============================================================================

set -o pipefail

echo "============================================================"
echo " CampusUNSA: Running Deterministic Verification Suite"
echo "============================================================"

ALL_PASSED=0

# 1. Emoji Scanner (Zero Emojis Policy)
echo ""
echo "[1/5] Checking Zero-Emoji Policy..."
EMOJI_REGEX='[\x{1F600}-\x{1F64F}\x{1F300}-\x{1F5FF}\x{1F680}-\x{1F6FF}\x{1F700}-\x{1F77F}\x{1F780}-\x{1F7FF}\x{1F800}-\x{1F8FF}\x{1F900}-\x{1F9FF}\x{1FA00}-\x{1FA6F}\x{1FA70}-\x{1FAFF}\x{2600}-\x{26FF}\x{2700}-\x{27BF}]'

CHANGED_FILES=$(git status --porcelain | awk '{print $2}')
EMOJI_FOUND=0

for FILE in $CHANGED_FILES; do
    if [ -f "$FILE" ]; then
        if grep -P -q "$EMOJI_REGEX" "$FILE" 2>/dev/null; then
            echo "  [FAIL] Emoji detected in: $FILE"
            EMOJI_FOUND=1
        fi
    fi
done

if [ $EMOJI_FOUND -eq 1 ]; then
    echo "  FAILED: Zero-Emoji policy violated in modified files."
    ALL_PASSED=1
else
    echo "  PASSED: No emojis detected in tracked/modified files."
fi

# 2. Docker Health Verification
echo ""
echo "[2/5] Checking Docker Compose Environment..."
RUNNING_SERVICES=$(docker compose ps --status running --format "{{.Service}}" 2>/dev/null)
if [ -z "$RUNNING_SERVICES" ]; then
    echo "  FAILED: Docker daemon is not running or containers are stopped."
    echo "  Tip: Start Docker and execute 'docker compose up -d' before running verification."
    echo ""
    echo "============================================================"
    echo " VERIFICATION ABORTED: Docker environment is offline."
    echo "============================================================"
    exit 1
else
    echo "  PASSED: Docker services are running ($RUNNING_SERVICES)."
fi

# 3. Backend Linter (Ruff)
echo ""
echo "[3/5] Running Backend Linter (Ruff)..."
if docker compose exec -T backend ruff check app tests; then
    echo "  PASSED: Ruff linter checks clean."
else
    echo "  FAILED: Ruff linter errors detected."
    ALL_PASSED=1
fi

# 4. Backend Pytest Suite with Coverage
echo ""
echo "[4/5] Running Backend Pytest Suite with Coverage..."
if docker compose exec -T backend python -m pytest tests/ -v --cov=app --cov-report=term-missing; then
    echo "  PASSED: Pytest suite passed."
else
    echo "  FAILED: Pytest suite failed or coverage threshold not met."
    ALL_PASSED=1
fi

# 5. Frontend Component Tests (Vitest)
echo ""
echo "[5/5] Running Frontend Component Test Suite (Vitest)..."
if docker compose exec -T frontend npm run test; then
    echo "  PASSED: Vitest frontend tests passed."
else
    echo "  FAILED: Vitest frontend test suite failed."
    ALL_PASSED=1
fi

# Summary
echo ""
echo "============================================================"
if [ $ALL_PASSED -eq 0 ]; then
    echo " VERIFICATION SUCCESSFUL: All quality gates passed cleanly."
    echo " Ready for commit and Pull Request."
    echo "============================================================"
    exit 0
else
    echo " VERIFICATION FAILED: One or more checks failed."
    echo " Please resolve the issues before committing or opening a PR."
    echo "============================================================"
    exit 1
fi
