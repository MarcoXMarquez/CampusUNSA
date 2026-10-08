<!--
CampusUNSA Pull Request Template

Required PR Title Convention:
<type>(<scope>): <concise description in lowercase>
Examples:
  feat(auth): validate institutional unsa email domain
  test(auth): add unit test for unauthorized external domain rejection
  fix(docker): resolve container networking port mapping
-->

Closes #<!-- Specify issue number here, e.g., 2 -->

## What Problem This Solves

<!--
Describe the concrete academic, architectural, or user problem addressed.
Use one to two clear, concise sentences in English.
-->

## User Impact

<!--
What can students, secretaries, or developers now do or expect?
Describe the concrete outcome. If this change is purely internal infrastructure, state:
"Internal developer workflow and infrastructure change; zero user-facing impact."
-->

## Why This Change Was Made

<!--
Explain the technical rationale, design trade-offs, and architectural alignment.
Reference specific modules (FastAPI, Next.js, PostgreSQL, Redis, Evolution API) if applicable.
-->

## Evidence

<!--
MANDATORY: Provide empirical proof that this change is functional and fully verified.
Paste terminal outputs, test coverage summaries, or embed UI screenshots below.
-->

```text
<!-- Paste output from ./scripts/verify.ps1 or ./scripts/verify.sh here -->
```

### Verification Checklist
- [ ] Verification oracle executed cleanly: `./scripts/verify.ps1` or `./scripts/verify.sh`
- [ ] Backend test suite passing with >= 80% coverage (Pytest)
- [ ] Frontend component tests passing with zero errors (Vitest)
- [ ] Zero Emojis policy strictly respected across all files and commit messages
- [ ] English Language policy strictly followed in code, comments, and documentation
- [ ] UI visual changes validated with before/after screenshots (if applicable)

## Assigned Reviewer

- Lead Developer: @<!-- Github handle -->
- Peer Reviewer: @<!-- Github handle -->
