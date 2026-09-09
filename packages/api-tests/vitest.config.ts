import { configDefaults, defineConfig } from 'vitest/config';

// Files that mutate state every other file reads through: the seed project's
// data timezone and embed config (secret + allowed dashboards), the admin
// user's timezone and attributes, the org results cache flag, and the seeded
// dashboard. They run one at a time, after the parallel group has finished.
const serialFiles = [
    'tests/dataTimezone.test.ts',
    'tests/queryTimezone.test.ts',
    'tests/queryTimezoneBoundary.test.ts',
    'tests/userTimezone.test.ts',
    'tests/embedManagement.test.ts',
    'tests/embedChart.test.ts',
    'tests/embedDashboard.test.ts',
    'tests/embedTimezone.test.ts',
    'tests/dataAppVizRender.test.ts',
    'tests/attributes.test.ts',
    'tests/catalog.test.ts',
    'tests/resultsCacheSettings.test.ts',
    'tests/contentAsCode.test.ts',
];

const shared = {
    environment: 'node',
    testTimeout: 120_000,
    hookTimeout: 30_000,
    globals: true,
    setupFiles: ['vitest.setup.ts'],
    pool: 'forks' as const,
};

export default defineConfig({
    test: {
        // Runs once per run (root project only): creates the shared warehouse
        // projects used by the parity suites.
        globalSetup: ['vitest.global-setup.ts'],
        projects: [
            {
                test: {
                    ...shared,
                    name: 'parallel',
                    include: ['tests/**/*.test.ts'],
                    exclude: [...configDefaults.exclude, ...serialFiles],
                    fileParallelism: true,
                    // The preview pod is shared with the Cypress jobs; the
                    // merge suite bounds this group, so more workers only add
                    // contention.
                    maxWorkers: 4,
                    sequence: { groupOrder: 0 },
                },
            },
            {
                test: {
                    ...shared,
                    name: 'serial',
                    include: serialFiles,
                    fileParallelism: false,
                    sequence: { groupOrder: 1 },
                },
            },
        ],
    },
});
