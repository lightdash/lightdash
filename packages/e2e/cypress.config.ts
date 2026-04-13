import { defineConfig } from 'cypress';
import cypressSplit from 'cypress-split';
import { readdirSync, readFileSync, unlinkSync } from 'fs';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { load: loadYaml } = require('js-yaml');
import { join } from 'path';

// If running natively, we want to use environment variables from the host machine
// to be added to Cypress.env()
const env = process.env.RUNTIME === 'native' ? process.env : {};

// Allow configuring retries via environment variable
const runModeRetries = parseInt(process.env.CYPRESS_RETRIES ?? '2', 10);

export default defineConfig({
    viewportWidth: 1920,
    viewportHeight: 1080,
    defaultCommandTimeout: 10000,
    retries: {
        runMode: runModeRetries,
        openMode: 0,
    },
    e2e: {
        specPattern: 'cypress/**/**/*.cy.{js,jsx,ts,tsx}',
        excludeSpecPattern: ['cypress/e2e/experimental/**/*'],
        baseUrl: 'http://localhost:3000',
        blockHosts: [
            '*.rudderlabs.com',
            '*.intercom.io',
            '*.headwayapp.co',
            'chat.lightdash.com',
            '*.loom.com',
            'analytics.lightdash.com',
        ],
        trashAssetsBeforeRuns: true,
        experimentalMemoryManagement: true,
        setupNodeEvents(on, config) {
            // Count dbt models+seeds and read thread count so CLI tests can
            // scale timeouts dynamically based on parallel execution.
            // Seeds are included because `lightdash generate` processes them
            // alongside SQL models since seed support was added.
            const demoDir = join(
                __dirname,
                '../../examples/full-jaffle-shop-demo',
            );
            const modelsDir = join(demoDir, 'dbt/models');
            const seedsDir = join(demoDir, 'dbt/data');
            const countFiles = (
                dir: string,
                ext: string,
            ): number =>
                readdirSync(dir, { withFileTypes: true }).reduce(
                    (count, entry) =>
                        entry.isDirectory()
                            ? count +
                              countFiles(join(dir, entry.name), ext)
                            : count +
                              (entry.name.endsWith(ext) ? 1 : 0),
                    0,
                );
            config.env.MODEL_COUNT =
                countFiles(modelsDir, '.sql') +
                countFiles(seedsDir, '.csv');

            const DBT_DEFAULT_THREADS = 4;
            const profilesPath = join(demoDir, 'profiles/profiles.yml');
            const profiles = loadYaml(
                readFileSync(profilesPath, 'utf8'),
            ) as Record<string, any>;
            const targetName =
                profiles?.jaffle_shop?.target ?? 'jaffle';
            const threads =
                profiles?.jaffle_shop?.outputs?.[targetName]?.threads ??
                DBT_DEFAULT_THREADS;
            config.env.DBT_THREADS = threads;

            cypressSplit(on, config);

            on('before:browser:launch', (browser, launchOptions) => {
                if (['chrome', 'edge'].includes(browser.name)) {
                    if (browser.isHeadless) {
                        launchOptions.args.push('--no-sandbox');
                        launchOptions.args.push(
                            '--disable-gl-drawing-for-tests',
                        );
                        launchOptions.args.push('--disable-gpu');
                    }
                    launchOptions.args.push(
                        '--js-flags=--max-old-space-size=3500',
                    );
                }
                return launchOptions;
            });

            // Delete videos for specs without failing or retried tests
            // https://docs.cypress.io/guides/guides/screenshots-and-videos#Delete-videos-for-specs-without-failing-or-retried-tests
            on('after:spec', (_spec, results) => {
                if (results && results.video) {
                    // Do we have failures for any retry attempts?
                    const failures = results.tests.some((test) =>
                        test.attempts.some(
                            (attempt) => attempt.state === 'failed',
                        ),
                    );

                    if (!failures) {
                        // delete the video if the spec passed and no tests retried
                        unlinkSync(results.video);
                    }
                }
            });

            // IMPORTANT: return the config object
            return config;
        },
    },
    env,

    video: true,
    videoCompression: true,

    screenshotOnRunFailure: true,
});
