"""Fail-closed performance acceptance boundaries, independent of live services."""

from copy import deepcopy

import pytest


def valid_report() -> dict[str, object]:
    from tests.load.scenarios import SCENARIOS

    return {
        "users": 1000,
        "spawn_rate": 50,
        "steady_seconds": 60.1,
        "user_errors": 0,
        "student_sessions": 1000,
        "pacing_seconds": 5,
        "cpu_warning": False,
        "metrics": [
            {"name": case.name, "count": 1000, "failures": 0, "p50": 25, "p95": 70}
            for case in SCENARIOS
        ],
    }


def valid_resources() -> list[dict[str, object]]:
    return [{"memory_bytes": 200_000_000, "connections": 30, "max_connections": 100}]


def test_complete_load_report_passes() -> None:
    from tests.load.gate import violations

    assert violations(valid_report(), valid_resources()) == []


@pytest.mark.parametrize(
    "field,value",
    [
        ("p95", 300),
        ("p50", 100),
        ("failures", 1),
        ("count", 0),
        ("count", 499),
        ("p95", float("nan")),
    ],
)
def test_each_endpoint_enforces_strict_thresholds(field: str, value: float) -> None:
    from tests.load.gate import violations

    report = valid_report()
    report["metrics"][0][field] = value
    assert violations(report, valid_resources())


@pytest.mark.parametrize(
    "field,value",
    [
        ("users", 999),
        ("spawn_rate", 49),
        ("steady_seconds", 59.9),
        ("user_errors", 1),
        ("student_sessions", 999),
        ("pacing_seconds", 6),
        ("cpu_warning", True),
    ],
)
def test_incomplete_or_invalid_run_cannot_pass(field: str, value: object) -> None:
    from tests.load.gate import violations

    report = valid_report()
    report[field] = value
    assert violations(report, valid_resources())


def test_missing_duplicate_and_empty_metrics_fail_closed() -> None:
    from tests.load.gate import violations

    for metrics in ([], valid_report()["metrics"][:-1], valid_report()["metrics"] * 2):
        report = valid_report()
        report["metrics"] = metrics
        assert violations(report, valid_resources())
    assert violations({}, [])


@pytest.mark.parametrize(
    "sample",
    [
        {
            "memory_bytes": 512 * 1024 * 1024 + 1,
            "connections": 30,
            "max_connections": 100,
        },
        {"memory_bytes": 100, "connections": 101, "max_connections": 100},
        {"memory_bytes": 100, "connections": 30, "max_connections": 200},
        {},
    ],
)
def test_resource_violation_or_missing_evidence_fails(
    sample: dict[str, object]
) -> None:
    from tests.load.gate import violations

    assert violations(valid_report(), [sample])
    assert violations(valid_report(), [])


def test_all_business_routes_are_registered() -> None:
    from app.main import app
    from tests.load.scenarios import SCENARIOS

    documented = {
        (method.upper(), path)
        for path, operations in app.openapi()["paths"].items()
        for method in operations
        if method in ("get", "post", "put", "patch", "delete")
    }
    registered = {(case.method, case.path) for case in SCENARIOS}
    assert (
        registered == documented
    ), "Register every new business endpoint in the load mix"


def test_fixture_guard_rejects_development_database() -> None:
    from tests.load.seed_load_users import require_isolation

    with pytest.raises(RuntimeError, match="isolated"):
        require_isolation()


def test_input_report_is_not_modified() -> None:
    from tests.load.gate import violations

    report = valid_report()
    original = deepcopy(report)
    violations(report, valid_resources())
    assert report == original


@pytest.mark.parametrize(
    "values,fraction,expected",
    [
        ([99.1, 99.5, 100.1], 0.5, 99.5),
        ([10.0, 20.0], 0.95, 19.5),
        ([23.4], 0.95, 23.4),
    ],
)
def test_raw_percentiles_preserve_sub_bucket_precision(
    values: list[float], fraction: float, expected: float
) -> None:
    from tests.load.gate import percentile

    assert percentile(values, fraction) == pytest.approx(expected)


def test_empty_percentile_evidence_is_invalid() -> None:
    from tests.load.gate import percentile

    with pytest.raises(ValueError):
        percentile([], 0.5)


def test_task_parser_registration_supports_the_separate_us10_branch() -> None:
    from tests.load.scenarios import scenarios_for

    route = ("POST", "/api/v1/nlp/parse-task")
    assert route not in {(case.method, case.path) for case in scenarios_for(False)}
    assert route in {(case.method, case.path) for case in scenarios_for(True)}
