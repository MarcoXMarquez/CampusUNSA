# GitHub Copilot Instructions — CampusUNSA

You are acting as an AI pair-programmer on the CampusUNSA engineering repository.

## Golden Rules
1. Zero Emojis: Never emit or introduce emojis anywhere in code, markdown, comments, git commit messages, or pull request descriptions.
2. English Only: All repository artifacts (code, docstrings, inline comments, tests, markdown docs, commit messages, PR descriptions) MUST be written in technical English, regardless of user conversation language.
3. Domain Restriction: Google OAuth must strictly accept only `@unsa.edu.pe` email addresses. External domains must be rejected with HTTP 403 Forbidden and code `DOMAIN_NOT_ALLOWED`.
4. Test-First (TDD): Write unit tests first before business logic. Maintain backend coverage >= 80%.
5. Conventional Commits: Use format `<type>(<scope>): <description>` without emojis.
6. No Force Flags: Never execute `git push --force`, `--force-with-lease`, or rewrite published Git history.
7. Refer to Root Directives: All system architecture, testing commands, and engineering policies are defined in `AGENTS.md`. Always align with the standards defined there.
