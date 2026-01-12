from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Iterable, Optional


class CommandResult:
    def __init__(self, output: bytes):
        self.output = output


class CommandRunner:
    """简单的命令执行封装，支持超时和日志落盘。"""

    def run(
        self,
        cmd: Iterable[str],
        cwd: Path,
        timeout: int,
        log_path: Optional[Path] = None,
    ) -> CommandResult:
        output = subprocess.check_output(cmd, stderr=subprocess.STDOUT, cwd=cwd, timeout=timeout)
        if log_path:
            log_path.parent.mkdir(parents=True, exist_ok=True)
            log_path.write_bytes(output)
        return CommandResult(output=output)
