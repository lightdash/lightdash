import { defineConfig } from 'vitest/config';
import unitConfig from './vitest.config';

export default defineConfig({
    ...unitConfig,
    test: {
        ...unitConfig.test,
        name: 'ai-principal-integration-tests',
        include: [
            'src/services/AiAccessService/providers/__tests__/*.integration.test.ts',
        ],
        exclude: [],
        testTimeout: 15_000,
        hookTimeout: 15_000,
    },
});
