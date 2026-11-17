import { defineConfig } from 'vitest/config';
import { baseConfig as unitConfig } from './vitest.config';

export default defineConfig({
    ...unitConfig,
    test: {
        ...unitConfig.test,
        name: 'scheduler-integration-tests',
        include: ['src/scheduler/SchedulerWorker.quiesce.integration.test.ts'],
        exclude: [],
        testTimeout: 15_000,
        hookTimeout: 15_000,
    },
});
