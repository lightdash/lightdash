import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: [
            'src/database/migrations/__tests__/launch-measurements/launch.measurement.ts',
        ],
        globals: true,
        environment: 'node',
        testTimeout: 1800000,
        hookTimeout: 600000,
        maxWorkers: 1,
        pool: 'forks',
        execArgv: ['--expose-gc'],
        env: { NODE_ENV: 'test', TZ: 'UTC' },
    },
});
