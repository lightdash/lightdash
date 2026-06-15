#!/usr/bin/env bash
# Scan the FeatureFlags enum and report which flags are enabled for THIS instance.
#
# "Enabled" locally == listed in LIGHTDASH_ENABLE_FEATURE_FLAGS in the env file
# (that's what FeatureFlagModel resolves against). Code-level defaults are prose-only
# (per-org / PostHog) and not machine-readable, so this reports the *local* state plus
# each flag's description, and the /docker-dev picker offers the disabled ones to enable.
#
# Usage:
#   dev-feature-flags.sh scan          [--env-file PATH]   # TSV: value <TAB> ON|off <TAB> EnumName <TAB> description
#   dev-feature-flags.sh list-disabled [--env-file PATH]   # one flag value per line, not currently enabled (for the picker)
#   dev-feature-flags.sh enable <a,b,c> [--env-file PATH]  # merge flags into LIGHTDASH_ENABLE_FEATURE_FLAGS (creates/updates the line)

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FLAGS_TS="$REPO_ROOT/packages/common/src/types/featureFlags.ts"
ENV_FILE=".env.development.local"

MODE="${1:-}"; shift || true
ARGS=()
while [ $# -gt 0 ]; do
    case "$1" in
        --env-file) ENV_FILE="$2"; shift 2 ;;
        --flags-ts) FLAGS_TS="$2"; shift 2 ;;
        *) ARGS+=("$1"); shift ;;
    esac
done

[ -f "$FLAGS_TS" ] || { echo "dev-feature-flags: enum not found: $FLAGS_TS" >&2; exit 1; }

# enabled flags from the env file (comma-separated LIGHTDASH_ENABLE_FEATURE_FLAGS)
current_enabled() {
    [ -f "$ENV_FILE" ] || return 0
    grep "^LIGHTDASH_ENABLE_FEATURE_FLAGS=" "$ENV_FILE" | head -1 | cut -d= -f2- | tr ',' '\n' | sed 's/[[:space:]]//g' | grep -v '^$'
}

# emit TSV: value <TAB> EnumName <TAB> description(first sentence)
parse_enum() {
    python3 - "$FLAGS_TS" <<'PY'
import re, sys
src = open(sys.argv[1]).read()
m = re.search(r'export enum FeatureFlags\s*\{(.*?)\n\}', src, re.S)
body = m.group(1) if m else ''
def clean(c):
    c = re.sub(r'/\*\*?|\*/', '', c)
    c = re.sub(r'^\s*\*\s?', '', c, flags=re.M)
    c = re.sub(r'^\s*//\s?', '', c, flags=re.M)
    c = ' '.join(c.split())
    s = re.split(r'(?<=\.)\s', c)          # first sentence-ish
    return (s[0] if s else c).strip()
# capture the (optional) comment block immediately preceding each `Name = 'value'`
pat = re.compile(r"((?:/\*[\s\S]*?\*/|//[^\n]*\n|\s)*?)(\w+)\s*=\s*'([^']+)'")
for mm in pat.finditer(body):
    comment, name, value = mm.group(1), mm.group(2), mm.group(3)
    cblocks = re.findall(r'/\*[\s\S]*?\*/|//[^\n]*', comment)
    desc = clean(cblocks[-1]) if cblocks else ''
    print(f"{value}\t{name}\t{desc}")
PY
}

case "$MODE" in
  scan)
    enabled="$(current_enabled)"
    parse_enum | while IFS=$'\t' read -r value name desc; do
        state="off"
        echo "$enabled" | grep -qx "$value" && state="ON"
        printf '%s\t%s\t%s\t%s\n' "$value" "$state" "$name" "$desc"
    done
    ;;

  list-disabled)
    enabled="$(current_enabled)"
    parse_enum | while IFS=$'\t' read -r value name desc; do
        echo "$enabled" | grep -qx "$value" || echo "$value"
    done
    ;;

  enable)
    SEL="${ARGS[0]:-}"
    [ -n "$SEL" ] || { echo "dev-feature-flags enable: give flags comma-separated" >&2; exit 2; }
    touch "$ENV_FILE"
    existing="$(current_enabled | paste -sd, -)"
    merged="$(printf '%s,%s' "$existing" "$SEL" | tr ',' '\n' | sed 's/[[:space:]]//g' | grep -v '^$' | awk '!seen[$0]++' | paste -sd, -)"
    tmp="$(mktemp)"
    MERGED="$merged" python3 - "$ENV_FILE" > "$tmp" <<'PY'
import os, sys
path = sys.argv[1]; val = os.environ['MERGED']
lines = open(path).read().splitlines() if os.path.exists(path) else []
out, seen = [], False
for l in lines:
    if l.startswith('LIGHTDASH_ENABLE_FEATURE_FLAGS='):
        out.append(f'LIGHTDASH_ENABLE_FEATURE_FLAGS={val}'); seen = True
    else:
        out.append(l)
if not seen:
    out.append(f'LIGHTDASH_ENABLE_FEATURE_FLAGS={val}')
sys.stdout.write('\n'.join(out) + '\n')
PY
    mv "$tmp" "$ENV_FILE"
    echo "OK: LIGHTDASH_ENABLE_FEATURE_FLAGS=$merged"
    ;;

  *)
    echo "Usage: dev-feature-flags.sh {scan|list-disabled|enable <a,b,c>} [--env-file PATH]" >&2
    exit 2
    ;;
esac
