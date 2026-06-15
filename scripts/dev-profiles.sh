#!/usr/bin/env bash
# Resolve /docker-dev instance profiles from scripts/dev-profiles.json.
#
# Usage:
#   dev-profiles.sh list                    # print available profiles (label + description)
#   dev-profiles.sh resolve <name[,name...]> # expand `requires` transitively; print resolved plan as JSON
#
# The resolved JSON has: { ee, profiles[], secrets[], flags[], env{}, orgSettings{}, reconcile[], verify[] }
# The /docker-dev skill consumes this to know which 1Password items to pull (via dev-op-pull.sh),
# which feature flags + env to write, which reconcile steps (e.g. github setup) to run, and how to verify.

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROFILES="$SCRIPT_DIR/dev-profiles.json"
[ -f "$PROFILES" ] || { echo "dev-profiles: not found: $PROFILES" >&2; exit 1; }

MODE="${1:-}"; shift || true

case "$MODE" in
  list)
    python3 - "$PROFILES" <<'PY'
import json, sys
p = json.load(open(sys.argv[1]))["profiles"]
for name, d in p.items():
    print(f"{name:20s} {d.get('label','')}")
    if d.get('description'): print(f"{'':20s}   {d['description']}")
PY
    ;;

  resolve)
    SEL="${1:-}"
    [ -n "$SEL" ] || { echo "dev-profiles resolve: give profile name(s), comma-separated" >&2; exit 2; }
    SEL="$SEL" python3 - "$PROFILES" <<'PY'
import json, os, sys
data = json.load(open(sys.argv[1]))
profiles = data["profiles"]
sel = [s.strip() for s in os.environ["SEL"].split(",") if s.strip()]

order, seen = [], set()
def visit(name):
    if name in seen: return
    if name not in profiles:
        sys.stderr.write(f"unknown profile: {name}\n"); sys.exit(3)
    seen.add(name)
    for req in profiles[name].get("requires", []):
        visit(req)
    order.append(name)

for s in sel: visit(s)

def uniq(seq):
    out, s = [], set()
    for x in seq:
        if x not in s: s.add(x); out.append(x)
    return out

plan = {"ee": False, "profiles": order, "secrets": [], "flags": [],
        "env": {}, "orgSettings": {}, "reconcile": [], "verify": []}
for name in order:
    d = profiles[name]
    if d.get("ee"): plan["ee"] = True
    plan["secrets"] += d.get("secrets", [])
    plan["flags"] += d.get("flags", [])
    plan["reconcile"] += d.get("reconcile", [])
    plan["verify"] += d.get("verify", [])
    plan["env"].update(d.get("env", {}))
    plan["orgSettings"].update(d.get("orgSettings", {}))
for k in ("secrets", "flags", "reconcile", "verify", "profiles"):
    plan[k] = uniq(plan[k])
print(json.dumps(plan, indent=2))
PY
    ;;

  *)
    echo "Usage: dev-profiles.sh {list|resolve <name[,name...]>}" >&2
    exit 2
    ;;
esac
