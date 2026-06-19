import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        name: 'ai-filter-permutations',
        include: [
            'src/ee/services/ai/filterPermutations/*.integration.test.ts',
        ],
        exclude: ['node_modules', 'dist'],
        environment: 'node',
        reporters: ['verbose'],
        testTimeout: 120_000,
        hookTimeout: 120_000,
        fileParallelism: true,
        env: {
            TZ: 'UTC',
            NODE_ENV: 'test',
        },
    },
});
