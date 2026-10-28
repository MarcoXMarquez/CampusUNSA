"""1,000 real HTTP sessions, 50 spawns/s, then 60 seconds at full population."""

import itertools
import json
import random
import statistics
import time
from pathlib import Path

import gevent
from locust import FastHttpUser, constant_pacing, events, task
from locust.env import Environment

from tests.load.scenarios import SCENARIOS
from tests.load.gate import percentile

dataset = json.loads(Path("/load-data/users.json").read_text())
students = iter(enumerate(dataset["students"]))
started: float | None = None
errors = 0
visited_students: set[str] = set()
server_timings: dict[str, list[float]] = {}
worker_requests: dict[str, int] = {}
raw_latencies: dict[str, list[float]] = {}
current_environment: Environment | None = None


@events.init.add_listener
def initialize(environment: Environment, **kwargs: object) -> None:
    global current_environment
    current_environment = environment
    if len(dataset["students"]) != 1000:
        raise RuntimeError("Exactly 1,000 synthetic student sessions are required")


@events.spawning_complete.add_listener
def full_population(user_count: int, **kwargs: object) -> None:
    global started
    if user_count == 1000 and started is None and current_environment:
        started = time.monotonic()
        gevent.spawn_later(60.1, current_environment.runner.quit)


@events.user_error.add_listener
def user_failed(**kwargs: object) -> None:
    global errors
    errors += 1


@events.request.add_listener
def capture_latency(name: str, response_time: float, **kwargs: object) -> None:
    if started is not None:
        raw_latencies.setdefault(name, []).append(response_time)


@events.test_stopping.add_listener
def write_report(environment: Environment, **kwargs: object) -> None:
    metrics = [
        {
            "name": entry.name,
            "count": entry.num_requests,
            "failures": entry.num_failures,
            "p50": percentile(raw_latencies.get(entry.name, []), 0.50),
            "p95": percentile(raw_latencies.get(entry.name, []), 0.95),
        }
        for entry in environment.stats.entries.values()
    ]
    report = {
        "users": environment.runner.user_count,
        "spawn_rate": environment.parsed_options.spawn_rate,
        "steady_seconds": time.monotonic() - started if started else 0,
        "user_errors": errors,
        "student_sessions": len(visited_students),
        "pacing_seconds": 5,
        "cpu_warning": environment.runner.cpu_warning_emitted,
        "metrics": metrics,
        "worker_requests": worker_requests,
        "server_p50_ms": {
            name: statistics.median(values) for name, values in server_timings.items()
        },
    }
    Path("/results/report.json").write_text(json.dumps(report, indent=2))
    Path("/results/latency_samples.json").write_text(json.dumps(raw_latencies))


class StudentBrowser(FastHttpUser):
    wait_time = constant_pacing(5)
    network_timeout = 10.0
    connection_timeout = 10.0

    def on_start(self) -> None:
        index, self.account = next(students)
        self.cases = itertools.cycle(
            SCENARIOS[index % len(SCENARIOS) :] + SCENARIOS[: index % len(SCENARIOS)]
        )
        gevent.sleep(random.uniform(0, 2))

    @task
    def browse(self) -> None:
        visited_students.add(self.account["identity"])
        case = next(self.cases)
        token = (
            dataset["staff_token"]
            if case.role == "secretary"
            else self.account["token"]
        )
        payload = None
        if case.path.endswith("/auth/google"):
            payload = {"token": self.account["identity"]}
        elif case.path.endswith("/classroom/sync"):
            payload = {"refresh_token": self.account["identity"]}
        elif case.path.endswith("/dutic/sync"):
            payload = {
                "moodle_session": self.account["identity"],
                "sesskey": "perf-fixture",
            }
        elif case.path.endswith("/nlp/parse-task"):
            payload = {
                "message": "submit report for SO 2030-01-01T18:00:00Z",
                "courses": ["SO"],
            }
        with self.client.request(
            case.method,
            case.path,
            name=case.name,
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
            catch_response=True,
        ) as response:
            timing = (
                response.headers.get("x-perf-processing-ms")
                if response.headers
                else None
            )
            if timing and started is not None:
                server_timings.setdefault(case.name, []).append(float(timing))
                worker = response.headers.get("x-perf-worker", "unknown")
                worker_requests[worker] = worker_requests.get(worker, 0) + 1
            if response.status_code != case.expected:
                response.failure(f"Unexpected HTTP status {response.status_code}")
                return
            try:
                body = response.json()
                if case.expected == 403:
                    assert body["detail"]["code"] == "INSUFFICIENT_PERMISSIONS"
                    response.success()
                elif case.path.endswith(("/courses", "/assignments", "/tickets/all")):
                    assert isinstance(body, list) and len(body) > 0
                elif case.path.endswith("/sync"):
                    assert (
                        body["status"] == "SYNCED" and body["synced_courses_count"] == 1
                    )
                elif case.path.endswith("/health"):
                    assert body["status"] == "healthy"
                elif case.path.endswith("/auth/me"):
                    assert body["email"] == self.account["identity"] + "@unsa.edu.pe"
                elif case.path.endswith("/auth/google"):
                    assert (
                        body["access_token"]
                        and body["user"]["email"]
                        == self.account["identity"] + "@unsa.edu.pe"
                    )
                elif case.path.endswith("/nlp/parse-task"):
                    assert body["status"] == "parsed" and body["task"]["course"] == "SO"
            except (AssertionError, KeyError, TypeError, ValueError):
                response.failure("Response contract violation")
