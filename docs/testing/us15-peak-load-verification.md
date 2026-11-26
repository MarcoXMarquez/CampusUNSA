# US-15: Five-Minute Peak Load Verification

Run the Sprint 8 student workload in the disposable benchmark stack.

```bash
python3 scripts/run_load_tests.py --profile peak --output perf-results/us15
```

The peak profile runs 1,000 distinct authenticated institutional test accounts at
50 spawns per second. Each session paces one request every five seconds.
Measurement begins after all 1,000 users have spawned and lasts at least 300
seconds. Locust reads the same routes used by the student views:

| Share | GET route | Workload |
| ---: | --- | --- |
| 40% | `/api/v1/courses/schedule/weekly` | Weekly schedule and next class at 07:45 Lima time |
| 20% | `/api/v1/classroom/assignments` | Synced Classroom assignments |
| 20% | `/api/v1/dutic/assignments` | Synced DUTIC assignments |
| 20% | `/api/v1/courses/assignments` | Unified assignments including manual tasks |

Every synthetic student has a course enrollment with two schedule blocks and
three assignment records. The workload exercises the production API logic,
including JWT verification, SQLAlchemy queries, and response serialization.
Docker keeps traffic inside a disposable network with its own PostgreSQL and
Redis instances.

## Acceptance and evidence

- p95 and p99 are both strictly below 500 ms on every route. The acceptance
  scenario specifies p95 and the user story also specifies p99.
- The combined HTTP and response-contract failure rate is strictly below 0.5%.
- At least 1,000 distinct students make requests during the measurement and the
  PostgreSQL observer records at least 270 independent samples in that window.
- The isolated database reports zero deadlocks, the backend logs show zero pool
  or server connection exhaustion errors, and the memory and connection bounds
  from the benchmark infrastructure are met.

Use `summary.json` for the verdict and exact percentiles, `resources.jsonl`
for activity and lock samples, and `orchestration.log` for setup and backend
logs. The CI performance job runs this profile after the standard CR-01 gate
and retains both output directories.

The workload reuses the established four-replica FastAPI topology, its bounded
request admission, PostgreSQL's 100-connection limit, and the existing Redis
configuration. Apply tuning only if the captured resource and latency data
identifies a bottleneck. The performance evidence describes the isolated
Docker configuration and synthetic dataset.

See [US-15](https://github.com/MarcoXMarquez/CampusUNSA/issues/15) and the
[continuous load gate](continuous-load-testing.md).
