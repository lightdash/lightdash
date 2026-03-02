#!/usr/bin/env bash
# Attach to an agent's Claude Code tmux session.
#
# Usage: ./agent-harness/attach.sh <agent-id>
#   agent-id: integer 1-5
set -euo pipefail

AGENT_ID="${1:-}"

if [[ -z "$AGENT_ID" ]] || ! [[ "$AGENT_ID" =~ ^[1-5]$ ]]; then
    echo "Usage: $0 <agent-id>" >&2
    echo "  agent-id must be 1-5" >&2
    echo "" >&2
    echo "Available agent sessions:" >&2
    tmux list-sessions 2>/dev/null | grep "^agent-" || echo "  (none)" >&2
    exit 1
fi

TMUX_SESSION="agent-${AGENT_ID}"

if ! tmux has-session -t "$TMUX_SESSION" 2>/dev/null; then
    echo "Error: No tmux session '$TMUX_SESSION' found." >&2
    echo "" >&2
    echo "To create one, run:" >&2
    echo "  ./agent-harness/launch.sh $AGENT_ID --claude" >&2
    echo "" >&2
    echo "Available agent sessions:" >&2
    tmux list-sessions 2>/dev/null | grep "^agent-" || echo "  (none)" >&2
    exit 1
fi

# Attach to the session
exec tmux attach -t "$TMUX_SESSION"
