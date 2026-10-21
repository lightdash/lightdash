import fcntl
import subprocess
import sys
from pathlib import Path

path = Path(sys.argv[1])
path.parent.mkdir(parents=True, exist_ok=True)
with path.open('a') as lock:
    fcntl.flock(lock, fcntl.LOCK_EX)
    raise SystemExit(subprocess.run(sys.argv[2:]).returncode)
