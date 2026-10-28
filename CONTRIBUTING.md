# Contributing to CampusUNSA

Thank you for contributing to CampusUNSA. This document establishes the engineering standards, branching conventions, and quality gates required for all team contributions.

---

## 1. Git Workflow & Branching Strategy

All active work originates from and merges back into the `main` branch via Pull Requests:

* **Production & Demo Branch:** `main` (Protected. Requires passing CI and at least one peer approval).
* **Feature Branches:** `feature/<issue-number>-<short-description>` (e.g., `feature/02-google-oauth-login`).
* **Bugfix Branches:** `fix/<issue-number>-<short-description>` (e.g., `fix/08-otp-expiration-ttl`).
* **Documentation Branches:** `docs/<topic>` (e.g., `docs/architecture-c4-diagrams`).

---

## 2. Commit Message Conventions (Conventional Commits)

Commit messages must follow the [Conventional Commits v1.0.0](https://www.conventionalcommits.org/) standard:

```
<type>(<optional scope>): <description in imperative mood>

[optional body]

[optional footer(s)]
```

### Approved Types
* `feat`: A new user-facing capability or API endpoint.
* `fix`: A bug fix or patch.
* `test`: Adding or refactoring automated tests (Pytest, Vitest).
* `docs`: Documentation additions or revisions.
* `refactor`: Code changes that neither fix a bug nor add a feature.
* `perf`: Performance optimizations or cache tuning.
* `chore`: Build tooling, dependency upgrades, or Docker adjustments.

### Examples
* `feat(auth): implement Google OAuth domain validation for @unsa.edu.pe`
* `test(nlp): add 20 test fixtures for informal Spanish task parser`
* `fix(otp): prevent redis key collision on concurrent phone requests`

---

## 3. Test-Driven Development (TDD) Workflow

For core domain logic (NLP parsing, schedule calculation, token verification, and RBAC guards), developers must follow the Red-Green-Refactor cycle:

1. **Red (Test First):** Write a failing unit test in `tests/` specifying the expected behavior before writing functional code.
2. **Green (Minimal Implementation):** Implement the simplest functional logic to make the test pass.
3. **Refactor:** Clean up code, remove duplication, and enforce strict type annotations (Pydantic / TypeScript) while ensuring the test suite remains green.

---

## 4. Code Quality & Formatting

Before opening a Pull Request, run the automated linting checks:

### Backend (Python 3.11 / FastAPI)
```bash
# Format code
black app tests

# Run linter
ruff check app tests

# Run test suite with coverage
pytest --cov=app --cov-report=term-missing
```

### Frontend (Next.js 14 / TypeScript)
```bash
# Run ESLint
npm run lint

# Run Vitest component tests
npm run test
```

---

## 5. Pull Request & Review Checklist

Every Pull Request must satisfy our automated quality and hygiene gates:
* **Issue Linking:** Human PRs must reference their corresponding GitHub Issue: `Closes #<issue-number>`, `Resolves #<issue-number>`, or `Fixes #<issue-number>` (automated bot PRs like Dependabot are exempt).
* **PR Title Format:** Follow Conventional Commits matching the primary scope of work (e.g., `feat(auth): ...`, `chore(deps): ...`).
* **Mandatory Squash Merge:** All pull requests merged into `main` must strictly use **Squash Merge** to maintain an atomic, clean Git history.
* **Code Review:** Code must be reviewed and approved by the assigned Peer Reviewer before merging.
* **Zero Merge Conflicts:** Keep branches rebased cleanly on `main`.
* **Green CI Gates:** GitHub Actions pipelines (`ci.yml`, `pr-hygiene.yml`, `codeql.yml`, `dependency-review.yml`) must report green checkmarks.
