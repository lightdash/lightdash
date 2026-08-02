import * as path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        name: 'cli-unit-tests',
        include: ['src/**/*.test.ts'],
        exclude: ['**/node_modules/**', '**/dist/**'],
        environment: 'node',
        globals: true,
        env: {
            TZ: 'UTC',
            LANG: 'en_US.UTF-8',
            NODE_ENV: 'test',
            FORCE_COLOR: '0',
        },
        maxWorkers: '50%',
    },
    resolve: {
        alias: {
            '@lightdash/common': path.resolve(__dirname, '../common/src'),
            '@lightdash/warehouses': path.resolve(
                __dirname,
                '../warehouses/src',
            ),
        },
    },
});
