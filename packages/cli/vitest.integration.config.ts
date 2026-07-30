export default {
    test: {
        name: 'cli-integration-tests',
        include: ['integration/**/*.integration.test.ts'],
        environment: 'node',
        globals: true,
        pool: 'forks',
        fileParallelism: false,
        maxWorkers: 1,
        retry: 0,
        testTimeout: 360_000,
        hookTimeout: 360_000,
        env: {
            TZ: 'UTC',
            LANG: 'en_US.UTF-8',
            FORCE_COLOR: '0',
        },
    },
} satisfies import('vitest/config').ViteUserConfig;
