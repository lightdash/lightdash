import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path

from tooling import check_load, command

ROOT = Path(__file__).resolve().parent
CHECKOUT = ROOT.parents[1]


def main():
    env = dict(os.environ)
    status = json.loads(
        command(
            [str(Path.home() / ".ldenv/bin/ldenv"), "status", "--json"],
            CHECKOUT,
            env,
            30,
        ).stdout
    )
    if Path(status["worktree"]).resolve() != CHECKOUT or not status.get("ports"):
        raise RuntimeError("Start the ldenv instance bound to this worktree first")
    binary = ROOT / ".work/bin"
    binary.mkdir(parents=True, exist_ok=True)
    link = binary / "dbt1.9"
    target = ROOT / ".work/venvs/dbt19/bin/dbt"
    if not target.exists():
        raise RuntimeError("Run setup.sh before configure.py")
    if link.is_symlink() and link.resolve() != target.resolve():
        raise RuntimeError("The fixture dbt1.9 path is already owned")
    if not link.exists():
        link.symlink_to(target)
    env["PATH"] = str(binary) + os.pathsep + env["PATH"]
    env["LIGHTDASH_ENABLE_FEATURE_FLAGS"] = "multi-dbt-sources,cross-source-dbt-refs"
    env["LIGHTDASH_LOG_CONSOLE_FORMAT"] = "json"
    env["DBT_SOURCE_FETCH_CONCURRENCY"] = "2"
    check_load()
    command(
        ["pnpm", "exec", "pm2", "restart", status["id"] + "-api", "--update-env"],
        CHECKOUT,
        env,
        60,
    )
    url = f"http://127.0.0.1:{status['ports']['api']}/api/v1/health"
    for attempt in range(60):
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if response.status == 200:
                    print(
                        "This worktree API is ready with fixture flags and structured logs."
                    )
                    return
        except (urllib.error.URLError, TimeoutError):
            time.sleep(1)
    raise RuntimeError("This worktree API did not become healthy after restart")


if __name__ == "__main__":
    main()
