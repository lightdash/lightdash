import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        clearMocks: false,
        include: ['helpers/**/*.test.ts'],
        environment: 'node',
    },
});
