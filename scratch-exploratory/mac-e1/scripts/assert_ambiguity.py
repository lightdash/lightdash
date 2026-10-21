import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[2]
file = Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'examples/multi-repo-dbt-sim/.work/small/results/results.json'
rows = json.loads(file.read_text())['results']
row = next(item for item in rows if item['scenario'] == 'ambiguity')
operation = row['operations'][-1]
message = ' '.join(step.get('stepError') or '' for step in operation['status']['steps'])
correct = not operation['success'] and 'defined by several dbt sources' in message and 'ran out of retries' not in message
print(json.dumps({'clearAmbiguityError': correct, 'observed': message}, indent=2))
raise SystemExit(0 if correct else 1)
