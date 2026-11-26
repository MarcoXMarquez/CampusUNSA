"""Verify report selection in the host performance runner."""

from unittest import TestCase


class LoadRunnerProfileTests(TestCase):
    def test_replica_memory_does_not_select_the_peak_profile(self) -> None:
        import sys
        from pathlib import Path
        from subprocess import CompletedProcess
        from tempfile import TemporaryDirectory
        from unittest.mock import patch

        from scripts import run_load_tests

        with TemporaryDirectory() as directory:
            output = Path(directory)

            def run_command(command: list[str], **kwargs: object) -> CompletedProcess:
                if command[-3:] == ["run", "--rm", "locust"]:
                    (output / "report.json").write_text('{"metrics": []}', encoding="utf-8")
                return CompletedProcess(command, 0)

            def command_output(command: list[str], **kwargs: object) -> str:
                if "ps" in command:
                    return "replica-1\nreplica-2\nreplica-3\nreplica-4"
                if "inspect" in command:
                    return "false 0"
                if "logs" in command:
                    return ""
                return "100000000"

            with (
                patch.object(sys, "argv", ["run_load_tests.py", "--output", directory]),
                patch.object(run_load_tests.subprocess, "run", side_effect=run_command),
                patch.object(run_load_tests.subprocess, "check_output", side_effect=command_output),
                patch.object(run_load_tests.subprocess, "Popen"),
                patch.object(run_load_tests, "violations", return_value=[]) as evaluate,
            ):
                self.assertEqual(run_load_tests.main(), 0)
            evaluate.assert_called_once_with({"metrics": []}, [], peak=False, pool_errors=0)
