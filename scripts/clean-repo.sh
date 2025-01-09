rm -rf packages/*/tsconfig*.tsbuildinfo

# Remove node_modules directories
rm -rf node_modules
rm -rf packages/*/node_modules

# Remove build/dist directories
rm -rf packages/*/build
rm -rf packages/*/dist

# Reinstall dependencies
pnpm install
pnpm build