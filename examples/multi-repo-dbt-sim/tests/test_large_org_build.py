import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import large_org_build as build


class DbtSelectionTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(dir=ROOT / ".work")
        self.addCleanup(self.directory.cleanup)
        self.work = Path(self.directory.name)
        self.addCleanup(patch.stopall)
        patch.object(build, "WORK", self.work).start()
        self.executables = []
        for name in ("baseline", "candidate"):
            executable = self.work / "venvs" / name / "bin/dbt"
            executable.parent.mkdir(parents=True)
            executable.write_text("#!/bin/sh\nprintf '%s' " + name + "\n")
            executable.chmod(0o700)
            self.executables.append(executable)

    def test_selected_commands_run_without_retargeting_baseline(self):
        original, selected = [build._shim(path) for path in self.executables]
        self.assertNotEqual(original, selected)
        for directory, expected in ((original, "baseline"), (selected, "candidate")):
            for name in ("dbt", "dbt1.12"):
                result = subprocess.run(
                    [name],
                    env={"PATH": str(directory)},
                    capture_output=True,
                    check=True,
                )
                self.assertEqual(result.stdout.decode(), expected)

    def test_selected_executable_must_stay_in_private_venvs(self):
        with self.assertRaisesRegex(ValueError, "private fixture venv"):
            build._shim(sys.executable)

    def test_live_process_path_must_match_selected_toolchain(self):
        baseline, candidate = self.executables
        shim = build._shim(candidate)
        process = subprocess.Popen(
            [sys.executable, "-c", "import time; time.sleep(30)"],
            env={**os.environ, "PATH": str(shim)},
        )
        try:
            with patch.object(build, "_run", return_value=SimpleNamespace(stdout="{}")):
                evidence = build._server_toolchain({"pid": process.pid}, candidate)
                self.assertEqual(
                    evidence["live_api_path_resolution"],
                    {"dbt": str(candidate), "dbt1.12": str(candidate)},
                )
                with self.assertRaisesRegex(RuntimeError, "different dbt executable"):
                    build._server_toolchain({"pid": process.pid}, baseline)
        finally:
            process.terminate()
            process.wait(timeout=5)


if __name__ == "__main__":
    unittest.main()
