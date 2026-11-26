#!/usr/bin/env bash
set +x
set -euo pipefail

if [[ $# -ne 1 || ! "$1" =~ ^e-[a-z0-9]+$ ]] || ! command -v rainbow >/dev/null; then
    cat >&2 <<'EOF'
After reconnecting the shared Google test account as the seeded admin on gsheets:
1. Ask a Rainbow operator to open a shell on the host that serves lightdash/lightdash.
2. Run `rainbow ls` and find the environment ID for gsheets.
3. Run `bash scripts/rainbow/refresh-google-grant.sh e-<id>` on that host.
   The script sends the token to `rainbow secrets set` on stdin.
   Do not run the guest export through MCP exec or print the token.
EOF
    exit 2
fi

refresh_token="$(
    rainbow exec "$1" 'systemd-run --quiet --pipe --wait --collect -p EnvironmentFile=/etc/lightdash.env -p EnvironmentFile=-/run/rainbow/secrets.env --working-directory=/usr/app/packages/backend /usr/local/bin/node --import tsx src/scripts/rainbow/googleGrant.ts export'
)"

if [[ -z "$refresh_token" || "$refresh_token" =~ [[:space:]] || "$refresh_token" == '[redacted:'* ]]; then
    echo 'The guest did not return a usable grant. No Rainbow secret was changed.' >&2
    exit 1
fi

printf '%s' "$refresh_token" |
    rainbow secrets set -repo lightdash/lightdash -kind oauth-refresh-token GOOGLE_SHEETS_TEST_REFRESH_TOKEN
