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
* **Frontend:** Next.js 14, React 18, TypeScript, Tailwind CSS, Konsta UI v4, Phosphor Icons, date-fns, Vitest, React Testing Library.
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
   * **Exception (product copy):** User-facing interface text is Spanish (`es-PE`) product content, not repository prose. It may appear in UI components and message catalogs, but identifiers, comments, test names, and documentation prose must remain English. See 3.2.8.

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

7. **FRONTEND PRESENTATION STANDARD:**
   * All UI code under `frontend/` must comply with section 3.2.
   * Violations are quality defects that fail `./scripts/verify.sh` and the PR hygiene gates.

### 3.1 Execution Discipline & Evidence Gates

1. **Root Cause Analysis Before Editing:**
   * Reproduce defects through a failing test case before modifying implementation logic. Bypassing boundaries does not constitute proof.
2. **No Blind Retries:**
   * If a test, linter, or command fails twice consecutively with identical output, halt immediately. Re-examine architectural assumptions rather than executing blind modifications.
3. **Red Main is an Emergency:**
   * The `main` branch must remain deployable and stable at all times. Never push unverified code. Always validate with `./scripts/verify.ps1` or `./scripts/verify.sh` prior to opening a Pull Request.
4. **Mandatory Evidence in Pull Requests:**
   * Every Pull Request description must contain concrete proof of validation: terminal outputs from the verification oracle and before/after screenshots for any visual UI modification in Next.js.

### 3.2 Frontend Presentation and UI/UX Directives

Every AI agent that creates or modifies code under `frontend/` MUST apply the directives in this section. They define the iOS-native presentation standard of the PWA (primary reference: Apple Reminders; secondary references: Things 3 and Apple Health) and exist to prevent generic, template-looking interfaces. These directives govern presentation only. They never authorize changes to backend contracts, data models, or synchronization logic.

#### 3.2.1 Frontend Baseline

* **Framework:** Next.js 14 (App Router), React 18, TypeScript in strict mode.
* **Component library:** Konsta UI v4 (`konsta/react`) with `theme="ios"`, wired through `konstaConfig` in `tailwind.config.js`. Do not re-implement components that Konsta already provides (navbar, tabbar, list, sheet, segmented control, dialog).
* **Icons:** `@phosphor-icons/react`, regular weight, as the only icon family. Icons MUST NOT be wrapped in colored boxes.
* **Dates:** `date-fns` with the `es` locale.
* **Styling:** Tailwind CSS 3.4 using only the design tokens defined in 3.2.3 and 3.2.4.

#### 3.2.2 Prohibited Patterns

The following patterns are strictly prohibited:

1. **Floating shadow cards:** Do not use `shadow-md`, `shadow-lg`, or larger shadows, and do not use colored left-border accents on rows. Grouped items MUST use inset lists (`<List strong inset>`).
2. **Pill clutter:** Do not place multi-colored badges or pills on rows. Source attribution (Moodle versus Classroom) MUST use an 8px dot or subtle secondary text (for example, `Moodle · Grupo B`).
3. **Dashboard metrics on task feeds:** Do not render summary metric rows (average, course count, completion percentage) on mobile task list screens. A single concise subtitle under the large title (for example, "2 entregas pendientes") is sufficient.
4. **Fake status bars:** Never draw a custom status bar (time, battery, signal). Layout containers MUST use Konsta `safeAreas` and `viewportFit: "cover"`.
5. **Per-row action buttons:** Each list row is a single tap target with a chevron that opens a dedicated detail sheet (`TaskDetailSheet`). Do not place separate action buttons on rows.
6. **Unverifiable upload promises:** Assignment detail sheets MUST NOT offer file upload controls the platform cannot fulfil. Use verified deep links instead ("Abrir en Moodle", "Abrir en Classroom").

#### 3.2.3 Color Semantics and Design Tokens

Colors MUST come from the tokens below, exposed through the Tailwind theme (`primary`, `urgent`) or the iOS surface palette. Off-palette hex literals in components are prohibited.

| Role | Light mode | Dark mode | Rule |
| :--- | :--- | :--- | :--- |
| Grouped background | `#F2F2F7` | `#000000` | Full-screen container background. |
| Surfaces / inset cells | `#FFFFFF` | `#1C1C1E` | List item background. |
| Hairline dividers | `rgba(60,60,67,0.29)` | `rgba(84,84,88,0.65)` | Inset list separators. |
| Primary text | `#000000` | `#FFFFFF` | Titles, headlines, active labels. |
| Secondary text | `rgba(60,60,67,0.6)` | `rgba(235,235,245,0.6)` | Subtitles, course metadata, relative timestamps. |
| App tint (`primary`) | `#8B0000` | `#E5575B` | Interactive tint only: buttons, active tabs, focus rings. Never a solid background on large headers. |
| Urgent (`urgent`) | `#FF3B30` | `#FF453A` | Reserved strictly for deadlines due in less than 24 hours. Never for branding or source markers. |

Light and dark mode MUST both be supported. The interface follows the system color scheme.

#### 3.2.4 Typography

* **Font stack:** `-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", system-ui, sans-serif`. Importing web fonts (Inter, Roboto, or any Google Font) is prohibited.
* **Scale:**
  * Large Title: 34px, bold.
  * Section title (`BlockTitle`): 22px, semibold.
  * Headline (row title): 17px, semibold.
  * Body: 17px, regular.
  * Subheadline (row subtitle): 15px, regular, secondary color.
  * Footnote: 13px, regular, secondary color.

#### 3.2.5 Navigation Architecture

* **Tab limit:** Three to four tabs. The standard structure is `Hoy`, `Calendario`, `Ajustes`.
* **Tab bar:** Translucent with background blur, Phosphor icons, and persistent text labels.
* **Primary screens:** Use a large collapsing title.
* **WhatsApp location:** WhatsApp MUST NOT be a top-level tab. It lives in `Ajustes` as a service row ("Asistente de WhatsApp") that presents the pairing sheet.

#### 3.2.6 Authentication and Pairing Patterns

* **Google sign-in button:** Follow the official Google Identity branding: neutral white or dark surface, subtle `#DADCE0` border, official colored "G" logo on the left, neutral text. No crimson borders or colored backgrounds.
* **Manual credentials:** Presented as a text link ("Usar C.I. y contraseña UNSA") that navigates to an input list. Accordions are prohibited.
* **WhatsApp pairing sheet (`Sheet`):**
  * Top grabber and an iOS navigation bar ("Cancelar" on the left, centered title). No circular close button.
  * Six-digit input with `inputMode="numeric"`, `autoComplete="one-time-code"`, `maxLength={6}`, and automatic submission on the sixth digit.
  * The expiration time is displayed **once**, as footnote text. Circular progress rings and duplicated timers are prohibited. The countdown MUST derive from the server-issued expiry (the 300-second Redis TTL in rule 3), never from a hard-coded client constant.
  * The bot number is shown formatted (`+51 954 123 456`) with a direct deep link.
  * The sheet implements exactly one pairing direction, the one supported by the backend. Do not present both "send the code to the bot" and "enter the code here" at once.

#### 3.2.7 Mandatory UI States

Every data-driven view MUST implement and test these six states:

1. **Loading:** Row-shaped skeletons. Never a full-screen blocking spinner.
2. **Empty:** Centered secondary text (for example, "Nada pendiente. Disfruta tu día.").
3. **Offline:** Non-blocking top banner ("Sin conexión · mostrando datos guardados") that preserves locally cached data.
4. **Expired session:** Inline actionable banner ("Sesión de Moodle vencida · Reconectar") that does not disable Google Classroom content.
5. **Sync error:** Concise banner with a "Reintentar" action. Previously loaded data MUST remain visible.
6. **Long content:** Systematic truncation (`line-clamp-2` for headlines, ellipsis elsewhere).

#### 3.2.8 Localization of User-Facing Copy

User-facing interface text is Spanish (`es-PE`) product content and is the sole exception to the English-only policy in rule 2. Identifiers, comments, test names, commit messages, and documentation prose remain English. Interface strings SHOULD be centralized in a message catalog and referenced by key rather than scattered across components.

#### 3.2.9 Accessibility Floor

* Minimum touch target of 44px for interactive rows and controls.
* Text and tint colors MUST meet WCAG AA contrast (4.5:1 for body text) in both color schemes.
* Dark mode parity is mandatory: no screen ships with light-only styling.

#### 3.2.10 Verification and Evidence

* `node scripts/verify-ui-directives.mjs` MUST pass. It is invoked by `./scripts/verify.sh` and `./scripts/verify.ps1` and by CI.
* Design contract tests (Vitest and React Testing Library) MUST cover the six states in 3.2.7, the pairing sheet input attributes, and the tab structure in 3.2.5.
* Any Pull Request that changes rendered UI MUST include a completed `UI Directives Compliance` section and before/after screenshots in both light and dark mode, in addition to the evidence required by section 3.1 item 4.
* A line may opt out of a static rule only with a trailing `// ui-gate-ignore: <reason>` comment. Unexplained opt-outs are rejected in review.


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

# Run the static UI directives gate
node scripts/verify-ui-directives.mjs
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
   * Every user story or task must be implemented on its own branch following these approved patterns:
     * Feature branches: `feature/XX-short-name-in-kebab-case` (where `XX` is the issue number, e.g., `feature/02-institutional-google-oauth`).
     * Bugfix branches: `fix/XX-short-name-in-kebab-case` (e.g., `fix/15-dutic-session-timeout`).
     * Documentation branches: `docs/short-name-in-kebab-case` (e.g., `docs/wiki-onboarding-guides`).
     * Maintenance branches: `chore/short-name-in-kebab-case` (e.g., `chore/dependency-updates`).
     * Automated bot branches: `dependabot/**` (managed autonomously by Dependabot).

2. **Commit Convention (Conventional Commits):**
   * Structure: `<type>(<scope>): <concise description in lowercase>`
   * Valid types: `feat`, `fix`, `test`, `docs`, `refactor`, `perf`, `ci`, `chore`.
   * Semantic Rule: Always choose `<type>` according to the nature of the change (never default to `feat` for documentation, fixes, or chores):
     * `feat`: New user stories, services, or business logic.
     * `docs`: Documentation, markdown artifacts, or wiki updates without code logic changes.
     * `fix`: Bug or defect corrections.
     * `test`: Unit, integration, or load test suites.
     * `refactor`: Code restructuring without functional behavior modification.
     * `perf`: Performance, throughput, or latency enhancements.
     * `ci`: GitHub Actions workflows or pipeline automation.
     * `chore`: Dependencies, tool configuration, or housekeeping.
   * Examples:
     * `feat(auth): validate institutional unsa email domain`
     * `docs(wiki): establish initial oppia-caliber knowledge base`
     * `test(auth): add unit test for unauthorized external domain rejection`

3. **Pull Requests, Hygiene Gates, and Squash Merges:**
   * **Issue Linking:** Human and agent PRs must reference their corresponding issue in the description: `Closes #X` or `Resolves #X`. Automated bot PRs (e.g., Dependabot) are exempt.
   * **PR Title Format:** All PR titles must follow Conventional Commits matching the primary scope of the PR.
   * **Mandatory Squash Merge:** Merging into `main` must strictly be performed via **Squash Merge** to maintain a clean, atomic git log. Never create merge bubble commits.
   * **Automated Dependency PRs (Dependabot):** Dependencies are grouped automatically (backend, frontend, actions) and restricted to non-breaking minor and patch updates (`ignore semver-major`). If a dependency PR is green, approve and squash merge. Major framework upgrades (e.g. Next.js 14 to 15/16) must never be executed via blind bot PRs; they require dedicated agile spike issues.
   * **Continuous CI Verification:** All GitHub Actions checks (`ci.yml`, `pr-hygiene.yml`, `codeql.yml`, `dependency-review.yml`) must pass green before merge.
   * **UI Evidence Gate:** Pull Requests that change rendered UI under `frontend/` must contain a fully checked `UI Directives Compliance` section and at least one screenshot, covering light and dark mode.

4. **Continuous Documentation Directive (Oppia-Caliber Wiki Gate):**
   * Whenever an issue or user story is resolved and closed (`Closes #X`), the AI agent or developer MUST execute the `campusunsa-wiki-orchestrator` skill (`python scripts/wiki_engine.py --issue X`).
   * The skill analyzes the code delta, updates or creates the assigned Oppia-caliber wiki page with Mermaid sequence diagrams, refreshes `_Sidebar.md`, and validates quality gates (`python scripts/wiki_validator.py`).
   * For newly introduced agile user stories, the skill's dynamic inference engine automatically maps the feature into the appropriate architectural category.
   * Pull Requests must include evidence that the wiki documentation was synchronized and validated.

---

## 6. Repository Documentation Map

Before assuming requirements or designing contracts, consult formal documents in `docs/`:

* **Software Requirements Specification (SRS):** [docs/requirements/software-requirements-specification.md](docs/requirements/software-requirements-specification.md)
* **System Architecture Document (SAD):** [docs/architecture/system-architecture.md](docs/architecture/system-architecture.md)
* **Agile Sprint Plan & Team Matrix:** [docs/planning/agile-sprint-plan.md](docs/planning/agile-sprint-plan.md)
* **Agentic Engineering Standard:** [docs/planning/agentic-engineering-standard.md](docs/planning/agentic-engineering-standard.md)
* **Contribution Guidelines:** [CONTRIBUTING.md](CONTRIBUTING.md)
* **iOS Design System:** [docs/design/ios-design-system.md](docs/design/ios-design-system.md)
