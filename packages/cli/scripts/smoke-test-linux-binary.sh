#!/bin/bash

set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 <archive> <expected-version>" >&2
  exit 1
fi

ARCHIVE=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
EXPECTED_VERSION=$2
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
EXTRACT_DIR=$(mktemp -d)
trap 'rm -rf "$EXTRACT_DIR"' EXIT

tar -xzf "$ARCHIVE" -C "$EXTRACT_DIR"

docker run --rm --platform linux/amd64 \
  -e EXPECTED_VERSION="$EXPECTED_VERSION" \
  -v "$EXTRACT_DIR:/cli:ro" \
  -v "$SCRIPT_DIR/fixtures:/project:ro" \
  ubuntu:20.04@sha256:8feb4d8ca5354def3d8fce243717141ce31e2c428701f6682bd2fafe15388214 \
  sh -euc '
    ! command -v node
    ! command -v npm
    test "$(/cli/lightdash-linux-x64 --version)" = "$EXPECTED_VERSION"
    /cli/lightdash-linux-x64 lint --path /project/day-ref.yml
  '
