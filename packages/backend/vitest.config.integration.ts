import * as path from 'node:path';
import { defineConfig } from 'vitest/config';
import EvalHtmlReporter from './src/ee/services/ai/agents/tests/eval-reporter';

export default defineConfig({
    test: {
        name: 'integration-tests',
        include: [
            'src/**/*integration.test.ts',
        ],
        exclude: [
            'node_modules',
            'dist',
            // Uses an isolated queue via vitest.config.scheduler.integration.ts.
            'src/scheduler/SchedulerWorker.quiesce.integration.test.ts',
            'src/ee/services/ai/filterPermutations/*.integration.test.ts',
            // Opt-in live provider suites, run via vitest.autopilot.config.ts
            'src/ee/services/ManagedAgentService/*.integration.test.ts',
        ],
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
