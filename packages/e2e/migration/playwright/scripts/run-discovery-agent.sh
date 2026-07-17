#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
    echo "usage: $0 SOURCE_FILE FINDINGS_FILE" >&2
    exit 2
fi

source_file="$1"
findings_file="$2"
repo="$(git rev-parse --show-toplevel)"

cd "$repo"

pi --no-session \
    --name "discover:$(basename "$source_file")" \
    --thinking high \
    --tools read,bash,write \
    -p "You are one worker in a controlled Cypress migration discovery swarm.

Read and obey:
- /Users/irakli/.agents/skills/irakli-work-style/SKILL.md
- $repo/CLAUDE.md
- $repo/packages/e2e/CLAUDE.md
- $repo/packages/e2e/migration/playwright/prompts/analyze-file.md

Your sole assignment is:
SOURCE_FILE=$source_file
FINDINGS_FILE=$findings_file

Do not inspect another Cypress spec except when the assigned file directly imports it. Do not modify anything except FINDINGS_FILE. Use repository-relative line evidence. Complete every required section, then end with DISCOVERY_COMPLETE and the findings path."
