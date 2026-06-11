#!/bin/bash
set -euo pipefail

suffix=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --fast)
            suffix=":fast"
            ;;
        -h|--help)
            echo "Usage: $0 [--fast]"
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            echo "Usage: $0 [--fast]" >&2
            exit 1
            ;;
    esac
    shift
done

pnpm install
pnpm "formula:build${suffix}"
pnpm "common-build${suffix}"
pnpm "warehouses-build${suffix}"
pnpm "cli-build${suffix}"
