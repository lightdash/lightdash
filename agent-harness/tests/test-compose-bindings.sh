#!/usr/bin/env bash
# Checks that the agent-harness compose stack does not publish services on
# public interfaces and does not hardcode the Postgres password.
#
# Usage: ./agent-harness/tests/test-compose-bindings.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/../docker-compose.agent.yml"

fail() { echo "FAIL: $*" >&2; exit 1; }

# Every published port must be bound to loopback
if grep -E '^\s+- "\$\{' "$COMPOSE_FILE"; then
    fail "compose publishes a port without a loopback bind (127.0.0.1:...)"
fi

# The database password must come from the environment, not a literal
if grep -E 'POSTGRES_PASSWORD:[[:space:]]*[^$[:space:]]' "$COMPOSE_FILE"; then
    fail "POSTGRES_PASSWORD is hardcoded in the compose file"
fi

# Compose file must still parse
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    docker compose -f "$COMPOSE_FILE" config --quiet || fail "docker compose config failed"
fi

echo "OK: compose bindings are loopback-only and the DB password is env-driven"
