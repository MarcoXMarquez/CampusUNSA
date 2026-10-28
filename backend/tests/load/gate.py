"""Strict, fail-closed acceptance evaluator shared by Locust and the host oracle."""

import math
from collections.abc import Mapping

from tests.load.scenarios import SCENARIOS


def percentile(values: list[float], fraction: float) -> float:
    """Linear interpolation over original end-to-end millisecond measurements."""
    if not values or not 0 <= fraction <= 1:
        raise ValueError("Percentiles need samples and a fraction between zero and one")
    ordered = sorted(values)
    position = (len(ordered) - 1) * fraction
    lower = math.floor(position)
    upper = min(lower + 1, len(ordered) - 1)
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def number(data: Mapping[str, object], key: str) -> float:
    value = data[key]
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"Invalid numeric evidence: {key}")
    if not math.isfinite(value) or value < 0:
        raise ValueError(f"Invalid numeric evidence: {key}")
    return float(value)


def violations(
    report: Mapping[str, object], resources: list[dict[str, object]]
) -> list[str]:
    errors: list[str] = []
    try:
        for field, expected in (
            ("users", 1000),
            ("student_sessions", 1000),
            ("spawn_rate", 50),
            ("pacing_seconds", 5),
            ("user_errors", 0),
        ):
            if number(report, field) != expected:
                errors.append(f"{field} must equal {expected}")
        if number(report, "steady_seconds") < 60:
            errors.append("Full 1,000-user measurement must last at least 60 seconds")
        if report["cpu_warning"] is not False:
            errors.append("Load generator CPU saturation invalidates the measurement")
        metrics = report["metrics"]
        if not isinstance(metrics, list):
            raise ValueError("Missing endpoint measurements")
        names: list[str] = []
        for metric in metrics:
            if not isinstance(metric, dict) or not isinstance(metric.get("name"), str):
                raise ValueError("Invalid endpoint measurement")
            name = metric["name"]
            names.append(name)
            if number(metric, "count") < 500:
                errors.append(f"{name}: fewer than 500 measured samples")
            if number(metric, "failures") != 0:
                errors.append(f"{name}: HTTP/contract failures must equal zero")
            if number(metric, "p50") >= 100 or number(metric, "p95") >= 300:
                errors.append(
                    f"{name}: threshold violation (p50 < 100 ms; p95 < 300 ms)"
                )
        expected_names = {case.name for case in SCENARIOS}
        if set(names) != expected_names or len(names) != len(expected_names):
            errors.append("Missing, duplicate, or unexpected endpoint measurements")
        if not resources:
            errors.append("Missing resource evidence")
        for sample in resources:
            if number(sample, "memory_bytes") > 512 * 1024 * 1024:
                errors.append("Backend memory exceeds 512 MiB")
            if number(sample, "max_connections") != 100:
                errors.append("PostgreSQL max_connections must equal 100")
            if number(sample, "connections") > 100:
                errors.append("PostgreSQL connections exceed 100")
    except (KeyError, TypeError, ValueError) as error:
        errors.append(f"Incomplete or invalid performance evidence: {error}")
    return errors
