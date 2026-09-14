import { defineConfig } from 'vitest/config';
import unitConfig from './vitest.config';

export default defineConfig({
    ...unitConfig,
    test: {
        ...unitConfig.test,
        name: 'autopilot-live',
        include: [
            'src/ee/services/ManagedAgentService/AutopilotAgentRunner.integration.test.ts',
        ],
        exclude: [],
        setupFiles: [],
        testTimeout: 100_000,
    },
});
