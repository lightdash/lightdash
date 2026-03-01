#!/usr/bin/env bash
# Setup dbt virtual environments for all supported versions.
# Called from the Nix dev shell (flake.nix) or can be run standalone.
#
# Usage: ./scripts/setup-dbt-venvs.sh [python3-path]
#   python3-path: optional path to python3 binary (defaults to "python3")
#
# Version definitions live in dbt-versions.json (repo root).
# The script hashes that file and stores the hash in .venvs/.versions-hash.
# If the hash matches on subsequent runs, setup is skipped entirely.
# To force a rebuild, delete .venvs/.versions-hash or the .venvs directory.

set -euo pipefail

PYTHON="${1:-python3}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSIONS_FILE="$SCRIPT_DIR/../dbt-versions.json"
VENVS_BASE=".venvs/dbt"
ALIASES_DIR=".venvs/bin"
HASH_FILE=".venvs/.versions-hash"

# Check hash — skip if nothing changed
current_hash=$(shasum -a 256 "$VERSIONS_FILE" | cut -d' ' -f1)

if [ -f "$HASH_FILE" ] && [ "$(cat "$HASH_FILE")" = "$current_hash" ] && [ -d "$ALIASES_DIR" ]; then
  exit 0
fi

echo "dbt versions changed (or first run), setting up venvs..."

mkdir -p "$VENVS_BASE" "$ALIASES_DIR"

default_version=$(jq -r '.defaultVersion' "$VERSIONS_FILE")
count=$(jq '.versions | length' "$VERSIONS_FILE")

for ((i = 0; i < count; i++)); do
  alias_name=$(jq -r ".versions[$i].alias" "$VERSIONS_FILE")

  venv_path="$VENVS_BASE/$alias_name"
  dbt_bin="$venv_path/bin/dbt"
  alias_path="$ALIASES_DIR/$alias_name"
  link_target="../dbt/$alias_name/bin/dbt"

  if [ ! -d "$venv_path" ]; then
    echo "Setting up $alias_name virtual environment in $venv_path..."
    "$PYTHON" -m venv "$venv_path"

    # shellcheck disable=SC1091
    source "$venv_path/bin/activate"

    # Install all packages from the packages array
    readarray -t packages < <(jq -r ".versions[$i].packages[]" "$VERSIONS_FILE")

    echo "Installing ${packages[*]}..."
    pip install "${packages[@]}" \
      --disable-pip-version-check --no-warn-script-location

    deactivate
    echo "$alias_name venv setup complete."
  fi

  # Create/update symlink alias
  if [ -f "$dbt_bin" ]; then
    ln -sf "$link_target" "$alias_path"
  else
    echo "WARNING: dbt not found at $dbt_bin. Alias '$alias_name' might not work."
  fi
done

# Default 'dbt' alias
ln -sf "$default_version" "$ALIASES_DIR/dbt"

# Save hash so next run skips if nothing changed
echo "$current_hash" > "$HASH_FILE"

echo "Available dbt commands: $(ls "$ALIASES_DIR" | sort -t. -k2 -n | tr '\n' ' ')"
echo "Default: dbt -> $default_version"
