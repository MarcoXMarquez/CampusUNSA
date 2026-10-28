"""Check the real Bash oracle propagates load-gate failures without Docker."""

import os
import shutil
from pathlib import Path
import subprocess
import sys

import pytest


@pytest.mark.skipif(
    sys.platform == "win32", reason="Bash shell contract is tested on Linux CI"
)
@pytest.mark.parametrize("load_exit", [0, 1])
def test_bash_oracle_propagates_performance_result(
    tmp_path: Path, load_exit: int
) -> None:
    root = Path(__file__).resolve().parents[2]
    if not (root / "scripts/verify.sh").exists():
        pytest.skip("Oracle contract test requires the repository checkout")
    commands = {
        "git": "exit 0",
        "docker": 'if [ "$2" = "ps" ]; then echo backend; fi\nexit 0',
        "python3": f"echo 'controlled performance result'\nexit {load_exit}",
    }
    for name, body in commands.items():
        command = tmp_path / name
        command.write_text("#!/bin/sh\n" + body + "\n")
        command.chmod(0o755)
    environment = dict(os.environ, PATH=str(tmp_path) + os.pathsep + os.environ["PATH"])
    result = subprocess.run(
        ["bash", "scripts/verify.sh"],
        cwd=root,
        env=environment,
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert result.returncode == load_exit
    assert "[6/6] Checking Concurrent Load Performance" in result.stdout
    if load_exit:
        assert "FAILED: Load threshold violation" in result.stdout
        assert "VERIFICATION FAILED" in result.stdout


@pytest.mark.skipif(not shutil.which("pwsh"), reason="PowerShell is unavailable")
@pytest.mark.parametrize("load_exit", [0, 1])
def test_powershell_oracle_propagates_performance_result(
    tmp_path: Path, load_exit: int
) -> None:
    root = Path(__file__).resolve().parents[2]
    if not (root / "scripts/verify.ps1").exists():
        pytest.skip("Oracle contract test requires the repository checkout")
    script = tmp_path / "oracle-contract.ps1"
    script.write_text(
        "function global:git { $global:LASTEXITCODE = 0 }\n"
        "function global:docker { if ($args[1] -eq 'ps') { 'backend' }; $global:LASTEXITCODE = 0 }\n"
        f"function global:python {{ $global:LASTEXITCODE = {load_exit} }}\n"
        f". '{(root / 'scripts/verify.ps1').as_posix()}'\n"
        "exit $LASTEXITCODE\n"
    )
    result = subprocess.run(
        [shutil.which("pwsh"), "-NoProfile", "-File", str(script)],
        cwd=root,
        capture_output=True,
        text=True,
        timeout=15,
    )
    assert result.returncode == load_exit
    assert "[6/6] Checking Concurrent Load Performance" in result.stdout
