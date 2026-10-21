import os
import subprocess
import shutil
import sys
import time

deadline = time.monotonic() + 1800
while True:
    subprocess.run(['df','-h',os.getcwd()], check=True)
    if shutil.disk_usage(os.getcwd()).free < 15*1024**3: raise SystemExit('STOP: disk below 15 GiB')
    subprocess.run(['uptime'], check=True)
    subprocess.run(['free', '-g'] if shutil.which('free') else ['vm_stat'], check=True)
    if os.getloadavg()[0] <= 10:
        break
    if time.monotonic() > deadline:
        raise SystemExit('Load did not fall below 10 within 30 minutes')
    time.sleep(10)
env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=4096')
raise SystemExit(subprocess.run(sys.argv[1:], env=env, timeout=1800).returncode)
