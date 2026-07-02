import * as path from 'node:path';
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
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            '@lightdash/common/src': path.resolve(__dirname, '../common/src'),
            '@lightdash/common': path.resolve(__dirname, '../common/src'),
            '@lightdash/formula': path.resolve(__dirname, '../formula/src'),
            '@lightdash/warehouses': path.resolve(
                __dirname,
                '../warehouses/src',
            ),
        },
    },
});
