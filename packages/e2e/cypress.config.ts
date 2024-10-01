import { defineConfig } from 'cypress';
import cypressSplit from 'cypress-split';
import { unlinkSync } from 'fs';

export default defineConfig({
    viewportWidth: 1920,
    viewportHeight: 1080,
    defaultCommandTimeout: 10000,
    retries: {
        runMode: 2,
        openMode: 0,
    },
    e2e: {
        specPattern: 'cypress/**/**/*.cy.{js,jsx,ts,tsx}',
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

    video: true,
    videoCompression: true,

    screenshotOnRunFailure: true,
});
