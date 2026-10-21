import os
import subprocess
import shutil
import sys
import time

deadline = time.monotonic() + 1800
while True:
    subprocess.run(['uptime'], check=True)
    subprocess.run(['free', '-g'] if shutil.which('free') else ['vm_stat'], check=True)
    if os.getloadavg()[0] <= 6:
        break
    if time.monotonic() > deadline:
        raise SystemExit('Load did not fall below 6 within 30 minutes')
    time.sleep(10)
env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=4096')
raise SystemExit(subprocess.run(sys.argv[1:], env=env, timeout=1800).returncode)
