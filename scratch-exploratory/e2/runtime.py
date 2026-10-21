import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
CHECKOUT = SCRIPTS.parents[1]
FIXTURE = CHECKOUT / 'examples/multi-repo-dbt-sim'
ROOT = FIXTURE / '.work/exploratory'
OUT = SCRIPTS / '.work/results'
OUT.mkdir(parents=True, exist_ok=True)
REAL_DBT = Path(os.environ.get('EXPLORATORY_DBT', str(FIXTURE / '.work/venvs/dbt12/bin/dbt')))
LDENV = os.environ.get('LDENV_BIN', str(Path.home() / '.ldenv/bin/ldenv'))
GIT_PORT = int(os.environ.get('EXPLORATORY_GIT_PORT', '19458'))
LOCK = Path(os.environ.get('EXPLORATORY_LOCK', str(Path.home() / '.cache/lightdash-exploratory/heavy.lock')))

def locked(argv):
    LOCK.parent.mkdir(parents=True, exist_ok=True)
    if shutil.which('flock'):
        return ['flock', str(LOCK), *map(str, argv)]
    return [sys.executable, str(SCRIPTS / 'locked.py'), str(LOCK), *map(str, argv)]

def api_url():
    status = json.loads(subprocess.check_output([LDENV, 'status', '--json'], cwd=CHECKOUT))
    if Path(status['worktree']).resolve() != CHECKOUT or not status.get('ports'):
        raise RuntimeError('Start the ldenv instance owned by this checkout')
    return f"http://127.0.0.1:{status['ports']['api']}"
