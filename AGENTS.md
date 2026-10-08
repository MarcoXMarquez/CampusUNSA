# AGENTS.md — Engineering Directives for AI Assistants and Agents

## 1. Project Identity and Context

CampusUNSA is an offline-resilient, centralized academic hub built for the university community of Universidad Nacional de San Agustín de Arequipa (UNSA). The platform consists of two synchronized channels:
1. A Progressive Web Application (PWA) built with Next.js 14 (App Router) and Tailwind CSS.
2. An omnichannel WhatsApp conversational assistant orchestrated with FastAPI and Evolution API.

### 1.1 Multi-Agent Scope & Ecosystem Compatibility
This document represents the universal single source of truth for all AI assistants and autonomous coding agents utilized by the engineering team:
* **Google Antigravity (AGY CLI):** Configured via `GEMINI.md` and workspace rules.
* **Claude Code:** Configured via `CLAUDE.md`.
* **OpenCode / OpenAI Codex:** Configured natively via `AGENTS.md`.
* **Cursor:** Configured via `.cursorrules`.
* **GitHub Copilot / Copilot Workspace:** Configured via `.github/copilot-instructions.md`.

All tool-specific configuration files act as direct shims pointing back to the directives defined here.

---

## 2. Technology Stack

* **Backend:** Python 3.11, FastAPI, SQLAlchemy 2.0, Pydantic v2, Alembic, Pytest.
* **Frontend:** Next.js 14, React 18, TypeScript, Tailwind CSS, Vitest, React Testing Library.
* **Database & Cache:** PostgreSQL 16 (relational ACID), Redis 7 (TTL caching for OTP and event queues).
* **Messaging Gateway:** Evolution API (Node.js / Baileys).
* **Infrastructure:** Docker Compose, GitHub Actions CI.

---

## 3. Inviolable Constraints

Every AI agent modifying or generating code in this repository MUST strictly follow these rules without exception:

1. **ZERO EMOJIS (Strict Prohibition):**
   * Inserting emojis in source code, inline comments, docstrings, tests, documentation, templates, branch names, commit messages, or Pull Request descriptions is strictly prohibited.
   * Any emoji usage is considered a quality defect that breaks pre-commit hooks and CI pipelines.

2. **REPOSITORY LANGUAGE POLICY (English Only in All Artifacts):**
   * Even when human developers converse with AI agents in Spanish (or any other language) within chat sessions, **ALL repository artifacts must be written exclusively in standard technical English**.
   * This applies to: source code, variables, function names, inline comments, docstrings, unit tests, markdown documentation (`docs/`, `README.md`), git commit messages, branch names, issue descriptions, and pull request titles/bodies.
   * AI agents may reply in the developer's language of choice during chat, but all text committed or written to the repository must be in English.

3. **Institutional Security Policies:**
   * Google OAuth authentication is strictly restricted to verified `@unsa.edu.pe` institutional domains.
   * Any login attempt from external domains (e.g., `@gmail.com`) must be rejected immediately with `HTTP 403 Forbidden` and error code `DOMAIN_NOT_ALLOWED`.
   * WhatsApp OTP pairing codes must expire after exactly 300 seconds (5 minutes) in Redis.

4. **Test-Driven Development (TDD First):**
   * Unit tests defining expected behavior must be written before implementing business logic in endpoints or services (Red phase).
   * Backend test coverage must consistently meet or exceed the 80% threshold.

5. **Strict Type Safety:**
   * In Python: All functions must include comprehensive `typing` annotations. Input and output schemas must be modeled using Pydantic v2.
   * In TypeScript: Using `any` is strictly prohibited. Use strict interfaces and types.

6. **PROHIBITION OF FORCE FLAGS (Strict No-Force Policy):**
   * Executing `git push --force`, `git push -f`, `--force-with-lease`, `git commit --amend` on published commits, or force merges is strictly prohibited across all branches.
   * Rewriting published Git history is forbidden and blocked both server-side on GitHub and client-side via `.githooks/pre-push`.

### 3.1 Execution Discipline & Evidence Gates

1. **Root Cause Analysis Before Editing:**
   * Reproduce defects through a failing test case before modifying implementation logic. Bypassing boundaries does not constitute proof.
2. **No Blind Retries:**
   * If a test, linter, or command fails twice consecutively with identical output, halt immediately. Re-examine architectural assumptions rather than executing blind modifications.
3. **Red Main is an Emergency:**
   * The `main` branch must remain deployable and stable at all times. Never push unverified code. Always validate with `./scripts/verify.ps1` or `./scripts/verify.sh` prior to opening a Pull Request.
4. **Mandatory Evidence in Pull Requests:**
   * Every Pull Request description must contain concrete proof of validation: terminal outputs from the verification oracle and before/after screenshots for any visual UI modification in Next.js.

---

## 4. Essential Command Directory

All commands must be executed from the project root or inside their respective containers:

### 4.1 Docker Environment
```bash
# Start all microservices in the background
docker compose up -d

# Check health and status of containers
docker compose ps

# Inspect live logs
docker compose logs -f [backend|frontend|postgres|redis|evolution]
```

### 4.2 Backend (FastAPI & Pytest)
```bash
# Run test suite with coverage report
docker compose exec backend python -m pytest tests/ -v --cov=app --cov-report=term-missing

# Run static linter (Ruff)
docker compose exec backend ruff check app tests

# Apply automated linter fixes
docker compose exec backend ruff check --fix app tests

# Generate new database migration with Alembic
docker compose exec backend alembic revision --autogenerate -m "migration_description"

# Apply pending database migrations
docker compose exec backend alembic upgrade head
```

### 4.3 Frontend (Next.js & Vitest)
```bash
# Run unit component tests
docker compose exec frontend npm run test

# Run TypeScript type check
docker compose exec frontend npx tsc --noEmit
```

### 4.4 Unified Verification Oracle
```bash
# Windows PowerShell
./scripts/verify.ps1

# Linux / macOS / WSL
./scripts/verify.sh
```

---

## 5. Git and Sprint Workflow

1. **Branch Strategy:**
   * The `main` branch is protected and represents stable, verified code.
   * Every user story must be implemented on its own feature branch following the format:
     `feature/XX-short-name-in-kebab-case` (where `XX` is the issue number, e.g., `feature/02-institutional-google-oauth`).

2. **Commit Convention (Conventional Commits):**
   * Structure: `<type>(<scope>): <concise description in lowercase>`
   * Valid types: `feat`, `fix`, `test`, `docs`, `refactor`, `ci`, `chore`.
   * Examples:
     * `feat(auth): validate institutional unsa email domain`
     * `test(auth): add unit test for unauthorized external domain rejection`
     * `docs(api): update authentication swagger schemas`

3. **Pull Requests and Merges:**
   * Every Pull Request must reference its corresponding issue in the description: `Closes #X`.
   * All GitHub Actions CI checks must pass green before merge.
   * Merging into `main` must strictly be performed via **Squash Merge** to maintain a clean, atomic git log.

---

## 6. Repository Documentation Map

Before assuming requirements or designing contracts, consult formal documents in `docs/`:

* **Software Requirements Specification (SRS):** [docs/requirements/software-requirements-specification.md](docs/requirements/software-requirements-specification.md)
* **System Architecture Document (SAD):** [docs/architecture/system-architecture.md](docs/architecture/system-architecture.md)
* **Agile Sprint Plan & Team Matrix:** [docs/planning/agile-sprint-plan.md](docs/planning/agile-sprint-plan.md)
* **Agentic Engineering Standard:** [docs/planning/agentic-engineering-standard.md](docs/planning/agentic-engineering-standard.md)
* **Contribution Guidelines:** [CONTRIBUTING.md](CONTRIBUTING.md)
