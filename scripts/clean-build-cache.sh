#!/bin/bash

# Remove tsbuildinfo files
rm -rf packages/*/tsconfig*.tsbuildinfo

# Remove build/dist directories
rm -rf packages/*/build
rm -rf packages/*/dist

# Remove sdk build cache
rm -rf packages/frontend/sdk/dist

# Remove next build cache
rm -rf packages/*/.next

echo "🧼 cleaned \"build\", \"dist\" and \"tsbuildinfo\" files"