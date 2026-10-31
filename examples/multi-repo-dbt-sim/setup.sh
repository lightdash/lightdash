#!/usr/bin/env bash
set -euo pipefail
fixture_root=$(cd -- "$(dirname -- "$0")" && pwd)
checkout_root=$(cd -- "$fixture_root/../.." && pwd)
cd "$checkout_root"
python3 - "$fixture_root" <<'PY'
import sys
sys.path.insert(0, sys.argv[1])
from tooling import check_load
check_load()
PY
uv venv --allow-existing --python 3.12 "$fixture_root/.work/venvs/dbt12"
uv pip install --python "$fixture_root/.work/venvs/dbt12/bin/python" \
    dbt-core==1.12.3 dbt-postgres==1.10.0 dbt-loom==0.9.6
uv venv --allow-existing --python 3.12 "$fixture_root/.work/venvs/dbt19"
uv pip install --python "$fixture_root/.work/venvs/dbt19/bin/python" \
    dbt-core==1.9.10 dbt-postgres==1.9.1 dbt-loom==0.9.6
pnpm -F @lightdash/cli build
