#!/usr/bin/env bash
# Emit this Lightdash dev instance's web URL as a claude-hud extra-cmd segment.
#
# Output (stdout): {"label":"🟢 http://localhost:<FE>"} when the frontend is up,
# a muted variant when the instance is assigned but down, and NOTHING (exit 0)
# when the cwd isn't a Lightdash worktree with an assigned slot — so it's silent
# everywhere else. Designed to be fast (statusline budget): a single 0.3s TCP probe.
#
# Wire it into claude-hud via `--extra-cmd` (see the /docker-dev "Statusline" note).
# Run directly with `--plain` to just print the URL for humans.

set -uo pipefail

root="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
id="$(basename "$root")"
inst="$HOME/.lightdash/dev-instances/${id}.json"
[ -f "$inst" ] || exit 0

fe="$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['ports']['frontend'])" "$inst" 2>/dev/null)" || exit 0
[ -n "$fe" ] || exit 0
url="http://localhost:${fe}"

if [ "${1:-}" = "--plain" ]; then
    echo "$url"
    exit 0
fi

# Fast liveness probe (instant on localhost, refused or accepted).
if python3 -c "import socket,sys; s=socket.socket(); s.settimeout(0.3); sys.exit(0 if s.connect_ex(('127.0.0.1', int(sys.argv[1])))==0 else 1)" "$fe" 2>/dev/null; then
    label="🟢 ${url}"
else
    label="⚪ localhost:${fe}"
fi

python3 -c "import json,sys; print(json.dumps({'label': sys.argv[1]}, ensure_ascii=False))" "$label"
