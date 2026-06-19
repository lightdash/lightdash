import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // The external-fetch adapter runs in the iframe (browser). jsdom
        // gives us `window`, `MessageEvent`, and `crypto.randomUUID`.
        environment: 'jsdom',
        include: ['src/**/*.test.ts'],
    },
});
