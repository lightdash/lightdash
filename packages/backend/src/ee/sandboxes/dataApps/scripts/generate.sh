#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

if [ $# -eq 0 ]; then
    echo "Usage: ./scripts/generate.sh \"Build me a revenue dashboard by customer segment\""
    exit 1
fi

PROMPT="$1"

claude -p "$PROMPT" \
    --append-system-prompt-file "$PROJECT_DIR/skill.md" \
    --allowedTools "Read,Write,Edit,Glob,Grep" \
    --cwd "$PROJECT_DIR"
