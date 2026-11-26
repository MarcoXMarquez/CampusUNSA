"""Acceptance evidence for the five-minute peak workload."""

from copy import deepcopy
from unittest import TestCase

from tests.load.gate import violations
from tests.load.scenarios import PEAK_SCENARIOS


class PeakLoadAcceptanceTests(TestCase):
    def setUp(self) -> None:
        self.report = {
            "users": 1000,
            "spawn_rate": 50,
            "steady_seconds": 300.0,
            "user_errors": 0,
            "student_sessions": 1000,
            "pacing_seconds": 5,
            "cpu_warning": False,
            "metrics": [
                {"name": case.name, "count": 1000, "failures": 4,
                 "p50": 70, "p95": 200, "p99": 499.99}
                for case in dict.fromkeys(PEAK_SCENARIOS)
            ],
        }
        self.resources = [
            {"memory_bytes": 200_000_000, "connections": 30, "max_connections": 100,
             "database_deadlocks": 0, "active_connections": 12, "lock_waiters": 0}
        ] * 300

    def test_peak_mix_reads_the_same_sources_as_weekly_view_and_task_board(self) -> None:
        self.assertEqual(
            [case.path for case in PEAK_SCENARIOS].count("/api/v1/courses/schedule/weekly"),
            2,
        )
        self.assertEqual(
            {case.path for case in PEAK_SCENARIOS} - {"/api/v1/courses/schedule/weekly"},
            {
                "/api/v1/classroom/assignments",
                "/api/v1/dutic/assignments",
                "/api/v1/courses/assignments",
            },
        )
        self.assertTrue(all(case.method == "GET" and case.role == "student" for case in PEAK_SCENARIOS))

    def test_five_minutes_within_all_thresholds_passes(self) -> None:
        self.assertEqual(violations(self.report, self.resources, peak=True), [])

    def test_short_run_and_missing_connection_samples_fail(self) -> None:
        self.report["steady_seconds"] = 299.99
        errors = violations(self.report, self.resources[:30], peak=True)
        self.assertTrue(any("300 seconds" in error for error in errors))
        self.assertTrue(any("connection samples" in error for error in errors))

    def test_exact_latency_and_failure_ratio_limits_are_rejected(self) -> None:
        for field, limit in (("p95", 500), ("p99", 500), ("failures", 5)):
            with self.subTest(field=field):
                report = deepcopy(self.report)
                for metric in report["metrics"]:
                    metric[field] = limit
                self.assertTrue(violations(report, self.resources, peak=True))

    def test_deadlocks_or_pool_starvation_fail(self) -> None:
        samples = deepcopy(self.resources)
        samples[-1]["database_deadlocks"] = 1
        errors = violations(self.report, samples, peak=True, pool_errors=1)
        self.assertTrue(any("deadlock" in error for error in errors))
        self.assertTrue(any("pool" in error for error in errors))

    def test_peak_evidence_cannot_replace_the_standard_regression_gate(self) -> None:
        self.assertTrue(violations(self.report, self.resources))
