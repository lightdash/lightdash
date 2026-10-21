#!/bin/zsh
set -eu
uv venv --python /Users/charlie/.local/share/uv/python/cpython-3.11.16-macos-aarch64-none/bin/python3 .venv-dbt
uv pip install --python .venv-dbt/bin/python dbt-core==1.12.0 dbt-postgres==1.10.2 psycopg2-binary==2.9.13
