#!/usr/bin/env bash

set -euo pipefail

root=$(cd "$(dirname "$0")/../../.." && pwd)
actions_dir="$root/examples/upgrade-automation"

for manifest in "$actions_dir"/*/action.yml; do
    if ! python3 -c "
import sys, yaml
path = sys.argv[1]
try:
    manifest = yaml.safe_load(open(path))
except yaml.YAMLError as error:
    print(f'{path} is not valid YAML: {error}', file=sys.stderr)
    sys.exit(1)
if not isinstance(manifest, dict):
    print(f'{path} must parse to a mapping', file=sys.stderr)
    sys.exit(1)
declared = set((manifest.get('inputs') or {}).keys())
used = set()
for step in (manifest.get('runs') or {}).get('steps') or []:
    for value in ((step.get('env') or {}).values()):
        text = str(value)
        for name in declared:
            if 'inputs.' + name in text:
                used.add(name)
missing = sorted(name for name in declared if name not in used)
if missing:
    print(f'{path} declares inputs that no step consumes: {missing}', file=sys.stderr)
    sys.exit(1)
" "$manifest"; then
        printf 'manifest test failed for %s\n' "$manifest" >&2
        exit 1
    fi
    printf 'manifest %s parsed and wired\n' "${manifest#"$root/"}"
done

printf 'action manifest tests passed\n'
