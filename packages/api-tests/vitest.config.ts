import { defaultExclude, defineConfig } from 'vitest/config';

/**
 * Files that are safe to run with file parallelism: they only create/delete
 * their own resources or read seed data. Files that mutate state shared across
 * files (org member roles, seed-project settings like dataTimezone, embed
 * config, pinning, or assertions on global listings) must NOT be added here —
 * they run serially. New test files default to the serial group.
 *
 * Project refreshes run `dbt deps` in a shared server-side directory, so all
 * refresh calls must go through `withRefreshLock` (helpers/projects.ts).
 * Files that trigger fire-and-forget compiles the lock can't cover (preview
 * creation, promotion) must stay in the serial group.
 *
 * Project-wide listing endpoints (/charts, /chart-summaries, catalog) 404 when
 * another test deletes a space mid-request, so files asserting on them are
 * serial too.
 *
 * CI runs the two groups as separate sequential vitest invocations (see
 * `test:api`), so serial-group mutations can never race parallel-group reads.
 */
const PARALLEL_SAFE = [
    'tests/async-query.test.ts',
    'tests/cors.test.ts',
    'tests/fieldSearch.test.ts',
    'tests/headlessBrowser.test.ts',
    'tests/mcpServer.test.ts',
    'tests/nestedSpaces.test.ts',
    'tests/pivotQuery.test.ts',
    'tests/savedChartGet.test.ts',
    'tests/sqlRunner.test.ts',
    'tests/v2/dashboards.test.ts',
    'tests/v2/metricsWithTimeDimensions.test.ts',
    'tests/v2/savedCharts.test.ts',
];

// serial | parallel | undefined (= all files, serial — local default)
const group = process.env.API_TEST_GROUP;

export default defineConfig({
    test: {
        include: group === 'parallel' ? PARALLEL_SAFE : ['tests/**/*.test.ts'],
        exclude:
            group === 'serial'
                ? [...defaultExclude, ...PARALLEL_SAFE]
                : defaultExclude,
        environment: 'node',
        testTimeout: 120_000,
        hookTimeout: 30_000,
        globals: true,
        setupFiles: ['vitest.setup.ts'],
        pool: 'forks',
        fileParallelism: group === 'parallel',
        maxConcurrency: 10,
    },
});
