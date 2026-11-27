"""Exercise 1,000 distinct HTTP sessions at 50 spawns per second."""

import itertools
import json
import os
import uuid
import random
import statistics
import time
from pathlib import Path
from datetime import datetime, timedelta, timezone

import gevent
from locust import FastHttpUser, constant_pacing, events, task
from locust.env import Environment

from tests.load.scenarios import PEAK_SCENARIOS, SCENARIOS, STANDARD_STEADY_SECONDS
from tests.load.gate import percentile

dataset = json.loads(Path("/load-data/users.json").read_text())
students = iter(enumerate(dataset["students"]))
peak = os.environ.get("PERF_PROFILE") == "peak"
scenarios = PEAK_SCENARIOS if peak else SCENARIOS
started: float | None = None
started_at: float | None = None
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
    global started, started_at
    if user_count == 1000 and started is None and current_environment:
        if peak:
            visited_students.clear()
        started = time.monotonic()
        started_at = time.time()
        steady_duration = 300.1 if peak else STANDARD_STEADY_SECONDS
        gevent.spawn_later(steady_duration, current_environment.runner.quit)


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
            **({"p99": percentile(raw_latencies.get(entry.name, []), 0.99)} if peak else {}),
        }
        for entry in environment.stats.entries.values()
    ]
    report = {
        "users": environment.runner.user_count,
        "measurement_started_at": started_at,
        "measurement_ended_at": time.time(),
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
            scenarios[index % len(scenarios) :] + scenarios[: index % len(scenarios)]
        )
        self.ticket_review_started = False
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
        if case.role == "completion":
            token = dataset["completion_token"]
        ticket_id = {
            "GET": self.account["resolved_ticket_id"],
            "PATCH": self.account["review_ticket_id"],
            "DELETE": self.account["withdraw_ticket_id"],
        }.get(case.method, self.account["resolved_ticket_id"])
        lost_item = {
            "/api/v1/lost-found/{item_id}/photo": self.account["lost_open_item"],
            "/api/v1/lost-found/{item_id}/claims": self.account["lost_claimable_item"],
            "/api/v1/lost-found/{item_id}/claims/{claim_id}": self.account["lost_review_item"],
            "/api/v1/lost-found/{item_id}": self.account["lost_return_item"],
        }.get(case.path, "")
        request_path = case.path.format(
            item_id=lost_item,
            claim_id=self.account["lost_review_claim"],
            ticket_id=ticket_id,
            notice_id=self.account["notice_id"],
            assignment_id=dataset["completion_assignment_id"],
            source_id=dataset.get("completion_source_id", ""),
            course_code=dataset.get("completion_course_code", "1705275"),
            channel="whatsapp",
            token=dataset["calendar_token"],
        )
        headers = {"Authorization": f"Bearer {token}"}
        expected = case.expected
        payload = None
        if case.path == "/api/v1/tickets/all" and case.role == "secretary":
            request_path += "?limit=25"
        if case.path.endswith("/webhooks/whatsapp"):
            headers = {"apikey": os.environ["EVOLUTION_WEBHOOK_API_KEY"]} if case.expected == 200 else {}
            payload = {
                "event": "messages.upsert", "instance": "campusunsa",
                "data": {
                    "key": {
                        "id": uuid.uuid4().hex,
                        "remoteJid": f"{self.account['identity']}@s.whatsapp.net",
                        "fromMe": False,
                    },
                    "message": {"conversation": "Prepare the report"},
                },
            }
        elif case.path == "/api/v1/tickets":
            payload = {
                "request_id": str(uuid.uuid4()), "confirmed": True,
                "subject": "Synthetic faculty request", "description": "Synthetic load-test query.",
            }
        elif case.path == "/api/v1/tickets/{ticket_id}" and case.method == "PATCH":
            expected = 409 if self.ticket_review_started else 200
            payload = {"status": "IN_REVIEW"}
        elif case.path.endswith("/webhooks/telegram"):
            headers = {"X-Telegram-Bot-Api-Secret-Token": os.environ["TELEGRAM_WEBHOOK_SECRET"]}
            payload = {"update_id": 1}
        elif case.method == "POST" and case.path.endswith("/calendar/subscription"):
            payload = {"ends_on": (datetime.now(timezone.utc).date() + timedelta(days=30)).isoformat()}
        elif case.path.endswith("/completion"):
            payload = {"is_completed": True}
        elif case.path.endswith("/link"):
            payload = {
                "course_code": dataset.get("completion_course_code", "1705275"),
                "component_type": "UNICO",
                "group_code": "A",
            }
        elif case.path.endswith("/groups"):
            payload = {"theory_group": "A"}
        elif case.method == "PUT" and case.path.endswith("/schedule"):
            payload = {
                "theory_group": "A",
                "lab_group": "B",
                "blocks": [
                    {
                        "component_type": "TEORIA",
                        "group_code": "A",
                        "day_of_week": 1,
                        "start_time": "16:40",
                        "end_time": "18:30",
                        "room": "Aula 302",
                    },
                    {
                        "component_type": "LABORATORIO",
                        "group_code": "B",
                        "day_of_week": 3,
                        "start_time": "15:50",
                        "end_time": "17:30",
                        "room": "Lab 4",
                    },
                ],
            }
        elif case.path.endswith("/auth/google/classroom/callback"):
            payload = {"code": "perf-code-123"}
        elif case.path.endswith("/auth/google"):
            payload = {"token": self.account["identity"]}
        elif case.path.endswith("/auth/login"):
            payload = {
                "email": f"{self.account['identity']}@unsa.edu.pe",
                "password": "perfpassword123",
            }
        elif case.path.endswith("/classroom/sync"):
            payload = {"refresh_token": self.account["identity"]}
        elif case.path.endswith("/dutic/sync"):
            payload = {
                "moodle_session": self.account["identity"],
                "sesskey": "perf-fixture",
            }
        elif case.path.endswith("/dutic/ical/subscribe"):
            payload = {
                "calendar_url": "https://aulavirtual.unsa.edu.pe/2026B/calendar/export_execute.php?userid=1&authtoken=perf"
            }
        elif case.path.endswith("/dutic/ical/sync"):
            payload = {
                "calendar_url": "https://aulavirtual.unsa.edu.pe/2026B/calendar/export_execute.php?userid=1&authtoken=perf"
            }
        elif case.path.endswith("/auth/otp/generate"):
            payload = {"channel": "whatsapp"}
        elif case.path.endswith("/auth/otp/verify"):
            payload = {
                "channel": "whatsapp",
                "code": "000000",
                "identifier": "+51900000000",
            }
        elif case.method == "POST" and case.path.endswith("/courses/assignments"):
            payload = {
                "title": "Perf manual assignment",
                "course_code": dataset.get("completion_course_code", "1705275"),
                "component_type": "TEORIA",
                "priority": "ALTA",
            }
        elif case.path.endswith("/nlp/parse-task"):
            payload = {
                "message": "submit report for SO 2030-01-01T18:00:00Z",
                "courses": ["SO"],
            }
        elif case.path == "/api/v1/lost-found" and case.method == "POST":
            payload = {
                "title": "Synthetic blue item", "description": "A disposable test report",
                "location": "QA Engineering", "campus": "engineering", "found_on": "2026-01-01",
                "request_id": str(uuid.uuid4()), "photo_base64": dataset["lost_photo"],
            }
        elif case.path == "/api/v1/lost-found/{item_id}/photo":
            request_path += "?thumbnail=true"
        elif case.path == "/api/v1/lost-found/{item_id}/claims":
            payload = {"proof": "Synthetic claim proof"}
        elif case.path == "/api/v1/lost-found/{item_id}/claims/{claim_id}":
            payload = {"decision": "approved", "pickup": "Synthetic private handoff"}
        elif case.path == "/api/v1/lost-found/{item_id}":
            payload = {"status": "returned"}
        with self.client.request(
            case.method,
            request_path,
            name=case.name,
            params=(
                {"at": "2026-11-30T07:45:00-05:00"}
                if peak and case.path.endswith("/schedule/weekly")
                else None
            ),
            json=payload,
            headers=headers,
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
            if response.status_code != expected:
                response.failure(f"Unexpected HTTP status {response.status_code}")
                return
            if expected == 204:
                if response.content:
                    response.failure("Expected an empty response")
                return
            if case.path.endswith(".ics"):
                if not response.content.startswith(b"BEGIN:VCALENDAR\r\n"):
                    response.failure("Expected an iCalendar feed")
                return
            if case.path == "/api/v1/lost-found/{item_id}/photo":
                if not response.content.startswith(b"\xff\xd8") or response.headers.get("content-type") != "image/jpeg":
                    response.failure("Expected a JPEG thumbnail")
                return
            try:
                body = response.json()
                if case.path.endswith("/webhooks/whatsapp"):
                    if case.expected == 401:
                        assert body["detail"]["code"] == "INVALID_WEBHOOK_KEY"
                        response.success()
                    else:
                        assert body["status"] == "queued"
                elif case.path.endswith("/webhooks/telegram"):
                    assert body["ok"] is True
                elif case.path.endswith("/calendar/subscription"):
                    assert body["path"].startswith("/courses/calendar/") and body["path"].endswith(".ics")
                elif case.expected == 403:
                    assert body["detail"]["code"] == "INSUFFICIENT_PERMISSIONS"
                    response.success()
                elif case.path == "/api/v1/tickets":
                    assert body["status"] == "OPEN" and body["tracking_code"].startswith("TICK-")
                elif case.path == "/api/v1/tickets/{ticket_id}":
                    if expected == 409:
                        assert body["detail"]["code"] == "TICKET_INVALID_TRANSITION"
                        response.success()
                    else:
                        assert body["id"] == ticket_id
                        assert body["status"] == ("IN_REVIEW" if case.method == "PATCH" else "RESOLVED")
                        if case.method == "PATCH":
                            self.ticket_review_started = True
                elif case.path == "/api/v1/tickets/routing":
                    assert body["faculty"] == "QA Engineering"
                elif case.path == "/api/v1/tickets/mine":
                    assert isinstance(body, list) and any(row["id"] == self.account["resolved_ticket_id"] for row in body)
                elif case.path == "/api/v1/tickets/notifications":
                    assert isinstance(body, list) and all(row["id"] == self.account["notice_id"] for row in body)
                elif case.path == "/api/v1/lost-found":
                    if case.method == "GET":
                        assert isinstance(body, list) and body and "reporter_id" not in body[0]
                    else:
                        assert body["status"] == "open" and "reporter_id" not in body
                elif case.path == "/api/v1/lost-found/claims":
                    assert isinstance(body, list) and body and all("proof" in row for row in body)
                elif case.path == "/api/v1/lost-found/{item_id}/claims":
                    assert body["status"] == "pending" and body["pickup"] is None
                elif case.path == "/api/v1/lost-found/{item_id}/claims/{claim_id}":
                    assert body["status"] == "approved" and body["is_reporter"] is True
                elif case.path == "/api/v1/lost-found/{item_id}":
                    assert body["status"] == "returned"
                elif case.path.endswith("/completion"):
                    assert body["is_completed"] is True
                    assert body["id"] == dataset["completion_assignment_id"]
                elif case.path.endswith("/link"):
                    assert body["mapping_status"] == "LINKED"
                elif case.path.endswith("/groups"):
                    assert body["theory_group"] == "A"
                elif case.path.endswith("/schedule/next-class"):
                    assert "status" in body
                elif case.path.endswith("/schedule/weekly"):
                    assert isinstance(body.get("days"), list) and len(body["days"]) == 7
                    if peak:
                        assert sum(len(day["sessions"]) for day in body["days"]) == 2
                elif case.method == "GET" and case.path.endswith("/schedule"):
                    assert isinstance(body, list) and len(body) >= 1
                elif case.method == "PUT" and case.path.endswith("/schedule"):
                    assert (
                        body["course_code"] == dataset.get("completion_course_code", "1705275")
                        and len(body["schedule_blocks"]) == 2
                    )
                elif case.method == "DELETE" and case.path.endswith(("/assignments", "/courses")):
                    assert "deleted_count" in body
                elif case.method == "POST" and case.path.endswith("/courses/assignments"):
                    assert body["origin"] == "manual" and body["title"] == "Perf manual assignment"
                elif case.path.endswith(("/enrolled", "/pending-links")):
                    assert isinstance(body, list)
                elif peak and case.path == "/api/v1/courses/assignments":
                    assert any(row["origin"] == "manual" for row in body)
                elif case.path.endswith(("/courses", "/assignments", "/tickets/all", "/catalog")):
                    assert isinstance(body, list) and len(body) > 0
                elif case.path.endswith("/dutic/ical/sync"):
                    assert (
                        body["status"] == "SYNCED"
                        and "synced_assignments_count" in body
                    )
                elif case.path.endswith("/sync"):
                    assert (
                        body["status"] == "SYNCED" and body["synced_courses_count"] >= 1
                    )
                elif case.path.endswith("/dutic/ical/status"):
                    assert "connected" in body
                elif case.path.endswith("/dutic/ical/subscribe"):
                    assert body["status"] == "CONNECTED"
                elif case.path.endswith("/health"):
                    assert body["status"] == "healthy"
                elif case.path.endswith("/auth/me"):
                    assert body["email"] == self.account["identity"] + "@unsa.edu.pe"
                elif case.path.endswith("/auth/google/classroom/status"):
                    assert "connected" in body
                elif case.path.endswith("/auth/google/classroom/callback"):
                    assert body["status"] == "CONNECTED"
                elif case.path.endswith("/auth/google"):
                    assert (
                        body["access_token"]
                        and body["user"]["email"]
                        == self.account["identity"] + "@unsa.edu.pe"
                    )
                elif case.path.endswith("/auth/otp/generate"):
                    assert len(body["otp_code"]) == 6 and body["expires_in_seconds"] == 300
                elif case.path.endswith("/auth/otp/verify"):
                    assert body["detail"]["code"] in ("OTP_EXPIRED", "INVALID_OTP")
                    response.success()
                elif case.path.endswith("/auth/otp/status"):
                    assert "whatsapp_connected" in body and "telegram_connected" in body
                elif case.method == "DELETE" and case.path.endswith("/auth/otp/link/{channel}"):
                    assert body["channel"] == "whatsapp" and body["linked"] is False
                elif case.path.endswith("/nlp/parse-task"):
                    assert body["status"] == "parsed" and body["task"]["course"] == "SO"
            except (AssertionError, KeyError, TypeError, ValueError):
                response.failure("Response contract violation")
