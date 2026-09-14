import { defineConfig } from 'vitest/config';
import unitConfig from './vitest.config';

// Opt-in live evaluation suites: each one skips unless its environment
// variables are set, and they call real providers so they run serially.
export default defineConfig({
    ...unitConfig,
    test: {
        ...unitConfig.test,
        name: 'autopilot-live',
        include: [
            'src/ee/services/ManagedAgentService/AutopilotAgentRunner.integration.test.ts',
            'src/ee/services/ManagedAgentService/AutopilotContent.integration.test.ts',
        ],
        exclude: [],
        setupFiles: [],
        testTimeout: 240_000,
        hookTimeout: 120_000,
        maxWorkers: 1,
    },
});
