import os
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path

root = Path(__file__).resolve().parents[2]
component = sys.argv[1] if len(sys.argv) > 1 else 'api'
port = 18982 if component == 'worker' else 18981
pidfile = root / f'scratch-exploratory/e1/{component}.pid'
if not pidfile.exists():
    print('Owned API already stopped')
    raise SystemExit(0)
pid = int(pidfile.read_text())
cwd = subprocess.run(['lsof', '-a', '-p', str(pid), '-d', 'cwd', '-Fn'], text=True, capture_output=True).stdout
if 'n' + str(root / 'packages/backend') not in cwd:
    raise SystemExit('Owned API PID does not have the expected worktree cwd')
if os.getpgid(pid) != pid:
    raise SystemExit('Owned API process group does not match its saved PID')
os.killpg(pid, signal.SIGTERM)
for _ in range(30):
    with socket.socket() as client:
        stopped = client.connect_ex(('127.0.0.1', port)) != 0
    if stopped:
        pidfile.unlink()
        print(f'Stopped owned {component} on port {port}')
        break
    time.sleep(1)
else:
    raise SystemExit('Owned API did not stop gracefully')
