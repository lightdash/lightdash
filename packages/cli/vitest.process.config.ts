import { defineConfig } from 'vitest/config';
import baseConfig, { processTestPattern } from './vitest.config';

export default defineConfig({
    ...baseConfig,
    test: {
        ...baseConfig.test,
        name: 'cli-process-tests',
        include: [processTestPattern],
        exclude: ['**/node_modules/**', '**/dist/**'],
    },
});
