import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        clearMocks: false,
        include: ['tests/**/*.test.ts'],
    },
});
