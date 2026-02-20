Migrate .claude/ content to .agents/ equivalents. Run after git pull to regenerate.

Commands and skills are both output as skills (most AI tools don't have a separate "commands" concept).

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

Copy each command into .agents/skills/. Commands are plain markdown without frontmatter, so prepend a YAML frontmatter block with name and description derived from the file content:

for f in .claude/commands/*.md; do
  [ -f "$f" ] || continue
  NAME=$(basename "$f" .md)
  FIRST_LINE=$(head -1 "$f")
  cat > ".agents/skills/$NAME.md" <<EOF
---
name: $NAME
description: $FIRST_LINE
---

$(cat "$f")
EOF
done

### 4. Copy skills

for dir in .claude/skills/*/; do
  SKILL_NAME=$(basename "$dir")
  [ -f "$dir/SKILL.md" ] && cp "$dir/SKILL.md" ".agents/skills/$SKILL_NAME.md"
done

### 5. Report

echo "=== Migration complete ==="
find .agents/ -type f | sort
