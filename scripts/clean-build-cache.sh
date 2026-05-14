#!/bin/bash

# Remove tsbuildinfo files (incl. nested workspace members)
find packages -name "*.tsbuildinfo" -not -path "*/node_modules/*" -delete

# Remove turbo cache (root + per-package)
rm -rf .turbo
rm -rf packages/*/.turbo

# Remove build/dist/.next under packages (incl. nested workspace members)
find packages -type d \( -name node_modules -prune \) -o \
    -type d \( -name dist -o -name build -o -name .next \) -prune -print0 | \
    xargs -0 rm -rf

echo "🧼 cleaned \"build\", \"dist\", \".turbo\" and \"tsbuildinfo\" files"
