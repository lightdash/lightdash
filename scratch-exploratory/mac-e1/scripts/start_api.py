import os
import signal
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

root = Path(__file__).resolve().parents[2]
work = root / 'scratch-exploratory/e1'
component = sys.argv[1] if len(sys.argv) > 1 else 'api'
port = 18982 if component == 'worker' else 18981
entry = 'src/scheduler.ts' if component == 'worker' else 'src/index.ts'
pidfile = work / f'{component}.pid'
if pidfile.exists():
    raise SystemExit('Stop the owned API before starting another')
output = (work / f'{component}.log').open('a')
env = dict(os.environ)
if env.get('SERVER_DBT_BIN'):
    env['PATH'] = env['SERVER_DBT_BIN'] + ':' + env['PATH']
env['PORT'] = str(port)
if component == 'worker':
    env['SCHEDULER_ENABLED'] = 'true'
    env['SCHEDULER_CONCURRENCY'] = '1'
    env['SCHEDULER_INCLUDE_TASKS'] = 'compileProject,testAndCompileProject,copyPreviewContent,createProjectWithCompile,indexCatalog,sqlRunner,sqlRunnerPivotQuery'
process = subprocess.Popen([str(root / 'node_modules/.bin/tsx'), entry],
                           cwd=root / 'packages/backend', stdout=output, stderr=subprocess.STDOUT,
                           env=env, start_new_session=True)
pidfile.write_text(str(process.pid))
for _ in range(120):
    if process.poll() is not None:
        pidfile.unlink()
        raise SystemExit(f'API exited {process.returncode}; inspect owned api.log')
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:{port}/api/v1/health', timeout=2) as response:
            if response.status == 200:
                print(f'Owned {component} ready at http://127.0.0.1:{port}', flush=True)
                break
    except Exception:
        pass
    time.sleep(1)
else:
    os.killpg(process.pid, signal.SIGTERM)
    pidfile.unlink()
    raise SystemExit('Owned API did not become healthy')
