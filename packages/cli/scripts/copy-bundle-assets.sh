#!/bin/bash

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
CLI_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
ROOT_DIR=$(cd "$CLI_DIR/../.." && pwd)
BUNDLE_DIR="$CLI_DIR/bundle"
WAREHOUSES_DIR="$CLI_DIR/../warehouses/src/warehouseClients"
DUCKDB_BUNDLE_DIR="$BUNDLE_DIR/node_modules/@duckdb"
DEFAULT_DUCKDB_BINDINGS=("node-bindings-darwin-arm64")
SUPPORTED_DUCKDB_BINDINGS=(
    "node-bindings-darwin-arm64"
    "node-bindings-darwin-x64"
    "node-bindings-linux-arm64"
    "node-bindings-linux-x64"
    "node-bindings-win32-x64"
)

cp "$WAREHOUSES_DIR"/ca-bundle-*.crt "$BUNDLE_DIR"/
cp "$WAREHOUSES_DIR"/ca-bundle-*.pem "$BUNDLE_DIR"/

mkdir -p "$DUCKDB_BUNDLE_DIR"

# Resolve package directories via Node so the script works with pnpm's
# symlinked workspace layout without depending on the .pnpm store structure.
resolve_package_dir() {
    local package_name=$1
    local resolution_roots=("$CLI_DIR" "$CLI_DIR/../warehouses" "$ROOT_DIR")

    if [ -n "${DUCKDB_NODE_API_DIR:-}" ]; then
        resolution_roots+=("$DUCKDB_NODE_API_DIR")
    fi

    node -e '
const path = require("path");
const { createRequire } = require("module");

const packageName = process.argv[1];
const roots = process.argv.slice(2);

for (const root of roots) {
    try {
        const requireFromRoot = createRequire(path.join(root, "package.json"));
        process.stdout.write(
            path.dirname(requireFromRoot.resolve(`${packageName}/package.json`)),
        );
        process.exit(0);
    } catch {
        // Try the next resolution root.
    }
}

process.exit(1);
' "$package_name" "${resolution_roots[@]}"
}

copy_duckdb_package() {
    local package_name=$1
    local package_dir

    if ! package_dir=$(resolve_package_dir "@duckdb/$package_name" 2>/dev/null); then
        echo "Missing DuckDB package '${package_name}'. Run 'pnpm install --force' to install all optional DuckDB bindings." >&2
        exit 1
    fi

    rm -rf "$DUCKDB_BUNDLE_DIR/$package_name"
    cp -R "$package_dir" "$DUCKDB_BUNDLE_DIR/$package_name"
}

# Keep DuckDB as real node_modules packages in the bundle so pkg extracts the
# native addon together with its sidecar libduckdb.dylib at runtime.
DUCKDB_NODE_API_DIR=$(resolve_package_dir "@duckdb/node-api" 2>/dev/null) || {
    echo "Missing DuckDB package 'node-api'. Run 'pnpm install --force' to install all optional DuckDB bindings." >&2
    exit 1
}

rm -rf "$DUCKDB_BUNDLE_DIR/node-api"
cp -R "$DUCKDB_NODE_API_DIR" "$DUCKDB_BUNDLE_DIR/node-api"

copy_duckdb_package "node-bindings"

if [ -n "${DUCKDB_BINDINGS:-}" ]; then
    IFS=',' read -r -a requested_bindings <<< "$DUCKDB_BINDINGS"
else
    # Local arm64 bundles only need the host macOS binding unless a wider set
    # of targets is requested by the binary build script.
    requested_bindings=("${DEFAULT_DUCKDB_BINDINGS[@]}")
fi

for package_name in "${requested_bindings[@]}"; do
    if [[ ! " ${SUPPORTED_DUCKDB_BINDINGS[*]} " =~ (^|[[:space:]])"${package_name}"($|[[:space:]]) ]]; then
        echo "Unsupported DuckDB binding package '${package_name}'" >&2
        exit 1
    fi

    copy_duckdb_package "$package_name"
done
