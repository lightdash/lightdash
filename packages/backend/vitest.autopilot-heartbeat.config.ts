import { defineConfig } from 'vitest/config';
import contentConfig from './vitest.autopilot-content.config';

export default defineConfig({
    ...contentConfig,
    test: {
        ...contentConfig.test,
        name: 'autopilot-real-heartbeat',
        include: [
            'src/ee/services/ManagedAgentService/AutopilotHeartbeat.integration.test.ts',
        ],
        testTimeout: 690_000,
    },
});
