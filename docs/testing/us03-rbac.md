# US-03: Role-Based Access Control Verification

Issue: [#3](https://github.com/MarcoXMarquez/CampusUNSA/issues/3).
Requirement: REQ-03. Planned lead: `rikich3`. Planned peer reviewer: `Sebastianzzzin`.

## Implementation scope

`has_role(["secretary", "admin"])` is a reusable FastAPI dependency in
`backend/app/api/dependencies.py`. Optional `Permission` flags allow a route to
require every requested bit in addition to its explicit role allowlist.
Empty policies, unknown roles in policies and unsupported permission bits fail
at startup. Unknown account roles are denied. No implicit admin bypass exists.

The dependency reuses the existing Bearer JWT validation and active-user lookup.
The persisted `User.role` is authoritative. A previously issued token cannot
retain staff access after the database role is revoked, and an elevated role
claim cannot upgrade a student account.

`GET /api/v1/tickets/all` requires a secretary or admin with
`READ_ALL_TICKETS`. It queries real ticket records with status `OPEN` or
`IN_REVIEW`, ordered by creation time and ID. Pagination defaults to 100 records
and accepts `limit` from 1 to 100 and a nonnegative `offset`.
Resolved and closed tickets are excluded. This route gives both staff roles
access to the shared queue as required by US-03. Faculty scoping, ticket creation,
transitions, notifications, audit events and secretarial UI remain US-13 work.

The initial ticket read model and Alembic migration follow the approved SAD
fields. The migration adds only the application's `tickets` table and indexes;
it does not alter Evolution API tables. Apply it with:

```bash
docker compose exec -T backend alembic upgrade head
docker compose exec -T backend alembic check
```

## Acceptance matrix

| Identity | Expected staff queue result |
| --- | --- |
| Active student | 403 INSUFFICIENT_PERMISSIONS |
| Active secretary | 200, active tickets only |
| Active admin | 200, active tickets only |
| Unknown or incorrectly cased role | 403 INSUFFICIENT_PERMISSIONS |
| Inactive account | 403 USER_INACTIVE |
| Missing, invalid, expired or incorrectly signed token | 401 |
| Missing subject, malformed UUID or deleted user | 401 |
| Student with elevated JWT role claim or query parameter | 403 |
| Revoked staff role with an unexpired token | 403 |

Tests include nonempty queues owned by a different student, exclusion of terminal
states, stable pagination, invalid pagination, explicit role combinations and
permission-mask enforcement. They do not stub the authorization function or
replace database users with hardcoded allow decisions.

## Reproducible checks

```bash
# Repository verification, including the global and RBAC-specific coverage gates.
bash scripts/verify.sh

# PostgreSQL integration in isolated, transaction-scoped test schemas.
# This development URL matches .env.example. Adjust it for custom local credentials.
docker compose exec -T \
  -e RBAC_TEST_DATABASE_URL=postgresql://postgres:postgres_dev_password@postgres:5432/campusunsa \
  backend python -m pytest tests/test_rbac.py -v \
  --cov=app.api.dependencies --cov=app.core.permissions \
  --cov-branch --cov-report=term-missing --cov-fail-under=90
```

Without `RBAC_TEST_DATABASE_URL`, database tests use an isolated in-memory SQLite
database. With that variable, each test creates a uniquely named PostgreSQL
schema inside an outer transaction. Session commits use savepoints; teardown
rolls back the entire schema and records. Existing application tables are never
dropped or modified by those tests. Use only a dedicated development/test server
with permission to create schemas.

CI checks global line/branch coverage >=80%, migration consistency on PostgreSQL
16 and authorization line/branch coverage >=90%. Both local verification scripts
also enforce the two coverage thresholds. The RBAC-specific run has its own
coverage report; it must not be presented as global application coverage.

## Development environment corrections

The Windows/WSL verification exposed two existing configuration defects:
Evolution API v2 expects `CACHE_REDIS_ENABLED` and `CACHE_REDIS_URI`, and the
unconstrained Vite peer dependency selected a different major version from
Vitest. Compose now uses the v2 cache variable names. Frontend tooling uses the
same Vite 5.4.21 version as Vitest, with a committed npm lockfile for reproducible
installs. No application UI changes are included.

Bash scripts and Git hooks use LF through `.gitattributes` so Windows checkouts
remain executable in WSL. The verification scripts also fail if Git cannot
inspect the changes, instead of reporting a false successful emoji scan.

## Review and attribution

Implementation and a subsequent technical self-review were requested by
`Sebastianzzzin` using an AI coding assistant. The planned assignments above are
preserved for traceability; no changes are attributed to `rikich3` without his
contribution. A self-review is not an independent peer approval. A different team
member must review the PR before merge. Passing RBAC tests does not certify the
entire application or close the previously identified US-02 authentication gaps.
