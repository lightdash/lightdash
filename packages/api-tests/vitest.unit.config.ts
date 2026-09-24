import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['helpers/**/*.test.ts'],
        environment: 'node',
    },
});
