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
            'src/ee/services/ManagedAgentService/AutopilotHeartbeat.integration.test.ts',
        ],
        exclude: [],
        setupFiles: [],
        // A full heartbeat may run up to the production 600 second deadline.
        testTimeout: 690_000,
        hookTimeout: 120_000,
        maxWorkers: 1,
    },
});
