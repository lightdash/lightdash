#!/bin/bash

# Remove tsbuildinfo files
rm -rf packages/*/tsconfig*.tsbuildinfo

# Remove build/dist and next build cache
rm -rf packages/*/build
rm -rf packages/*/dist
rm -rf packages/*/.next

# Remove sdk build cache
rm -rf packages/frontend/sdk/dist

echo "🧼 cleaned \"build\", \"dist\" and \"tsbuildinfo\" files"