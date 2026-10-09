---
name: agentic-quality-gate
description: Quality gate and verification oracle runner for CampusUNSA. Enforces Zero-Emoji rules, Conventional Commits, No-Force Git policy, Ruff linting, and automated verification before opening Pull Requests.
---

# Agentic Quality Gate Standard — CampusUNSA

## 1. Overview and Mission

The `agentic-quality-gate` skill serves as the ultimate automated gatekeeper for code quality, architectural integrity, and Git discipline across all AI agents and human contributors working on CampusUNSA.

## 2. Inviolable Repository Constraints

1. **ZERO EMOJIS (Absolute Zero Policy):**
   - Emojis are strictly banned from source code, inline comments, docstrings, tests, documentation, commit messages, and PR titles/bodies.
   - Any emoji detected constitutes a breaking defect caught by `.githooks/pre-commit` and the verification oracle.
2. **ENGLISH ONLY IN ALL ARTIFACTS:**
   - Regardless of conversational language in chat, all committed artifacts must be in standard technical English.
3. **NO FORCE FLAGS (Strict No-Force Policy):**
   - Executing `git push --force`, `git push -f`, `--force-with-lease`, `git commit --amend` on published commits is strictly forbidden.
4. **CONVENTIONAL COMMITS:**
   - Format: `<type>(<scope>): <concise description in lowercase>`
   - Allowed types: `feat`, `fix`, `test`, `docs`, `refactor`, `ci`, `chore`.

## 3. Verification Oracle Execution

Before committing changes or opening a Pull Request, you MUST execute the unified verification oracle:

### 3.1 Windows PowerShell
```powershell
./scripts/verify.ps1
```

### 3.2 Linux / macOS / WSL
```bash
./scripts/verify.sh
```

### 3.3 Verification Checks Executed
The oracle runs five deterministic stages:
1. `Checking Zero-Emoji Policy`: Scans modified and tracked repository files for unicode emoji ranges.
2. `Checking Docker Compose Environment`: Confirms containers (`backend`, `evolution-api`, `frontend`, `postgres`, `redis`) are running and healthy.
3. `Running Backend Linter (Ruff)`: Validates Python syntax and PEP8 compliance (`ruff check app tests`).
4. `Running Backend Pytest Suite`: Validates all tests pass with coverage report >= 80%.
5. `Running Frontend Component Test Suite`: Validates Vitest React component tests.

## 4. Remediation Runbook

* **If Ruff reports lint errors:**
  ```bash
  docker compose exec backend ruff check --fix app tests
  ```
* **If coverage falls below 80%:**
  Inspect missing line numbers in `Missing` column and add unit tests to `backend/tests/`.
* **If emoji check fails:**
  Search and remove any emoji characters or non-standard unicode symbols from modified files.
* **If Docker containers are offline:**
  ```bash
  docker compose up -d
  ```

## 5. Pull Request Evidence Standard

Every Pull Request must strictly follow `.github/pull_request_template.md` and include:
* Terminal log proof of successful `./scripts/verify.ps1` execution.
* Closes issue reference (`Closes #X`).
* Assigned reviewer (e.g., `@iccoscco`).
