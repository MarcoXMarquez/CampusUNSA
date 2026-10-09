---
name: tdd-oracle
description: Test-Driven Development (TDD) oracle and test design engine for CampusUNSA. Guides test case design (Red phase), mock implementations for SQLAlchemy/Redis, and coverage verification (>= 80%) across backend and frontend.
---

# TDD Oracle & Test Design Standard — CampusUNSA

## 1. Overview and Mission

The `tdd-oracle` skill enforces rigorous Test-Driven Development (TDD) across all CampusUNSA development workflows. Every feature, bug fix, or endpoint MUST begin with automated unit tests defining expected boundaries and failures before any implementation logic is written.

## 2. Inviolable Quality Constraints

1. **Zero Emojis:** Strictly prohibited in test files, docstrings, assertions, log messages, and test reports.
2. **English Only:** All test files, test names, mock variables, and assertions must be written in technical English.
3. **Red Phase First:** Write tests and run them to confirm failure before touching application code.
4. **Coverage Threshold:** Backend test coverage must consistently meet or exceed 80% (`--cov=app --cov-report=term-missing`).
5. **Isolated Unit Execution:** Never depend on live external network connections (Google OAuth, real WhatsApp API). Always mock external boundaries.

## 3. Backend Testing Architecture (FastAPI & Pytest)

### 3.1 Test Directory Structure
```
backend/tests/
├── conftest.py          # Shared fixtures (TestClient, mock_db_session, mock_redis_client)
├── test_auth.py         # Authentication and session validation
├── test_health.py       # Infrastructure and health-check endpoints
└── test_security.py     # Cryptography, JWT, and institutional domain validation
```

### 3.2 Standard Backend Test Patterns
* **FastAPI TestClient with Dependency Overrides:**
  Override database and Redis sessions so tests run in memory without requiring live database network state.
* **External HTTP Mocking:**
  Use `unittest.mock.patch` with `httpx.get` or external SDK calls.
* **Equivalence Partitioning & Boundary Testing:**
  Every endpoint must test:
  - Happy path (valid payload, institutional domain).
  - Validation failures (missing fields, wrong data types).
  - Security rejections (external email domain HTTP 403, missing token HTTP 401).
  - Database edge cases (entity not found, inactive user).

### 3.3 Backend Execution Commands
```bash
# Run specific test file verbosely
docker compose exec backend python -m pytest tests/test_auth.py -v

# Run full suite with term-missing coverage report
docker compose exec backend python -m pytest tests/ -v --cov=app --cov-report=term-missing
```

## 4. Frontend Testing Architecture (Next.js 14 & Vitest)

### 4.1 Test Directory Structure
```
frontend/src/
├── app/
│   ├── page.test.tsx    # Landing page and root layout tests
├── components/
│   └── *.test.tsx       # UI component interaction tests
```

### 4.2 Standard Frontend Test Patterns
* Use React Testing Library with `render` and `screen`.
* Validate user interactions using `@testing-library/user-event`.
* Assert accessibility with `getByRole`, `getByLabelText`, and `getByText`.

### 4.3 Frontend Execution Commands
```bash
# Run unit component tests
docker compose exec frontend npm run test

# Run TypeScript type check
docker compose exec frontend npx tsc --noEmit
```

## 5. TDD Execution Lifecycle

1. **Step 1 (Red Phase):**
   - Write comprehensive tests in `backend/tests/test_<feature>.py`.
   - Run Pytest. Verify that tests fail due to missing endpoints, functions, or status codes.
2. **Step 2 (Green Phase):**
   - Implement minimum required code (schemas, models, routers).
   - Re-run Pytest until all tests pass.
3. **Step 3 (Refactor & Coverage Phase):**
   - Inspect coverage missing lines.
   - Refactor for cleanliness, type hints, and performance.
   - Validate that coverage is >= 80%.
