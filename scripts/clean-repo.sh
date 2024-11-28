# Remove TypeScript build info files
find packages -name "tsconfig*.tsbuildinfo" -exec rm {} +

# Remove node_modules directories
find packages -name "node_modules" -type d -exec rm -rf {} +
rm -rf node_modules

# Remove build/dist directories
find packages -type d \( -name "build" -o -name "dist" \) -exec rm -rf {} +

# Reinstall dependencies
yarn
