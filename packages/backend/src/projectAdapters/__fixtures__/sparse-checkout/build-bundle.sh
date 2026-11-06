#!/usr/bin/env bash
set -euo pipefail

fixtures="$(cd "$(dirname "$0")" && pwd)"
bundle="$fixtures/sparse-checkout.bundle"
if [[ -e "$bundle" ]]; then
    printf 'Bundle already exists; obtain approval before replacing it.\n' >&2
    exit 1
fi
temporary="$(mktemp -d "${TMPDIR:-/tmp}/sparse-checkout-fixture.XXXXXX")"
trap 'rm -rf "$temporary"' EXIT
export GIT_AUTHOR_DATE='2026-01-01T00:00:00Z'
export GIT_COMMITTER_DATE='2026-01-01T00:00:00Z'

printf 'Creating two signed fixture-only commits. Approve each normal Touch ID prompt.\n'
git -C "$temporary" init -q -b main
for revision in 1 2; do
    cp -R "$fixtures/tree/$revision/." "$temporary/"
    git -C "$temporary" add -A
    git -C "$temporary" commit -S -q -m "fixture: sparse checkout revision $revision"
    git -C "$temporary" cat-file commit HEAD | grep '^gpgsig ' > /dev/null
done
git -C "$temporary" bundle create "$temporary/sparse-checkout.bundle" main
git -C "$temporary" bundle verify "$temporary/sparse-checkout.bundle"
cp "$temporary/sparse-checkout.bundle" "$bundle"
printf 'Created %s\n' "$bundle"
