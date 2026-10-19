import * as path from 'node:path';
import { defineConfig } from 'vitest/config';

// Process tests spawn the real CLI per case; they run in their own CI job.
export const processTestPattern = 'src/**/*.process.test.ts';

export default defineConfig({
    test: {
        name: 'cli-unit-tests',
        include: ['src/**/*.test.ts'],
        exclude: ['**/node_modules/**', '**/dist/**', processTestPattern],
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
