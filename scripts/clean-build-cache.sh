#!/bin/bash

rm -rf packages/*/tsconfig*.tsbuildinfo
# Remove build/dist directories
rm -rf packages/*/build
rm -rf packages/*/dist

echo "🧼 cleaned \"build\", \"dist\" and \"tsbuildinfo\" files"