#!/usr/bin/env bash
# Build the checkout's SDK and pack it under the filename the images expect.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DESTINATION="${1:-$SCRIPT_DIR}"
mkdir -p "$DESTINATION"
DESTINATION="$(cd "$DESTINATION" && pwd)"
PACK_DIR=$(mktemp -d)
trap 'rm -rf "$PACK_DIR"' EXIT

pnpm -C "$SCRIPT_DIR/../../packages/query-sdk" build
pnpm -C "$SCRIPT_DIR/../../packages/query-sdk" pack --pack-destination "$PACK_DIR"

shopt -s nullglob
TARBALLS=("$PACK_DIR"/lightdash-query-sdk-*.tgz)
if [ "${#TARBALLS[@]}" -ne 1 ]; then
    echo "Expected exactly one query-sdk tarball, found ${#TARBALLS[@]}" >&2
    exit 1
fi
mv "${TARBALLS[0]}" "$DESTINATION/lightdash-query-sdk.tgz"
