Migrate .claude/ content to .agents/ equivalents. Run after git pull to regenerate.

Commands and skills are both output as skills (most AI tools don't have a separate "commands" concept).

Skill discovery context:
- Agents only discover skills listed in `AGENTS.md` under a `## Skills` section.
- Skill files should use canonical `SKILL.md` paths (for example: `.agents/skills/docker-dev/SKILL.md`).
- Skill availability is usually resolved at session start, so restart the agent session after migration.

## Steps

### 1. Clean existing .agents/ directory

rm -rf .agents/
mkdir -p .agents/skills

### 2. Copy package-level CLAUDE.md → AGENTS.md

Find all CLAUDE.md files outside .claude/ and copy them as AGENTS.md in the same directory:

find . -name "CLAUDE.md" \
  -not -path "./.claude/*" \
  -not -path "./node_modules/*" \
  -not -path "./.git/*" \
  -not -path "./.agents/*" | while read f; do
  DIR=$(dirname "$f")
  cp "$f" "$DIR/AGENTS.md"
done

### 3. Convert commands to skills

Copy each command into `.agents/skills/<name>/SKILL.md`. Commands are plain markdown without frontmatter, so prepend a YAML frontmatter block with name and description derived from the file content:

for f in .claude/commands/*.md; do
  [ -f "$f" ] || continue
  NAME=$(basename "$f" .md)
  FIRST_LINE=$(head -1 "$f")
  mkdir -p ".agents/skills/$NAME"
  SAFE_DESC=$(echo "$FIRST_LINE" | sed 's/`//g')
  cat > ".agents/skills/$NAME/SKILL.md" <<EOF
---
name: $NAME
description: "$SAFE_DESC"
---

$(cat "$f")
EOF
done

### 4. Copy skills

for dir in .claude/skills/*/; do
  SKILL_NAME=$(basename "$dir")
  [ -f "$dir/SKILL.md" ] || continue
  mkdir -p ".agents/skills/$SKILL_NAME"
  cp "$dir/SKILL.md" ".agents/skills/$SKILL_NAME/SKILL.md"
done

### 5. Register generated skills in root AGENTS.md

Append/update a generated section so agents can discover local skills:

TMP_SKILLS=$(mktemp)
{
  echo "## Skills"
  echo "A skill is a set of local instructions to follow that is stored in a \`SKILL.md\` file. Below is the list of skills that can be used. Each entry includes a name, description, and file path so you can open the source for full instructions when using a specific skill."
  echo "### Available skills"
  find .agents/skills -name "SKILL.md" -type f | sort | while read skill; do
    NAME=$(sed -n 's/^name:[[:space:]]*//p' "$skill" | head -1)
    DESC=$(sed -n 's/^description:[[:space:]]*//p' "$skill" | head -1)
    [ -z "$NAME" ] && NAME=$(basename "$(dirname "$skill")")
    [ -z "$DESC" ] && DESC="(no description provided)"
    echo "- $NAME: $DESC (file: $(pwd)/$skill)"
  done
} > "$TMP_SKILLS"

# Replace existing generated skills section if present, else append.
if grep -q "^## Skills$" AGENTS.md; then
  awk '
    BEGIN { skip=0 }
    /^## Skills$/ { skip=1; next }
    /^## / && skip==1 { skip=0; print }
    skip==0 { print }
  ' AGENTS.md > AGENTS.md.tmp
  mv AGENTS.md.tmp AGENTS.md
fi

{
  echo
  cat "$TMP_SKILLS"
} >> AGENTS.md

rm -f "$TMP_SKILLS"

### 6. Generate Codex MCP config from .mcp.json

if [ -f .mcp.json ]; then
  mkdir -p .codex
  {
    echo "# Auto-generated from .mcp.json by migrate-to-agents"
    echo ""
    jq -r '
      .mcpServers | to_entries[] |
      "[mcp_servers.\(.key)]",
      (if .value.command then "command = \"\(.value.command)\"" else empty end),
      (if .value.args then "args = [\(.value.args | map("\"" + . + "\"") | join(", "))]" else empty end),
      (if .value.url then "url = \"\(.value.url)\"" else empty end),
      ""
    ' .mcp.json
  } > .codex/config.toml
  echo "Generated .codex/config.toml"
fi

### 7. Report

echo "=== Migration complete ==="
find .agents/ -type f | sort
