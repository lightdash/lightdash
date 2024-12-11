#!/bin/bash
set -e

pnpm --filter backend rollback-all
