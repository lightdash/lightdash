#!/bin/bash
set -e

pnpm i
pnpm common-build
pnpm warehouses-build
pnpm cli-build
