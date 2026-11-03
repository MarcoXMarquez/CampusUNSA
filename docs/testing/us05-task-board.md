# US-05 Task Board Verification Evidence

## Scope

This delivery implements SRS REQ-09 and issue #5: deadline urgency grouping and student-managed task completion. Work is on `feature/05-urgency-task-board`. The screenshots compare baseline commit `95352cd` with the implementation using the same three synthetic assignments and a frozen `2026-11-03T12:00:00Z` clock in the `America/Lima` timezone.

## Acceptance Results

| Criterion | Evidence | Result |
| :--- | :--- | :--- |
| Red below 24 hours | Frozen UTC tests and computed browser colors | Passed |
| Yellow from 24 through 72 hours | Exact millisecond boundaries, including exactly 24 and 72 hours | Passed |
| Green above 72 hours | 72 hours plus one millisecond and browser rendering | Passed |
| Optimistic completion | Delayed PATCH response keeps immediate UI feedback | Passed |
| Backend persistence | Complete, repeat, reopen, GET again, and resynchronize | Passed |
| Failed save rollback | Query snapshot restored after HTTP 500 | Passed |
| Responsive 360px and 768px | Browser tests in both system color schemes | Passed |

Overdue, undated, invalid-date, and completed assignments have explicit neutral states. A clock-driven component test verifies that an open board updates urgency without requiring a reload. The completion flag is separate from the LMS publication or submission state.

## Automated Validation

Validation completed on 2026-11-03. The backend ran in Docker with Python 3.11.18 and PostgreSQL 16; the frontend container uses the repository's Node 18 image. Local browser checks used Edge through Playwright 1.55.1, which supports the project's Node 18 CI baseline.

| Check | Result |
| :--- | :--- |
| `./scripts/verify.ps1` | All six gates passed |
| Full backend suite | 224 passed, 4 skipped; 91.64% branch-inclusive coverage |
| Dedicated authorization coverage | 45 passed; 100% coverage |
| Completion integration tests against PostgreSQL | 12 passed |
| Frontend Vitest suite | 37 passed |
| TypeScript | `tsc --noEmit --incremental false` passed in the frontend container |
| Ruff | Passed |
| UI directives gate | Passed |
| Playwright viewport/theme scenarios | 4 passed |
| Alembic upgrade and model comparison | Migration applied; no new upgrade operations detected |
| Local wiki validator | Passed; 100/100 structural parity |

The four skipped backend cases are shell-oracle contract tests unavailable in the backend-only container: the repository-level shell scripts are not mounted there, and PowerShell is unavailable. The actual repository-level PowerShell oracle was executed separately and passed.

The initial Red phase demonstrated missing completion storage and routes, missing urgency helpers, missing query orchestration, and failing urgency/completion component assertions before implementation. The Green phase includes ownership checks, strict boolean payload validation, idempotent writes, sync preservation, rollback, offline cache retention, and anonymous refresh protection.

The complete terminal transcript is [verification.txt](evidence/us05/verification.txt). ANSI escapes and test-runner status glyphs are normalized to ASCII to comply with the repository artifact policy.

## Concurrent Load Results

The isolated load run used 1,000 synthetic student sessions, 50 new sessions per second, and 60.13 seconds at full population. All registered endpoints met the existing strict p50 below 100ms and p95 below 300ms thresholds, with zero failures and resource bounds satisfied.

| Completion endpoint metric | Observed |
| :--- | :--- |
| Requests | 577 |
| Failures | 0 |
| p50 | 89.03ms |
| p95 | 160.74ms |

The exact machine-readable result is [load-summary.json](evidence/us05/load-summary.json). Full disposable benchmark artifacts remain under the ignored `perf-results/f4fabc21890b/` directory. A dedicated synthetic completion identity keeps the measured assignment independent from deletion scenarios.

## UI Directives Compliance

- [x] Konsta iOS inset lists and the existing Hoy, Calendario, Ajustes navigation.
- [x] One urgency badge per task, with neutral source text and readable labels.
- [x] Red reserved for future deadlines below 24 hours; yellow and green use semantic deadline tokens required by US-05.
- [x] Single row targets open the detail sheet; completion actions live inside the sheet.
- [x] Loading skeletons, empty, offline, expired Moodle session, retryable sync error, and long-content states tested.
- [x] Cached data remains visible after network failures; changes require connectivity.
- [x] Headlines clamp to two lines and metadata truncates.
- [x] Interactive task controls meet the 44px touch target floor.
- [x] System fonts, Spanish product copy, and light/dark parity.
- [x] No unimplemented upload controls or additional navigation tabs.

The story explicitly introduces yellow and green urgency semantics alongside the existing red token. Badges use a colored dot with neutral text so priority is communicated by both label and color, while avoiding multiple colored pills on a row.

## Screenshots

The baseline was served from a temporary checkout of `HEAD`, with its own build directory and matching mocked API data. Screenshots were visually inspected after verifying that styles loaded.

| Viewport and theme | Before | After | Detail and failed-save feedback |
| :--- | :--- | :--- | :--- |
| 360px, light | [Before](evidence/us05/before-360-light.png) | [After](evidence/us05/after-360-light.png) | [Detail](evidence/us05/detail-360-light.png) |
| 360px, dark | [Before](evidence/us05/before-360-dark.png) | [After](evidence/us05/after-360-dark.png) | [Detail](evidence/us05/detail-360-dark.png) |
| 768px, light | [Before](evidence/us05/before-768-light.png) | [After](evidence/us05/after-768-light.png) | [Detail](evidence/us05/detail-768-light.png) |
| 768px, dark | [Before](evidence/us05/before-768-dark.png) | [After](evidence/us05/after-768-dark.png) | [Detail](evidence/us05/detail-768-dark.png) |

Browser API responses are controlled fixtures; database persistence and ownership are independently verified by the PostgreSQL integration suite. This distinction keeps browser tests reproducible without relying on Google or Moodle availability.

## Reproduction

```powershell
docker compose exec backend alembic upgrade head
docker compose exec backend alembic check
./scripts/verify.ps1
cd frontend
npm ci
npx playwright install chromium
npm run test:e2e
```

An installed Edge or Chrome may be selected through `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. CI executes all viewport/theme checks and uploads screenshots and retained failure traces. Apply the migration before running the updated backend against another existing database. The separate schedule and service-worker stories are outside this delivery.
