import json
from harness import *

server = SimpleNamespace(port=GIT_PORT, clone_count=0)
h = Harness(server)
h.project = os.environ.get('EXPLORATORY_PROJECT')
operation = sys.argv[1]
try:
    if operation == 'refresh':
        result = h.r.refresh(h.project)
    elif operation == 'deploy':
        result = h.r.deploy(h.project, sys.argv[2], True)
    elif operation == 'setup':
        result = h.r.project(sys.argv[2], sys.argv[3], json.loads(sys.argv[4]))
    elif operation == 'cancel-refresh':
        started = time.time()
        job = h.api.call('POST', f'/api/v1/projects/{h.project}/refresh')['jobUuid']
        for _ in range(90):
            status = h.api.call('GET', f'/api/v1/jobs/{job}')
            events = OUT / 'fault-events.log'
            if events.exists() and any(json.loads(line).get('fault') == 'sleep' and json.loads(line)['at'] >= started for line in events.read_text().splitlines()):
                break
            time.sleep(1)
        else:
            raise RuntimeError('Did not observe own slow dbt process for cancellation')
        h.stop()
        result = {'job': job, 'secondary_sleep_was_active': True, 'status_before_stop': status['jobStatus']}
    else:
        raise ValueError('Unknown exploratory operation')
    print('\n__EXPLORATORY_RESULT__' + json.dumps(result), flush=True)
finally:
    h.r.close()
