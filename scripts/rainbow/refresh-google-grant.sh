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

show_export_failure() {
    local diagnostic='^Rainbow Google Sheets grant failed \((GoogleGrantError|DatabaseError|Error|TypeError|TimeoutError|UnknownError), ([A-Z0-9_]+|unknown)\)\.$'
    local code
    local line
    while IFS= read -r line; do
        if [[ "$line" =~ $diagnostic ]]; then
            code="${BASH_REMATCH[2]}"
            case "$code" in
                GOOGLE_GRANT_REFRESH_REJECTED|GOOGLE_GRANT_ACCESS_TOKEN_MISSING)
                    printf 'Google did not issue an access token: %s\n' "$code" >&2
                    ;;
                GOOGLE_GRANT_NOT_CONNECTED|GOOGLE_GRANT_CLIENT_MISSING|GOOGLE_GRANT_PREVIEW_ONLY|GOOGLE_GRANT_INTERACTIVE_EXPORT|GOOGLE_GRANT_INVALID_ACTION|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|42P01|28P01)
                    printf 'Export failed: %s, %s\n' "${BASH_REMATCH[1]}" "$code" >&2
                    ;;
                *)
                    printf 'Export failed: %s, unknown code.\n' "${BASH_REMATCH[1]}" >&2
                    ;;
            esac
            return
        fi
    done <<< "$1"
    echo 'Export failed: no recognized guest diagnostic.' >&2
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
    rainbow exec "$1" 'systemd-run --quiet --pipe --wait --collect -p EnvironmentFile=/etc/lightdash.env -p EnvironmentFile=-/run/rainbow/secrets.env --working-directory=/usr/app/packages/backend /usr/local/bin/node --import tsx src/scripts/rainbow/googleGrant.ts export' 2>&1
)"; then
    show_export_failure "$refresh_token"
    exit 1
fi

if [[ -z "$refresh_token" || "$refresh_token" =~ [[:space:]] || "$refresh_token" == '[redacted:'* ]]; then
    echo 'Export returned an empty, malformed, or redacted value.' >&2
    exit 1
fi

if ! printf '%s' "$refresh_token" |
    rainbow secrets set -repo lightdash/lightdash -kind oauth-refresh-token GOOGLE_SHEETS_TEST_REFRESH_TOKEN >/dev/null 2>&1; then
    echo 'Could not store the Google Sheets grant in Rainbow.' >&2
    exit 1
fi

echo 'ok'
