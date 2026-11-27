"""Strict, fail-closed acceptance evaluator shared by Locust and the host oracle."""

import math
from collections.abc import Mapping

from tests.load.scenarios import PEAK_SCENARIOS, SCENARIOS


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
    report: Mapping[str, object],
    resources: list[dict[str, object]],
    *,
    peak: bool = False,
    pool_errors: int = 0,
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
        minimum_seconds = 300 if peak else 60
        if number(report, "steady_seconds") < minimum_seconds:
            errors.append(
                f"Full 1,000-user measurement must last at least {minimum_seconds} seconds"
            )
        if report["cpu_warning"] is not False:
            errors.append("Load generator CPU saturation invalidates the measurement")
        metrics = report["metrics"]
        if not isinstance(metrics, list):
            raise ValueError("Missing endpoint measurements")
        names: list[str] = []
        total_count = 0.0
        total_failures = 0.0
        for metric in metrics:
            if not isinstance(metric, dict) or not isinstance(metric.get("name"), str):
                raise ValueError("Invalid endpoint measurement")
            name = metric["name"]
            names.append(name)
            count = number(metric, "count")
            failures = number(metric, "failures")
            if count < 500:
                errors.append(f"{name}: fewer than 500 measured samples")
            if failures > count:
                raise ValueError(f"{name}: more failures than requests")
            if peak:
                total_count += count
                total_failures += failures
                if number(metric, "p95") >= 500 or number(metric, "p99") >= 500:
                    errors.append(f"{name}: threshold violation (p95 and p99 < 500 ms)")
            else:
                if failures != 0:
                    errors.append(f"{name}: HTTP/contract failures must equal zero")
                if number(metric, "p50") >= 100 or number(metric, "p95") >= 300:
                    errors.append(
                        f"{name}: threshold violation (p50 < 100 ms; p95 < 300 ms)"
                    )
        expected_names = {case.name for case in (PEAK_SCENARIOS if peak else SCENARIOS)}
        if set(names) != expected_names or len(names) != len(expected_names):
            errors.append("Missing, duplicate, or unexpected endpoint measurements")
        if not resources:
            errors.append("Missing resource evidence")
        if peak:
            if not total_count or total_failures / total_count >= 0.005:
                errors.append("Peak HTTP/contract failure rate must be below 0.5%")
            if len(resources) < 270:
                errors.append("Peak run requires at least 270 PostgreSQL connection samples")
            if pool_errors:
                errors.append("SQLAlchemy pool timeouts detected in backend logs")
        for sample in resources:
            if number(sample, "memory_bytes") > 512 * 1024 * 1024:
                errors.append("Backend memory exceeds 512 MiB")
            if number(sample, "max_connections") != 100:
                errors.append("PostgreSQL max_connections must equal 100")
            if number(sample, "connections") > 100:
                errors.append("PostgreSQL connections exceed 100")
        if peak and resources:
            if max(number(sample, "database_deadlocks") for sample in resources):
                errors.append("PostgreSQL deadlock detected")
            for key in ("active_connections", "lock_waiters"):
                for sample in resources:
                    if number(sample, key) > number(sample, "connections"):
                        raise ValueError(f"Invalid PostgreSQL connection breakdown: {key}")
    except (KeyError, TypeError, ValueError) as error:
        errors.append(f"Incomplete or invalid performance evidence: {error}")
    return errors
