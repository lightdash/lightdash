#!/usr/bin/env bash
# Create or destroy the Rainbow Machine environment the e2e suite runs against.
#
#   rainbow-e2e-env.sh up   <branch> <name>   # prints the env URL on stdout
#   rainbow-e2e-env.sh down <name>
#
# The environment is the branch's ordinary preview parent forked and made into
# the recipe's `e2e` profile (rainbow.toml [profile.e2e]): the production
# bundle built in the fork and served by the backend. It lives for one
# workflow run; `down` at the end frees it, and an idle one is swept anyway.
#
# Talks JSON-RPC to the MCP endpoint with a bearer token. create_env is a
# resumable tool: a call the server cuts off after 90 s answers "still
# working", and calling again with the same arguments picks the work up.
set -euo pipefail

: "${RAINBOW_MCP_URL:=https://mcp.lightdash.rainbowmachine.dev/mcp}"
: "${RAINBOW_MCP_TOKEN:?RAINBOW_MCP_TOKEN is required}"

call() { # call <tool> <json arguments>
  curl -sS --fail-with-body --max-time 120 "$RAINBOW_MCP_URL" \
    -H "Authorization: Bearer $RAINBOW_MCP_TOKEN" \
    -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"$1\",\"arguments\":$2}}"
}

case "${1:-}" in
  up)
    branch=$2; name=$3
    args=$(jq -cn --arg b "$branch" --arg n "$name" '{branch:$b, name:$n, profile:"e2e", repo:"lightdash/lightdash"}')
    deadline=$((SECONDS + 1500))
    while :; do
      out=$(call create_env "$args")
      if [ "$(jq -r '.result.isError // false' <<<"$out")" != "true" ] && jq -e '.result.structuredContent.url' <<<"$out" >/dev/null; then
        jq -r '.result.structuredContent | "env \(.env) \(.how) in \(.took_ms) ms (profile \(.profile))"' <<<"$out" >&2
        jq -r '.result.structuredContent.url' <<<"$out"
        exit 0
      fi
      msg=$(jq -r '.result.content[0].text // .error.message // "unknown error"' <<<"$out")
      if [[ "$msg" == *"still working"* ]] && [ $SECONDS -lt $deadline ]; then
        echo "create_env: $msg" >&2
        sleep 5
        continue
      fi
      echo "create_env failed: $msg" >&2
      exit 1
    done
    ;;
  down)
    name=$2
    out=$(call kill_env "$(jq -cn --arg n "$name" '{env:$n}')")
    jq -r '.result.content[0].text' <<<"$out" >&2
    ;;
  *)
    echo "usage: $0 up <branch> <name> | down <name>" >&2; exit 2;;
esac
