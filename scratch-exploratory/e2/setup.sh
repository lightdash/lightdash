#!/usr/bin/env bash
set -euo pipefail
checkout_root=$(cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$checkout_root"
fixture_root="$checkout_root/examples/multi-repo-dbt-sim"
uv venv --allow-existing --python 3.12 "$fixture_root/.work/venvs/dbt12"
uv pip install --python "$fixture_root/.work/venvs/dbt12/bin/python" \
    dbt-core==1.12.0 dbt-postgres==1.10.2 psycopg2-binary==2.9.13 dbt-loom==0.9.6
