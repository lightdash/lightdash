#!/bin/bash
set -e
dbt seed --full-refresh
dbt run
exec dbt rpc --host 0.0.0.0 --port ${PORT}
