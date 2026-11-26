#!/usr/bin/env bash
set +x
set -euo pipefail

show_operator_instructions() {
    cat >&2 <<'EOF'
After reconnecting the shared Google test account as the seeded admin on gsheets:
1. Ask a Rainbow operator to open a shell on the host that serves lightdash/lightdash.
2. Run `rainbow ls` and find the environment ID for gsheets.
3. Run `bash scripts/rainbow/refresh-google-grant.sh e-<id>` on that host.
   The script sends the token to `rainbow secrets set` on stdin.
   Do not run the guest export through MCP exec or print the token.
EOF
}

if [[ $# -ne 1 || ! "$1" =~ ^e-[a-z0-9]+$ ]] || ! command -v rainbow >/dev/null; then
    show_operator_instructions
    exit 2
fi

if ! rainbow ls | awk -F '\t' -v id="$1" '
    $1 == id && ($2 == "name=gsheets" || $2 == "name=lightdash/gsheets") { found = 1 }
    END { exit !found }
'; then
    echo 'Could not verify that the environment ID belongs to gsheets.' >&2
    show_operator_instructions
    exit 2
fi

if ! refresh_token="$(
    rainbow exec "$1" 'systemd-run --quiet --pipe --wait --collect -p EnvironmentFile=/etc/lightdash.env -p EnvironmentFile=-/run/rainbow/secrets.env --working-directory=/usr/app/packages/backend /usr/local/bin/node --import tsx src/scripts/rainbow/googleGrant.ts export' 2>/dev/null
)"; then
    echo 'fail' >&2
    exit 1
fi

if [[ -z "$refresh_token" || "$refresh_token" =~ [[:space:]] || "$refresh_token" == '[redacted:'* ]]; then
    echo 'fail' >&2
    exit 1
fi

if ! printf '%s' "$refresh_token" |
    rainbow secrets set -repo lightdash/lightdash -kind oauth-refresh-token GOOGLE_SHEETS_TEST_REFRESH_TOKEN >/dev/null 2>&1; then
    echo 'fail' >&2
    exit 1
fi

echo 'ok'
