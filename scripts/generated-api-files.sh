#!/bin/sh
# Toggle git's skip-worktree bit on the generated API artifacts so local
# regeneration (pnpm generate-api) stops showing as uncommitted changes.
# The files stay tracked in git — the release workflow commits refreshed
# versions on main; feature branches must never commit them (the pre-commit
# hook unstages them).
set -eu

GENERATED_API_FILES="packages/backend/src/generated/routes.ts packages/backend/src/generated/swagger.json"

cd "$(git rev-parse --show-toplevel)"

case "${1:-status}" in
  hide)
    for f in $GENERATED_API_FILES; do
      git update-index --skip-worktree "$f"
    done
    echo "Local changes to generated API artifacts are now hidden from git status."
    echo "Caveat: if git pull/checkout/rebase fails because these files changed"
    echo "upstream, run '$0 show', retry, then '$0 hide' again."
    ;;
  show)
    for f in $GENERATED_API_FILES; do
      git update-index --no-skip-worktree "$f"
    done
    echo "Local changes to generated API artifacts will show in git status again."
    ;;
  status)
    # git ls-files -v prefixes skip-worktree entries with S
    git ls-files -v -- $GENERATED_API_FILES | while read -r flag path; do
      case "$flag" in
        S) echo "hidden  $path" ;;
        *) echo "shown   $path" ;;
      esac
    done
    ;;
  *)
    echo "usage: $0 [hide|show|status]" >&2
    exit 2
    ;;
esac
