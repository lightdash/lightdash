#!/usr/bin/env bash
# Executable post-start reconcile for /docker-dev profiles. Supplies the environment
# truths the reconcile needs and dispatches to scripts/dev-github-reconcile.cjs:
#   - RUNNING_SECRET: the LIGHTDASH_SECRET of the *running* pm2 api process (can differ
#     from the env file's quoted value; that's the secret the backend decrypts with).
#   - PG connection from the claimed slot; GitHub App creds from .env.development.local.
#
# Usage (step names match dev-profiles.json `reconcile` + verify):
#   dev-reconcile.sh github-app-installation
#   dev-reconcile.sh github-dbt-repo
#   dev-reconcile.sh github-dbt-repoint repo=owner/name branch=main subpath=/dbt
#   dev-reconcile.sh org-settings ai_agent_reviews_enabled=true
#   dev-reconcile.sh verify-token
#   dev-reconcile.sh all            # installation -> dbt-repo-check -> verify-token

set -uo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT" || { echo "FAIL: reconcile -- cannot cd to repo root" >&2; exit 1; }

eval "$(./scripts/dev-ports.sh env 2>/dev/null)" || { echo "FAIL: reconcile -- dev-ports.sh env failed" >&2; exit 1; }
: "${LD_INSTANCE_ID:?}" "${LD_PG_PORT:?}"

ENV_FILE=".env.development.local"
[ -f "$ENV_FILE" ] || { echo "FAIL: reconcile -- $ENV_FILE missing (run the profile setup first)" >&2; exit 1; }

# The secret the backend actually decrypts with — read from the running pm2 api process.
# Match the api process by its instance-prefixed name first; if pnpm pm2:start named it
# generically (e.g. `lightdash-api`), fall back to the api whose pm_cwd is in THIS worktree.
RUNNING_SECRET="$(pm2 jlist 2>/dev/null | LD_INSTANCE_ID="$LD_INSTANCE_ID" REPO_ROOT="$REPO_ROOT" python3 -c "
import sys, json, os
inst = os.environ['LD_INSTANCE_ID']; root = os.environ['REPO_ROOT']
try: ps = json.load(sys.stdin)
except Exception: ps = []
api = [p for p in ps if p.get('name') == inst + '-api']
if not api:
    api = [p for p in ps if p.get('name','').endswith('-api')
           and (p.get('pm2_env',{}).get('pm_cwd','') or '').startswith(root)]
print(api[0]['pm2_env'].get('LIGHTDASH_SECRET', '') if api else '')
" 2>/dev/null)"
if [ -z "$RUNNING_SECRET" ]; then
    # Fall back to the env-file value (dequoted) if the api isn't up yet.
    RUNNING_SECRET="$(grep '^LIGHTDASH_SECRET=' .env.development 2>/dev/null | head -1 | cut -d= -f2-)"
    RUNNING_SECRET="${RUNNING_SECRET%\"}"; RUNNING_SECRET="${RUNNING_SECRET#\"}"
    [ -n "$RUNNING_SECRET" ] && echo "WARN: pm2 api not found; using .env.development secret (may differ from a running backend)"
fi
[ -n "$RUNNING_SECRET" ] || { echo "FAIL: reconcile -- could not determine LIGHTDASH_SECRET" >&2; exit 1; }

GITHUB_APP_ID="$(grep '^GITHUB_APP_ID=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
GITHUB_PRIVATE_KEY="$(grep '^GITHUB_PRIVATE_KEY=' "$ENV_FILE" | head -1 | cut -d= -f2-)"

# The dev GitHub App is shared and has many installations, so the reconcile must
# target YOUR account. Resolve from $GH_ACCOUNT, then the per-engineer local config.
if [ -z "${GH_ACCOUNT:-}" ]; then
    GH_ACCOUNT="$(python3 -c "
import json, os
p = os.path.expanduser('${LD_SECRETS_LOCAL:-$HOME/.lightdash/dev-secrets.local.json}')
print(json.load(open(p)).get('githubAccount', '') if os.path.exists(p) else '')
" 2>/dev/null)"
fi

run_cjs() {
    RUNNING_SECRET="$RUNNING_SECRET" \
    GITHUB_APP_ID="$GITHUB_APP_ID" GITHUB_PRIVATE_KEY="$GITHUB_PRIVATE_KEY" \
    GH_ACCOUNT="${GH_ACCOUNT:-}" \
    PGHOST=localhost PGPORT="$LD_PG_PORT" PGUSER=postgres PGPASSWORD=password PGDATABASE=postgres \
    NODE_PATH="$REPO_ROOT/packages/backend/node_modules" \
    node "$REPO_ROOT/scripts/dev-github-reconcile.cjs" "$@"
}

STEP="${1:-}"; shift || true
case "$STEP" in
    github-app-installation) run_cjs installation ;;
    github-dbt-repo)         run_cjs dbt-repo-check ;;
    github-dbt-repoint)      run_cjs dbt-repo-repoint "$@" ;;
    org-settings)            run_cjs org-settings "$@" ;;
    verify-token|verify)     run_cjs verify-token ;;
    list-accounts)           run_cjs list-accounts ;;
    save-github-account)
        ACCT="${1:-}"; [ -n "$ACCT" ] || { echo "usage: dev-reconcile.sh save-github-account <github-login>" >&2; exit 2; }
        ACCT="$ACCT" LF="${LD_SECRETS_LOCAL:-$HOME/.lightdash/dev-secrets.local.json}" python3 -c "
import json, os
p = os.environ['LF']; os.makedirs(os.path.dirname(p), exist_ok=True)
d = {}
if os.path.exists(p):
    try: d = json.load(open(p))
    except Exception: d = {}
d['githubAccount'] = os.environ['ACCT']
json.dump(d, open(p, 'w'), indent=2)
print(f\"OK: saved githubAccount={os.environ['ACCT']} in {p}\")
" ;;
    all)
        run_cjs installation && run_cjs dbt-repo-check && run_cjs verify-token ;;
    "")
        echo "Usage: dev-reconcile.sh {github-app-installation|github-dbt-repo|org-settings k=v|verify-token|all}" >&2; exit 2 ;;
    *)                       run_cjs "$STEP" "$@" ;;
esac
