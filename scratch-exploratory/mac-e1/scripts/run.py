import os
import subprocess
import sys
import time
from pathlib import Path

root = Path(__file__).resolve().parents[2]
env = {key: os.environ[key] for key in ['PATH', 'HOME', 'USER', 'TMPDIR', 'SHELL', 'LANG', 'FNM_DIR'] if key in os.environ}
for line in (root / 'scratch-exploratory/e1/.env').read_text().splitlines():
    key, value = line.split('=', 1)
    env[key] = value
env['XDG_CONFIG_HOME'] = str(root / 'scratch-exploratory/e1/cli-config')
env['npm_config_cache'] = str(root / 'scratch-exploratory/e1/npm-cache')
if '--heavy' in sys.argv:
    sys.argv.remove('--heavy')
    subprocess.run(['df', '-h', str(root)])
    subprocess.run(['uptime'])
    if os.statvfs(root).f_bavail * os.statvfs(root).f_frsize < 15 * 1024**3:
        raise SystemExit('STOP: less than 15 GiB free')
    while os.getloadavg()[0] > 10:
        print(f'Waiting: 1-minute load {os.getloadavg()[0]:.2f}', flush=True)
        time.sleep(30)
subprocess.run(['fnm', 'exec', '--using', '24.18.1', *sys.argv[1:]], env=env, cwd=root, check=True)
