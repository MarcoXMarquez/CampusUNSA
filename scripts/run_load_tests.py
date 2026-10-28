"""Run TECH-02 in a unique, disposable Compose project and preserve evidence."""

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from tests.load.gate import violations  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output", type=Path, help="Directory for CSV, HTML, JSON and logs"
    )
    parser.add_argument(
        "--delay-ms",
        type=int,
        default=int(os.environ.get("PERF_DELAY_MS", "0")),
        help="Inject test-only profile latency to prove the gate rejects regressions",
    )
    args = parser.parse_args()
    if not 0 <= args.delay_ms <= 5000:
        parser.error("--delay-ms must be between 0 and 5000")
    run_id = uuid4().hex[:12]
    project = f"campusunsa-perf-{run_id}"
    output = (args.output or ROOT / "perf-results" / run_id).resolve()
    output.mkdir(parents=True, exist_ok=True)
    environment = dict(
        os.environ, PERF_OUTPUT_DIR=output.as_posix(), PERF_DELAY_MS=str(args.delay_ms)
    )
    command = [
        "docker",
        "compose",
        "-p",
        project,
        "-f",
        str(ROOT / "docker-compose.perf.yml"),
    ]
    monitor: subprocess.Popen | None = None
    failed: list[str] = []

    with (output / "orchestration.log").open("w", encoding="utf-8") as log, (
        output / "resources.jsonl"
    ).open("w", encoding="utf-8") as samples:

        def run(
            arguments: list[str], *, check: bool = True
        ) -> subprocess.CompletedProcess:
            print("PERF:", " ".join(arguments), flush=True)
            return subprocess.run(
                command + arguments,
                cwd=ROOT,
                env=environment,
                stdout=log,
                stderr=subprocess.STDOUT,
                check=check,
                timeout=1200,
            )

        try:
            run(["build", "backend"])
            run(["pull", "locust", "gateway", "perf-postgres", "perf-redis"])
            run(
                [
                    "up",
                    "-d",
                    "--wait",
                    "--wait-timeout",
                    "90",
                    "perf-postgres",
                    "perf-redis",
                ]
            )
            run(["run", "--rm", "backend", "alembic", "upgrade", "head"])
            run(
                [
                    "run",
                    "--rm",
                    "--user",
                    "0:0",
                    "backend",
                    "python",
                    "-m",
                    "tests.load.seed_load_users",
                ]
            )
            run(["up", "-d", "--wait", "--wait-timeout", "90", "backend"])
            run(["exec", "-T", "backend", "python", "-m", "tests.load.wait_ready"])
            run(["up", "-d", "--wait", "--wait-timeout", "90", "gateway", "observer"])
            monitor = subprocess.Popen(
                command
                + ["logs", "--follow", "--no-color", "--no-log-prefix", "observer"],
                cwd=ROOT,
                env=environment,
                stdout=samples,
                stderr=log,
            )
            result = run(["run", "--rm", "locust"], check=False)
            if result.returncode:
                failed.append(f"Locust exited with code {result.returncode}")
            replica_ids = subprocess.check_output(
                command + ["ps", "-q", "backend"],
                cwd=ROOT,
                env=environment,
                stderr=log,
                text=True,
            ).split()
            if len(replica_ids) != 4:
                raise ValueError(
                    "Four backend replicas are required for resource evidence"
                )
            memory = []
            for replica in replica_ids:
                peak = int(
                    subprocess.check_output(
                        [
                            "docker",
                            "exec",
                            replica,
                            "sh",
                            "-c",
                            "cat /sys/fs/cgroup/memory.peak 2>/dev/null || cat /sys/fs/cgroup/memory/memory.max_usage_in_bytes",
                        ],
                        stderr=log,
                        text=True,
                    )
                )
                state = subprocess.check_output(
                    [
                        "docker",
                        "inspect",
                        "--format",
                        "{{.State.OOMKilled}} {{.RestartCount}}",
                        replica,
                    ],
                    stderr=log,
                    text=True,
                ).strip()
                if state != "false 0":
                    failed.append("A backend replica was OOM-killed or restarted")
                memory.append({"replica": replica, "peak_bytes": peak})
            memory_total = sum(item["peak_bytes"] for item in memory)
            (output / "memory.json").write_text(
                json.dumps(
                    {"replicas": memory, "total_peak_upper_bound_bytes": memory_total},
                    indent=2,
                )
            )
            samples.flush()
            report = json.loads((output / "report.json").read_text())
            resources = [
                dict(json.loads(line), memory_bytes=memory_total)
                for line in (output / "resources.jsonl").read_text().splitlines()
                if line.strip()
            ]
            failed.extend(violations(report, resources))
            summary = {
                "project": project,
                "passed": not failed,
                "violations": failed,
                "run": report,
                "resource_samples": len(resources),
                "peak_memory_bytes": max(
                    (sample["memory_bytes"] for sample in resources), default=None
                ),
                "peak_connections": max(
                    (sample["connections"] for sample in resources), default=None
                ),
            }
            (output / "summary.json").write_text(json.dumps(summary, indent=2))
        except (
            subprocess.SubprocessError,
            OSError,
            ValueError,
            KeyError,
            TypeError,
        ) as error:
            failed.append(f"Performance harness could not complete: {error}")
            (output / "summary.json").write_text(
                json.dumps({"passed": False, "violations": failed}, indent=2)
            )
        finally:
            run(["logs", "--no-color", "backend", "gateway"], check=False)
            if monitor:
                monitor.terminate()
                try:
                    monitor.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    monitor.kill()
                    monitor.wait()
            # Only this invocation's generated project and its synthetic volume.
            cleanup = run(["down", "--volumes", "--remove-orphans"], check=False)
            if cleanup.returncode:
                failed.append("Disposable performance project cleanup failed")
    final_summary = json.loads((output / "summary.json").read_text())
    final_summary.update({"passed": not failed, "violations": failed})
    (output / "summary.json").write_text(json.dumps(final_summary, indent=2))
    print(f"PERF evidence: {output}")
    for error in failed:
        print(f"PERF FAILED: {error}")
    if not failed:
        print(
            "PERF PASSED: 1,000 users; 50/s spawn; 60s steady load; each endpoint p50 < 100ms and p95 < 300ms; zero failures; resource bounds met."
        )
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
