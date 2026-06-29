import * as path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "backend-unit-tests",
    include: ["src/**/*.test.ts"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "src/**/*.integration.test.ts",
      "src/ee/services/McpService/mcp-chart-app/**",
    ],
    environment: "node",
    globals: true,
    setupFiles: ["./setupVitest.ts"],
    env: {
      TZ: "UTC",
      LANG: "en_US.UTF-8",
      NODE_ENV: "test",
    },
    maxWorkers: "50%",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@lightdash/common/src": path.resolve(__dirname, "../common/src"),
      "@lightdash/common": path.resolve(__dirname, "../common/src"),
      "@lightdash/formula": path.resolve(__dirname, "../formula/src"),
      "@lightdash/warehouses": path.resolve(__dirname, "../warehouses/src"),
    },
  },
});
