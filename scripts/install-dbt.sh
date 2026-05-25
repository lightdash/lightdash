#!/usr/bin/env sh
# Install dbt virtual environments for all versions in dbt-versions.json.
#
# Default (local dev) layout:
#   .venvs/dbt/<alias>/bin/dbt
#   .venvs/bin/<alias> -> .venvs/dbt/<alias>/bin/dbt
#   .venvs/bin/dbt     -> defaultVersion
#
# Docker usage example:
#   ./scripts/install-dbt.sh \
#     --versions-file /tmp/dbt-versions.json \
#     --dbt-root /opt/dbt \
#     --bin-dir /opt/dbt/bin \
#     --skip-hash-file \
#     --python /usr/bin/python3

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

VERSIONS_FILE="$SCRIPT_DIR/../dbt-versions.json"
ROOT_DIR=".venvs/dbt"
BIN_DIR=".venvs/bin"
HASH_FILE=".venvs/.versions-hash"
SKIP_HASH_FILE=false
PYTHON_BIN="python3"

while [ "$#" -gt 0 ]; do
    case "$1" in
        --versions-file)
            VERSIONS_FILE="$2"
            shift 2
            ;;
        --dbt-root)
            ROOT_DIR="$2"
            shift 2
            ;;
        --bin-dir)
            BIN_DIR="$2"
            shift 2
            ;;
        --hash-file)
            HASH_FILE="$2"
            shift 2
            ;;
        --skip-hash-file)
            SKIP_HASH_FILE=true
            shift 1
            ;;
        --python)
            PYTHON_BIN="$2"
            shift 2
            ;;
        -h|--help)
            cat <<EOF
Usage: $0 [options]

Options:
  --versions-file <path>   Path to dbt-versions.json
  --dbt-root <path>        Root directory for dbt venvs
  --bin-dir <path>         Directory for dbt alias symlinks
  --hash-file <path>       Hash file path to enable skip-on-no-change
  --skip-hash-file         Disable hash check/write entirely
  --python <path>          Python interpreter path/name for uv venv
EOF
            exit 0
            ;;
        *)
            echo "Unknown argument: $1" >&2
            exit 1
            ;;
    esac
done

if ! command -v uv >/dev/null 2>&1; then
    echo "ERROR: uv is required but not found on PATH." >&2
    exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
    echo "ERROR: jq is required but not found on PATH." >&2
    exit 1
fi

if [ ! -f "$VERSIONS_FILE" ]; then
    echo "ERROR: versions file not found: $VERSIONS_FILE" >&2
    exit 1
fi

if [ "$SKIP_HASH_FILE" = false ] && [ -n "$HASH_FILE" ]; then
    if command -v sha256sum >/dev/null 2>&1; then
        CURRENT_HASH=$(sha256sum "$VERSIONS_FILE" | awk '{print $1}')
    elif command -v shasum >/dev/null 2>&1; then
        CURRENT_HASH=$(shasum -a 256 "$VERSIONS_FILE" | awk '{print $1}')
    else
        echo "ERROR: neither sha256sum nor shasum is available." >&2
        exit 1
    fi

    if [ -f "$HASH_FILE" ] && [ "$(cat "$HASH_FILE")" = "$CURRENT_HASH" ] && [ -d "$BIN_DIR" ]; then
        exit 0
    fi
fi

echo "Installing dbt environments from $VERSIONS_FILE"

mkdir -p "$ROOT_DIR" "$BIN_DIR"

DEFAULT_VERSION=$(jq -r '.defaultVersion' "$VERSIONS_FILE")
COUNT=$(jq '.versions | length' "$VERSIONS_FILE")

i=0
while [ "$i" -lt "$COUNT" ]; do
    ALIAS_NAME=$(jq -r ".versions[$i].alias" "$VERSIONS_FILE")
    VENV_PATH="$ROOT_DIR/$ALIAS_NAME"

    if [ ! -d "$VENV_PATH" ]; then
        echo "=== Installing $ALIAS_NAME ==="
        uv venv --python "$PYTHON_BIN" "$VENV_PATH"

        set --
        while IFS= read -r pkg; do
            [ -n "$pkg" ] && set -- "$@" "$pkg"
        done <<EOF
$(jq -r ".versions[$i].packages[]" "$VERSIONS_FILE")
EOF

        uv pip install --link-mode=copy --python "$VENV_PATH/bin/python" "$@"
    fi

    if [ -x "$VENV_PATH/bin/dbt" ]; then
        ln -sf "$VENV_PATH/bin/dbt" "$BIN_DIR/$ALIAS_NAME"
    else
        echo "WARNING: dbt not found at $VENV_PATH/bin/dbt" >&2
    fi

    i=$((i + 1))
done

ln -sf "$ROOT_DIR/$DEFAULT_VERSION/bin/dbt" "$BIN_DIR/dbt"

if [ "$SKIP_HASH_FILE" = false ] && [ -n "$HASH_FILE" ]; then
    mkdir -p "$(dirname "$HASH_FILE")"
    echo "$CURRENT_HASH" > "$HASH_FILE"
fi

echo "Available dbt commands: $(ls "$BIN_DIR" | sort -t. -k2 -n | tr '\n' ' ')"
echo "Default: dbt -> $DEFAULT_VERSION"
