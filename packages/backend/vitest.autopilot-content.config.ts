import { defineConfig } from 'vitest/config';
import unitConfig from './vitest.config';

export default defineConfig({
    ...unitConfig,
    test: {
        ...unitConfig.test,
        name: 'autopilot-real-content',
        include: [
            'src/ee/services/ManagedAgentService/AutopilotContent.integration.test.ts',
        ],
        exclude: [],
        setupFiles: [],
        testTimeout: 240_000,
        hookTimeout: 120_000,
        maxWorkers: 1,
    },
});
