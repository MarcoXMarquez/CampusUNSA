# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Planned
- Visual Academic Task Board with urgency traffic lights (US-05).
- Dynamic weekly class schedule and next class widget (US-06).
- Progressive Web Application (PWA) offline service worker caching (US-07).

---

## [0.3.0] - 2026-10-27

### Added
- Structured NLP task extraction endpoint `POST /api/v1/nlp/parse-task` supporting Gemini and Ollama providers with deterministic regex fallback ([#47](https://github.com/MarcoXMarquez/CampusUNSA/pull/47), closes [#10](https://github.com/MarcoXMarquez/CampusUNSA/issues/10)).
- Continuous automated load testing harness and concurrency gate (TECH-02 / CR-01) validating 1,000 active student sessions under 50 spawns/s ([#48](https://github.com/MarcoXMarquez/CampusUNSA/pull/48), closes [#42](https://github.com/MarcoXMarquez/CampusUNSA/issues/42)).
- Starlette ASGI admission semaphore middleware (`RequestCapacityMiddleware`) bounding synchronous database queries below pool capacity.
- Disposable isolated performance environment stack in `docker-compose.perf.yml` with RAM-backed PostgreSQL (tmpfs) and least-connections NGINX gateway.
- Comprehensive load testing documentation and reproduction procedures in `docs/testing/continuous-load-testing.md`.

### Changed
- Unified verification oracle (`scripts/verify.sh` and `scripts/verify.ps1`) updated to enforce continuous performance gates alongside unit test suites.
- GitHub Actions CI pipeline updated with mandatory `performance-ci` job retaining 14-day performance artifacts.

---

## [0.2.0] - 2026-10-21

### Added
- Institutional Google OAuth authentication lifecycle restricted strictly to verified `@unsa.edu.pe` email domains (closes [#2](https://github.com/MarcoXMarquez/CampusUNSA/issues/2)).
- Immediate rejection with `HTTP 403 Forbidden` and error code `DOMAIN_NOT_ALLOWED` for external domain login attempts.
- Role-Based Access Control (RBAC) security dependencies and middleware enforcing student, professor, and administrative staff policies (closes [#3](https://github.com/MarcoXMarquez/CampusUNSA/issues/3)).
- Unit test suite achieving 100% branch coverage across authorization dependencies.

---

## [0.1.0] - 2026-10-14

### Added
- Fully reproducible containerized development environment orchestrating FastAPI, Next.js 14, PostgreSQL 16, Redis 7, and Evolution API (closes [#1](https://github.com/MarcoXMarquez/CampusUNSA/issues/1)).
- Cross-platform verification oracle scripts (`./scripts/verify.sh` and `./scripts/verify.ps1`).
- GitHub Actions Continuous Integration pipeline executing Ruff linter, Pytest coverage (>= 80%), Alembic database migrations, Vitest, and TypeScript type checks.
- Baseline software engineering standards, Software Requirements Specification (SRS), System Architecture Document (SAD), and Agile Sprint Plan.
