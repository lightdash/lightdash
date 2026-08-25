#!/usr/bin/env bash
# Invoke agent-browser (PATH binary, else npx). Requires AGENT_BROWSER_SESSION.
set -euo pipefail

if [ -z "${AGENT_BROWSER_SESSION:-}" ]; then
    echo "FAIL: set AGENT_BROWSER_SESSION before driving (see verify-lightdash SKILL.md)." >&2
    exit 2
fi

if command -v agent-browser >/dev/null 2>&1; then
    exec agent-browser "$@"
fi
exec npx --yes agent-browser "$@"
