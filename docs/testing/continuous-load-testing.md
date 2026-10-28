# TECH-02: Continuous Load and Concurrency Gate

Implements [issue #42](https://github.com/MarcoXMarquez/CampusUNSA/issues/42) and [CR-01](../planning/change-request-cr01-continuous-load-testing.md). The gate runs locally from both verification oracles and in the required `Performance CI (1,000 Users)` job.

## Workload and acceptance contract

The benchmark provisions exactly 1,000 distinct active institutional student accounts, plus one QA secretary for the authorized queue scenario. Each Locust session has its own student JWT. Student requests to the staff queue must return the existing `403 INSUFFICIENT_PERMISSIONS`; the separate secretary scenario must successfully read real seeded tickets.

| Parameter | Gate profile |
| --- | --- |
| Virtual student sessions | 1,000, including 1,000 distinct identities observed making requests |
| Spawn rate | 50 sessions per second |
| Measurement | At least 60 seconds after the complete population is spawned |
| Pacing | One request every 5 seconds per session, approximately 200 requests/second at full population |
| Route mix | Round-robin across every registered scenario; different starting offsets distribute requests |
| Minimum samples | 500 measured requests per scenario |
| Median | Strictly below 100 ms for every scenario |
| 95th percentile | Strictly below 300 ms for every scenario |
| Unexpected responses or transport errors | Exactly zero |
| API cgroup peak memory | Sum of four replica peaks at most 512 MiB; 128 MiB hard limit per replica |
| PostgreSQL | `max_connections=100`, sampled total connections at most 100 |

Concurrency describes active virtual sessions. Pacing is part of the workload model: this profile does not claim 1,000 simultaneous database connections or unlimited throughput. Earlier exploratory two-second-pacing runs, approximately 500 requests/second, exceeded latency limits with the original shared-socket worker layout and were rejected. Maximum throughput of the final balanced topology has not been established; its gate validates the explicit five-second navigation profile.

Locust normally counts runtime from the beginning of the ramp. This harness instead resets request statistics after spawning, measures a full 60 seconds with 1,000 users, and then stops. Its 120-second CLI runtime is only a fail-safe deadline. Incomplete spawning, a short measurement, missing routes, insufficient samples, user-task errors, invalid numeric metrics, or load-generator CPU saturation fail closed.

Percentiles use linear interpolation over original end-to-end request times captured through Locust's request events. Raw samples are preserved for auditing. Locust CSV/HTML charts use rounded histogram buckets, so a displayed 100 ms bucket can differ from the precise JSON median. Strict limits apply to the unrounded JSON values. Test-only processing headers provide separate diagnostics and never replace the client latency gate.

## Isolation and security

`docker-compose.perf.yml` is a standalone Compose file, not a developer-stack override. Every invocation gets a generated `campusunsa-perf-<id>` project, an internal network, a temporary PostgreSQL data directory, Redis without persistence, and an ephemeral identity volume. No service publishes a host port.

The seeder and fixture entrypoint refuse to run unless the performance environment and exact isolated database/cache hosts match. The seeder also rejects a nonempty database. JWTs use a performance-only key and are kept in the temporary identity volume, not the Git repository or uploaded artifacts. Cleanup removes only the invocation's generated project and volume; it never prunes Docker or modifies the development database.

The performance API runs the actual FastAPI application, JWT checks, role policies, Pydantic responses, SQLAlchemy queries, migrations, and Redis health check. Only outbound Google and Moodle HTTP responses are deterministic fixtures. The internal network prevents calls to actual university or Google systems. This gate measures CampusUNSA processing against controlled providers, not Internet latency, Google token verification availability, or live Moodle quotas.

The fixture app is `tests.load.perf_app:app`; production imports `app.main:app` and cannot enable synthetic tokens or the delay hook through a production setting. Synthetic data includes profiles, two courses and assignments per student, and 20 active tickets. Upstream sync fixtures return one existing course per provider and no new assignments; full-scale upstream datasets remain a separate integration benchmark.

## Runtime and connection-pool fix

The performance profile uses four single-process Uvicorn replicas without development reload, a 15-second keep-alive timeout, and 128 MiB per replica, for a combined 512 MiB API budget. NGINX distributes requests using least-connections balancing and does not retry failed upstream requests. API replicas, gateway and Locust have file-descriptor limits of 8,192 to accommodate 1,000 persistent sessions plus overhead. All replicas must announce readiness before load begins. The API executes source packaged into the image, avoiding Windows-mounted source overhead. The default developer Compose startup remains a development server; results apply to this explicit benchmark runtime.

The first real run reproduced SQLAlchemy `QueuePool` exhaustion with timeouts. Synchronous authentication dependencies could hold connections while waiting for thread-pool endpoint work, as other dependency calls occupied worker threads waiting for a connection. `RequestCapacityMiddleware` now queues excess HTTP work asynchronously before dependency execution, admitting at most five requests per process below the existing 30-connection pool and 40-thread limits. It releases admission on success, failure, or cancellation and leaves non-HTTP ASGI scopes intact.

With four replicas, request admission bounds simultaneous database work to 20 requests, leaving PostgreSQL headroom for the independent observer and administrative connections. This is bounded admission with queued clients, not expanded database limits or skipped authorization. Initial shared-socket workers received uneven traffic, including approximately 67% on one worker and less than 2% on another; request-level balancing addresses that observed imbalance.

The host reads each API replica's actual cgroup peak after the test and sums the peaks conservatively. It also checks that no replica was OOM-killed or restarted. The observer samples total PostgreSQL connections once per second. The API memory budget excludes the load generator, observer, gateway, PostgreSQL and Redis; those components are separate infrastructure, not hidden API processes.

The observer updates a heartbeat only after a successful database sample. Its explicit healthcheck requires that heartbeat to be less than five seconds old. This supports Compose versions that require a configured healthcheck for every service used with `up --wait`, and prevents starting the load before resource collection is operational.

## Running locally

Requirements: Docker Engine with Compose v2, Python 3.10 or newer for the standard-library host runner, and enough host CPU/memory to run the benchmark. Docker downloads Locust, NGINX and database/cache images on first use; the application uses Python 3.11 inside its image. All commands start at the repository root.

```bash
# Isolated load gate only; reports default to perf-results/<run-id>/.
python3 scripts/run_load_tests.py

# Full local verification, including the mandatory load stage.
bash scripts/verify.sh
```

```powershell
# Native Windows with Docker CLI and Python on PATH.
python scripts/run_load_tests.py
./scripts/verify.ps1
```

On Windows installations with Docker only inside WSL, execute the Bash command from the WSL checkout path. Native PowerShell does not automatically translate Windows Docker CLI access into WSL access.

An explicit artifact directory is supported:

```bash
python3 scripts/run_load_tests.py --output perf-results/manual
```

Do not run two invocations against the same output directory. Separate project IDs isolate their containers, while distinct output directories prevent report collisions.

## Proving regression rejection

The fixture-only delay is applied to the real authenticated profile endpoint before its response. A 400 ms delay must violate the latency gate:

```bash
python3 scripts/run_load_tests.py --delay-ms 400 --output perf-results/negative
echo "$?"  # Expected nonzero, with a profile latency threshold violation.

# Exercise propagation through the complete Bash oracle.
PERF_DELAY_MS=400 bash scripts/verify.sh
```

```powershell
$env:PERF_DELAY_MS = "400"
./scripts/verify.ps1
$LASTEXITCODE # Expected nonzero.
Remove-Item Env:PERF_DELAY_MS
```

Boundary unit tests separately prove that p50 exactly 100 ms, p95 exactly 300 ms, one failure, insufficient population or duration, missing evidence, and resource violations cannot pass. Shell contract tests exercise each actual oracle with controlled command results to verify exit-code propagation; those tests do not claim to be real load runs.

## Evidence and CI

Each invocation preserves:

- `summary.json`: final verdict, violations, population, timing, per-scenario metrics, resource peaks, and sampling count.
- `report.json`: raw structured Locust evidence.
- `latency_samples.json`: original end-to-end request times used for exact percentiles.
- `memory.json`: individual replica cgroup peaks and their conservative combined bound.
- `load_stats.csv`, history and failure CSV files, and `report.html`.
- `resources.jsonl`: total PostgreSQL connection samples; the evaluator combines them with the measured API memory bound.
- `orchestration.log`: image/build output, seeding, Locust output, backend logs, and cleanup.

`perf-results/` is ignored by Git. CI uploads evidence even on failure and retains it for 14 days. The existing `Backend CI (Pytest & Linters)` check name is preserved as a final aggregate that requires both backend unit tests and the performance job to succeed. It runs even when a dependency fails or is skipped, and explicitly fails for either condition, so an existing required backend check cannot silently ignore the performance result. Repository administrators may additionally require the named performance check; repository administration settings are not modified.

## Maintaining endpoint coverage

`backend/tests/load/scenarios.py` is the route registry. `test_all_business_routes_are_registered` compares it to the actual OpenAPI business routes. Every new business route must add a suitable authenticated scenario, request payload, and response checks before its PR can pass. Documentation/schema endpoints are outside this business-route registry.

When adding external integrations, extend the fixture HTTP adapter with representative controlled responses, keep real JWT/role/database boundaries, and record the provider-latency exclusion. Expanding datasets, changing pacing, worker counts, or SLOs changes the benchmark contract and must be reviewed explicitly.

The independent US-10 PR adds `/api/v1/nlp/parse-task`. Its known scenario activates when that source module is present, supporting either merge order without copying US-10 into this branch. The performance environment explicitly disables external inference and tests its deterministic extraction path; live LLM inference latency is outside this controlled-provider gate.

Implementation references: [Locust headless execution and exit codes](https://docs.locust.io/en/stable/running-without-web-ui.html), [Locust events and API](https://docs.locust.io/en/stable/api.html), and [NGINX upstream balancing](https://nginx.org/en/docs/http/ngx_http_upstream_module.html).
