#!/usr/bin/env bash
# Build the checkout's common and warehouses packages and pack them under the
# filenames e2b.Dockerfile expects. Run from anywhere; tarballs land next to
# this script (or in $1).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DESTINATION="${1:-$SCRIPT_DIR}"
mkdir -p "$DESTINATION"
DESTINATION="$(cd "$DESTINATION" && pwd)"
PACK_DIR=$(mktemp -d)
trap 'rm -rf "$PACK_DIR"' EXIT

pack() {
    local package_dir="$1" tarball_prefix="$2" target="$3"
    pnpm -C "$REPO_ROOT/packages/$package_dir" build
    pnpm -C "$REPO_ROOT/packages/$package_dir" pack --pack-destination "$PACK_DIR"
    shopt -s nullglob
    local tarballs=("$PACK_DIR"/"$tarball_prefix"-*.tgz)
    shopt -u nullglob
    if [ "${#tarballs[@]}" -ne 1 ]; then
        echo "Expected exactly one $tarball_prefix tarball, found ${#tarballs[@]}" >&2
        exit 1
    fi
    mv "${tarballs[0]}" "$DESTINATION/$target"
}

# common first: warehouses' build references it.
pack common lightdash-common lightdash-common.tgz
pack warehouses lightdash-warehouses lightdash-warehouses.tgz
