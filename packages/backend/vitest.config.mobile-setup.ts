import { defineConfig } from 'vitest/config';
import unitConfig from './vitest.config';

export default defineConfig({
    ...unitConfig,
    test: {
        ...unitConfig.test,
        name: 'mobile-setup-postgres-tests',
        include: [
            'src/services/OAuthService/mobileSetupCodeGrantType.integration.test.ts',
        ],
        exclude: ['node_modules', 'dist'],
        testTimeout: 15_000,
        hookTimeout: 15_000,
    },
});
