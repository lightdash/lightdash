#!/usr/bin/env bash
set -euo pipefail
scale_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "$scale_dir/tooling/register.py" "$@"
