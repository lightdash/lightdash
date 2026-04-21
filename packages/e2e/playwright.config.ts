import { defineConfig, devices } from '@playwright/test';
import { join } from 'path';
import { readdirSync, readFileSync } from 'fs';

const { load: loadYaml } = require('js-yaml');

// Allow configuring retries via environment variable
const retries = parseInt(process.env.PLAYWRIGHT_RETRIES ?? '1', 10);

// Count dbt models and read thread count so CLI tests can
// scale timeouts dynamically based on parallel execution.
const demoDir = join(__dirname, '../../examples/full-jaffle-shop-demo');
const modelsDir = join(demoDir, 'dbt/models');
const countSqlFiles = (dir: string): number =>
    readdirSync(dir, { withFileTypes: true }).reduce(
        (count, entry) =>
            entry.isDirectory()
                ? count + countSqlFiles(join(dir, entry.name))
                : count + (entry.name.endsWith('.sql') ? 1 : 0),
        0,
    );

const DBT_DEFAULT_THREADS = 4;
const profilesPath = join(demoDir, 'profiles/profiles.yml');
const profiles = loadYaml(readFileSync(profilesPath, 'utf8')) as Record<
    string,
    any
>;
const targetName = profiles?.jaffle_shop?.target ?? 'jaffle';
const threads =
    profiles?.jaffle_shop?.outputs?.[targetName]?.threads ??
    DBT_DEFAULT_THREADS;

// Export these for use in tests
process.env.MODEL_COUNT = String(countSqlFiles(modelsDir));
process.env.DBT_THREADS = String(threads);

export default defineConfig({
    testDir: './playwright/tests',
    outputDir: './test-results',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? retries : 0,
    // Four workers keeps in-file ordering (via fullyParallel: false) while
    // letting four spec files run in parallel within a shard. We now run
    // only 2 shards instead of 5, so overall concurrent load on the backend
    // is lower (2 × 4 = 8 vs 5 × 2 = 10) even though each shard uses more
    // workers.
    workers: process.env.CI ? 4 : undefined,
    reporter: process.env.CI
        ? [['html', { open: 'never' }], ['list']]
        : [['list']],
    use: {
        baseURL: process.env.BASE_URL || 'http://localhost:3000',
        viewport: { width: 1920, height: 1080 },
        trace: 'on-first-retry',
        video: 'retain-on-failure',
        screenshot: 'only-on-failure',
        actionTimeout: 10000,
        navigationTimeout: 30000,
    },
    projects: [
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
                viewport: { width: 1920, height: 1080 },
            },
        },
    ],
    /* Block third-party hosts that were blocked in Cypress config */
    // Note: Playwright doesn't have built-in host blocking like Cypress.
    // We handle this via route blocking in the base fixture.
});
