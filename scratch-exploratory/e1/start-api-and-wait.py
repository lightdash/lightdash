import json
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

CHECKOUT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(CHECKOUT/'examples/multi-repo-dbt-sim'))
from tooling import check_load
check_load()
status=json.loads(subprocess.check_output([str(Path.home()/'.ldenv/bin/ldenv'),'status','--json'],cwd=CHECKOUT))
subprocess.run(['node',str(Path(__file__).with_name('start-api.cjs')),sys.argv[1]],cwd=CHECKOUT,check=True)
for _ in range(60):
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{status['ports']['api']}/api/v1/health",timeout=2) as response:
            state=json.load(response)['results']
            if state['healthy']:
                print('Owned API is healthy, version '+state['version'],flush=True)
                break
    except Exception:
        pass
    time.sleep(1)
else:
    raise RuntimeError('Owned API failed to become healthy')
