#!/bin/zsh
set -eu
uv venv --python /Users/charlie/.local/share/uv/python/cpython-3.11.16-macos-aarch64-none/bin/python3 .venv-dbt-cli
python3 .expl-e2/heavy.py uv pip install --python .venv-dbt-cli/bin/python dbt-core==1.12.3 dbt-postgres==1.10.0 dbt-loom==0.9.6 psycopg2-binary==2.9.13
uv venv --python /Users/charlie/.local/share/uv/python/cpython-3.11.16-macos-aarch64-none/bin/python3 .venv-dbt19
python3 .expl-e2/heavy.py uv pip install --python .venv-dbt19/bin/python dbt-core==1.9.10 dbt-postgres==1.9.1 dbt-loom==0.9.6 psycopg2-binary==2.9.13
