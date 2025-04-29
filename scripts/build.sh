#!/bin/bash
set -e

pnpm install
pnpm common-build
pnpm warehouses-build
pnpm cli-build
pnpm mantine-v7-build
