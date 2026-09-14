#!/bin/bash
set -euo pipefail

pnpm install
pnpm formula:build
pnpm common-build
pnpm warehouses-build
pnpm cli-build
