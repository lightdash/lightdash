import * as path from 'node:path';
import { defineConfig } from 'vitest/config';
import EvalHtmlReporter from './src/ee/services/ai/agents/tests/eval-reporter';

export default defineConfig({
    test: {
        name: 'integration-tests',
        include: ['src/ee/**/*integration.test.ts'],
        exclude: ['node_modules', 'dist'],
        environment: 'node',
        testTimeout: 120000,
        hookTimeout: 60000,
        teardownTimeout: 60000,
        globals: true,
        setupFiles: ['./src/vitest.setup.integration.ts'],
        env: {
            TZ: 'UTC',
            NODE_ENV: 'test',
        },
        logHeapUsage: true,
        reporters: ['verbose', new EvalHtmlReporter()],
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
});
