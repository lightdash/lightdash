#!/usr/bin/env bash
# Lists files under the given paths that changed since the release before
# RELEASE_TAG. package.json files whose only change is the release version
# bump are ignored. Exits 10 when there is no previous release tag.
#
# Usage: sandbox-image-changes.sh <release-tag> <path>...
set -euo pipefail

if [ "$#" -lt 2 ]; then
    echo "Usage: $0 <release-tag> <path>..." >&2
    exit 1
fi
RELEASE_TAG="$1"
shift

PREVIOUS_TAG=$(git tag --sort=-version:refname \
    | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' \
    | grep -A1 -x -F "$RELEASE_TAG" | tail -1 || true)
if [ -z "$PREVIOUS_TAG" ] || [ "$PREVIOUS_TAG" = "$RELEASE_TAG" ]; then
    echo "No release tag found before $RELEASE_TAG" >&2
    exit 10
fi
echo "Comparing $PREVIOUS_TAG..$RELEASE_TAG" >&2

without_version() {
    git show "$1:$2" 2>/dev/null | jq -S 'del(.version)' 2>/dev/null
}

git diff --name-only "$PREVIOUS_TAG" "$RELEASE_TAG" -- "$@" | while IFS= read -r file; do
    if [ "$(basename "$file")" = package.json ]; then
        before=$(without_version "$PREVIOUS_TAG" "$file" || true)
        after=$(without_version "$RELEASE_TAG" "$file" || true)
        if [ -n "$before" ] && [ "$before" = "$after" ]; then
            continue
        fi
    fi
    echo "$file"
done
