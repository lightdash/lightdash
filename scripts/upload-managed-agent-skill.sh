#!/bin/bash
#
# Upload the developing-in-lightdash skill to Anthropic's Skills API.
# Run once, then set MANAGED_AGENT_SKILL_ID with the returned ID.
#
# Usage:
#   ANTHROPIC_API_KEY=sk-ant-... ./scripts/upload-managed-agent-skill.sh
#
# Optionally attach to an existing agent:
#   ANTHROPIC_API_KEY=sk-ant-... AGENT_ID=agent_... ./scripts/upload-managed-agent-skill.sh
#

set -euo pipefail

if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
    echo "Error: ANTHROPIC_API_KEY is required"
    echo "Usage: ANTHROPIC_API_KEY=sk-ant-... $0"
    exit 1
fi

SKILL_DIR="skills/developing-in-lightdash"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ ! -f "$REPO_ROOT/$SKILL_DIR/SKILL.md" ]; then
    echo "Error: $SKILL_DIR/SKILL.md not found. Run from repo root."
    exit 1
fi

cd "$REPO_ROOT"

# Check if skill already exists
echo "Checking for existing skill..."
EXISTING=$(curl -sS "https://api.anthropic.com/v1/skills?source=custom" \
    -H "x-api-key: $ANTHROPIC_API_KEY" \
    -H "anthropic-version: 2023-06-01" \
    -H "anthropic-beta: skills-2025-10-02")

SKILL_ID=$(echo "$EXISTING" | jq -r '.data[] | select(.display_title == "Developing in Lightdash") | .id // empty' 2>/dev/null | head -1)

if [ -n "$SKILL_ID" ]; then
    echo "Skill already exists: $SKILL_ID"
    echo "To create a new version, archive the existing one first."
else
    echo "Collecting skill files..."

    # Build the -F arguments dynamically
    CURL_ARGS=()
    while IFS= read -r file; do
        CURL_ARGS+=(-F "files[]=@${file};filename=${file#skills/}")
    done < <(find "$SKILL_DIR" -type f -o -type l | sort)

    echo "Uploading ${#CURL_ARGS[@]} files to Anthropic Skills API..."

    RESPONSE=$(curl -sS -X POST "https://api.anthropic.com/v1/skills" \
        -H "x-api-key: $ANTHROPIC_API_KEY" \
        -H "anthropic-version: 2023-06-01" \
        -H "anthropic-beta: skills-2025-10-02" \
        -F "display_title=Developing in Lightdash" \
        "${CURL_ARGS[@]}")

    SKILL_ID=$(echo "$RESPONSE" | jq -r '.id // empty')

    if [ -z "$SKILL_ID" ]; then
        echo "Error uploading skill:"
        echo "$RESPONSE" | jq .
        exit 1
    fi

    echo "Skill uploaded!"
fi

echo ""
echo "Skill ready!"
echo "  ID: $SKILL_ID"
echo ""
echo "Add to your .env:"
echo "  MANAGED_AGENT_SKILL_ID=$SKILL_ID"

# Optionally attach to an agent
if [ -n "${AGENT_ID:-}" ]; then
    echo ""
    echo "Attaching skill to agent $AGENT_ID..."

    # Get current agent version
    AGENT_RESPONSE=$(curl -sS "https://api.anthropic.com/v1/agents/$AGENT_ID" \
        -H "x-api-key: $ANTHROPIC_API_KEY" \
        -H "anthropic-version: 2023-06-01" \
        -H "anthropic-beta: managed-agents-2026-04-01")

    AGENT_VERSION=$(echo "$AGENT_RESPONSE" | jq -r '.version // empty')

    if [ -z "$AGENT_VERSION" ]; then
        echo "Error: Could not get agent version"
        echo "$AGENT_RESPONSE" | jq .
        exit 1
    fi

    UPDATE_RESPONSE=$(curl -sS -X PATCH "https://api.anthropic.com/v1/agents/$AGENT_ID" \
        -H "x-api-key: $ANTHROPIC_API_KEY" \
        -H "anthropic-version: 2023-06-01" \
        -H "anthropic-beta: managed-agents-2026-04-01" \
        -H "content-type: application/json" \
        -d "{
            \"version\": $AGENT_VERSION,
            \"skills\": [
                {\"type\": \"custom\", \"skill_id\": \"$SKILL_ID\", \"version\": \"latest\"}
            ]
        }")

    NEW_VERSION=$(echo "$UPDATE_RESPONSE" | jq -r '.version // empty')

    if [ -z "$NEW_VERSION" ]; then
        echo "Error attaching skill to agent:"
        echo "$UPDATE_RESPONSE" | jq .
        exit 1
    fi

    echo "Skill attached to agent $AGENT_ID (version $AGENT_VERSION -> $NEW_VERSION)"
fi
