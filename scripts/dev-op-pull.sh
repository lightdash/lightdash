#!/usr/bin/env bash
# Pull local-dev secrets from 1Password into .env.development.local, driven by
# scripts/dev-secrets.manifest.json. Used by the /docker-dev profile flow.
#
# Why this exists: bare `op item get` inside command-substitution is flaky until
# the biometric session is warm, and batching calls in one subshell intermittently
# returns empty / "unknown flag". This script warms the session once, then pulls
# each secret in its own call with explicit --account, writes straight to the env
# file (never echoing values), and verifies the expected prefix.
#
# Usage:
#   dev-op-pull.sh list  <SECRET_KEY...>      # print the 1Password items that WILL be read (approval gate); no values
#   dev-op-pull.sh pull  <SECRET_KEY...>      # pull + write to env file; prints only key names + verify status
#   dev-op-pull.sh check                      # report whether `op` is signed in to the manifest account
# Options: --env-file <path> (default .env.development.local), --manifest <path>
#
# SECRET_KEY is a top-level key under "secrets" in the manifest (e.g. LIGHTDASH_LICENSE_KEY, GITHUB_APP).

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST="$SCRIPT_DIR/dev-secrets.manifest.json"
ENV_FILE=".env.development.local"

MODE="${1:-}"; shift || true
KEYS=()
while [ $# -gt 0 ]; do
    case "$1" in
        --env-file) ENV_FILE="$2"; shift 2 ;;
        --manifest) MANIFEST="$2"; shift 2 ;;
        --*) echo "dev-op-pull: unknown option $1" >&2; exit 2 ;;
        *) KEYS+=("$1"); shift ;;
    esac
done

[ -f "$MANIFEST" ] || { echo "dev-op-pull: manifest not found: $MANIFEST" >&2; exit 1; }
# Per-engineer overrides (item names, account) — deep-merged over the committed manifest
# so nothing is hardcoded to one person. Lives in $HOME (survives worktree recreation).
LOCAL_MANIFEST="${LD_SECRETS_LOCAL:-$HOME/.lightdash/dev-secrets.local.json}"

ACCOUNT="$(MANIFEST="$MANIFEST" LOCAL="$LOCAL_MANIFEST" python3 -c "
import json, os
m = json.load(open(os.environ['MANIFEST']))
acct = m.get('account', '')
lp = os.environ.get('LOCAL', '')
if lp and os.path.exists(lp):
    try: acct = json.load(open(lp)).get('account', acct)
    except Exception: pass
print(acct)
")"

manifest_field() { # key field
    MANIFEST="$MANIFEST" LOCAL="$LOCAL_MANIFEST" python3 - "$1" "$2" <<'PY'
import json, os, sys
m = json.load(open(os.environ['MANIFEST']))
lp = os.environ.get('LOCAL', '')
if lp and os.path.exists(lp):
    try:
        lm = json.load(open(lp))
        for k, ov in (lm.get('secrets') or {}).items():
            m['secrets'].setdefault(k, {}).update(ov)
    except Exception:
        pass
s = m['secrets'].get(sys.argv[1], {})
v = s.get(sys.argv[2], '')
print('\n'.join(v) if isinstance(v, list) else v)
PY
}

op_signed_in() { op whoami --account "$ACCOUNT" >/dev/null 2>&1; }

# Ensure a usable session WITHOUT bouncing to the user. The `op` session does NOT
# survive across separate shells, so callers that pull must sign in and read in the
# SAME invocation (the `pull` mode does). `eval "$(op signin ...)"` covers both modes:
# in manual mode it captures the printed `export OP_SESSION_...` into this shell; in
# desktop-integration mode it triggers Touch ID and prints nothing (eval of "" is a
# no-op). Skips entirely when already signed in, so there's no repeated prompt.
ensure_signin() {
    op_signed_in && return 0
    eval "$(op signin --account "$ACCOUNT" 2>/dev/null)" || true
    op_signed_in
}

# Parse an `export KEY=""value""` block from $RAW; args are the wanted KEY names.
# Prints "KEY<TAB>VALUE" lines. Defined as a function so the heredoc is NOT inside
# a $(...) — bash 3.2 mis-parses heredocs nested in command substitution.
parse_env_block() {
    RAW="${RAW:-}" python3 - "$@" <<'PY'
import os, re, sys
raw = os.environ.get('RAW', '')
want = set(sys.argv[1:])
for m in re.finditer(r'([A-Z][A-Z0-9_]+)\s*=\s*(.*)', raw):
    key, v = m.group(1), m.group(2).rstrip('\r\n').strip()
    while len(v) >= 2 and v[0] in '"\'' and v[-1] in '"\'':
        v = v[1:-1]
    v = v.rstrip('"').rstrip("'")
    if not want or key in want:
        print(f"{key}\t{v}")
PY
}

case "$MODE" in
  check|signin)
    # Ensure a session, attempting a Touch ID sign-in if needed (don't bounce to the user).
    if ensure_signin; then echo "OK: signed in to $ACCOUNT"; exit 0
    else echo "NOT-SIGNED-IN: \`op signin --account $ACCOUNT\` did not establish a session (is 1Password CLI desktop integration enabled? Settings → Developer). Ask the user to sign in, then retry."; exit 1; fi
    ;;

  discover)
    # Search the engineer's actual vault and rank candidates per secret by matchKeywords.
    # Output JSON the /docker-dev flow uses to ask the user; choices are saved via `save`.
    [ ${#KEYS[@]} -gt 0 ] || { echo "dev-op-pull discover: no secret keys given" >&2; exit 2; }
    ensure_signin || { echo "FAIL: not signed in to $ACCOUNT" >&2; exit 1; }
    ITEMS="$(op item list --account "$ACCOUNT" --format=json 2>/dev/null)"
    [ -n "$ITEMS" ] || { echo "FAIL: could not list 1Password items for $ACCOUNT" >&2; exit 1; }
    MANIFEST="$MANIFEST" LOCAL="$LOCAL_MANIFEST" ITEMS="$ITEMS" python3 - "${KEYS[@]}" <<'PY'
import json, os, sys
m = json.load(open(os.environ['MANIFEST']))
lp = os.environ.get('LOCAL', ''); local = {}
if lp and os.path.exists(lp):
    try: local = json.load(open(lp))
    except Exception: pass
titles = [it.get('title', '') for it in json.loads(os.environ['ITEMS']) if it.get('title')]
out = {}
for key in sys.argv[1:]:
    spec = dict(m['secrets'].get(key, {}))
    ov = (local.get('secrets') or {}).get(key, {})
    spec.update(ov)
    kws = [k.lower() for k in spec.get('matchKeywords', [])]
    scored = []
    for t in titles:
        tl = t.lower()
        s = sum(1 for k in kws if k in tl)
        if s: scored.append((s, t))
    scored.sort(key=lambda x: (-x[0], len(x[1])))
    cands = [{'title': t, 'score': s} for s, t in scored[:5]]
    saved = bool(ov.get('item'))
    confident = saved or len(cands) == 1 or (len(cands) >= 2 and cands[0]['score'] > cands[1]['score'])
    out[key] = {'saved': saved, 'savedItem': ov.get('item'), 'confident': confident,
                'top': cands[0]['title'] if cands else None, 'candidates': cands}
print(json.dumps(out, indent=2))
PY
    ;;

  save)
    KEY="${KEYS[0]:-}"; ITEM="${KEYS[1]:-}"
    { [ -n "$KEY" ] && [ -n "$ITEM" ]; } || { echo "usage: dev-op-pull.sh save <SECRET_KEY> \"<1Password item name>\"" >&2; exit 2; }
    KEY="$KEY" ITEM="$ITEM" LOCAL="$LOCAL_MANIFEST" python3 - <<'PY'
import json, os
p = os.environ['LOCAL']; key = os.environ['KEY']; item = os.environ['ITEM']
os.makedirs(os.path.dirname(p), exist_ok=True)
d = {}
if os.path.exists(p):
    try: d = json.load(open(p))
    except Exception: d = {}
d.setdefault('secrets', {}).setdefault(key, {})['item'] = item
json.dump(d, open(p, 'w'), indent=2)
print(f"OK: saved {key} -> \"{item}\" in {p}")
PY
    ;;

  list)
    [ ${#KEYS[@]} -gt 0 ] || { echo "dev-op-pull list: no secret keys given" >&2; exit 2; }
    echo "The following 1Password items (account: $ACCOUNT) will be read:"
    for k in "${KEYS[@]}"; do
        item="$(manifest_field "$k" item)"
        [ -n "$item" ] || { echo "  - $k: (NOT IN MANIFEST)"; continue; }
        provides="$(manifest_field "$k" provides | paste -sd, - 2>/dev/null)"
        aliases="$(manifest_field "$k" aliases | paste -sd, - 2>/dev/null)"
        target="$k"; [ -n "$provides" ] && target="$provides"; [ -n "$aliases" ] && target="$k,$aliases"
        echo "  - \"$item\"  ->  $target"
    done
    ;;

  pull)
    [ ${#KEYS[@]} -gt 0 ] || { echo "dev-op-pull pull: no secret keys given" >&2; exit 2; }
    # Sign in + read all secrets in THIS one invocation (the session won't cross shells).
    ensure_signin || { echo "FAIL: could not establish a 1Password session for $ACCOUNT (enable CLI desktop integration in 1Password Settings → Developer, or have the user run \`! op signin --account $ACCOUNT\`)" >&2; exit 1; }

    # set_env KEY VALUE  — replace-or-append in ENV_FILE without echoing VALUE
    set_env() {
        local key="$1" val="$2" tmp
        touch "$ENV_FILE"
        tmp="$(mktemp)"
        KEY="$key" VAL="$val" python3 - "$ENV_FILE" > "$tmp" <<'PY'
import os, sys
path = sys.argv[1]; key = os.environ['KEY']; val = os.environ['VAL']
lines = open(path).read().splitlines() if os.path.exists(path) else []
out, seen = [], False
for l in lines:
    if l.startswith(key + "="):
        out.append(f"{key}={val}"); seen = True
    else:
        out.append(l)
if not seen:
    out.append(f"{key}={val}")
sys.stdout.write("\n".join(out) + "\n")
PY
        mv "$tmp" "$ENV_FILE"
    }

    RC=0
    for k in "${KEYS[@]}"; do
        item="$(manifest_field "$k" item)"
        field="$(manifest_field "$k" field)"
        type="$(manifest_field "$k" type)"
        [ -n "$item" ] || { echo "  $k: SKIP (not in manifest)"; RC=1; continue; }

        raw="$(op item get "$item" --account "$ACCOUNT" --fields "label=$field" --reveal 2>/dev/null)"
        if [ -z "$raw" ]; then echo "  $k: FAIL (empty from 1Password — item \"$item\" field \"$field\")"; RC=1; continue; fi

        if [ "$type" = "env-block" ]; then
            # Parse `export KEY=""value""` block (notesPlain doubled-quote gotcha).
            provides=()
            while IFS= read -r _p; do [ -n "$_p" ] && provides+=("$_p"); done < <(manifest_field "$k" provides)
            parsed="$(RAW="$raw" parse_env_block "${provides[@]}")"
            got=()
            while IFS=$'\t' read -r kk vv; do
                [ -n "$kk" ] || continue
                set_env "$kk" "$vv"; got+=("$kk")
            done <<< "$parsed"
            echo "  $k: OK -> ${got[*]:-(none parsed)}"
            [ ${#got[@]} -gt 0 ] || RC=1
        else
            # single-value secret; strip wrapping quotes
            val="${raw%\"}"; val="${val#\"}"
            prefix="$(manifest_field "$k" verifyPrefix)"
            stripped="${val#$prefix}"
            if [ -n "$prefix" ] && [ "$stripped" = "$val" ]; then
                echo "  $k: FAIL (value does not start with expected prefix '$prefix')"; RC=1; continue
            fi
            set_env "$k" "$val"
            written="$k"
            while IFS= read -r alias; do
                [ -n "$alias" ] || continue
                set_env "$alias" "$val"; written="$written,$alias"
            done < <(manifest_field "$k" aliases)
            echo "  $k: OK -> $written (len ${#val})"
        fi
    done
    exit $RC
    ;;

  *)
    echo "Usage: dev-op-pull.sh {list|pull|check} [SECRET_KEY...] [--env-file PATH] [--manifest PATH]" >&2
    exit 2
    ;;
esac
