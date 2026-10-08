# Google Antigravity (AGY CLI) & Gemini Guidelines — CampusUNSA

All engineering directives, architecture, test commands, and quality gates for CampusUNSA are centralized in `AGENTS.md`.
Read and strictly obey `AGENTS.md` before executing any task or generating code in this workspace.

## Inviolable Rules
1. Zero Emojis: Strictly prohibited in code, comments, documentation, commit messages, and PRs.
2. English Only: All repository artifacts (code, docstrings, comments, docs, commits, PRs) MUST be written in English, regardless of the chat conversation language.
3. Google OAuth: Only `@unsa.edu.pe` domain allowed (reject external domains with HTTP 403 `DOMAIN_NOT_ALLOWED`).
4. TDD First: Write tests in `backend/tests/` or `frontend/src/` before implementing business logic (coverage >= 80%).
5. Conventional Commits: `<type>(<scope>): <description>` without emojis.
6. No Force Flags: Never execute `git push --force`, `--force-with-lease`, or rewrite published Git history.
7. Verification Oracle: Run `./scripts/verify.ps1` (Windows) or `./scripts/verify.sh` (Linux/macOS) to validate all quality gates before finishing.
