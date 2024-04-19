import { defineConfig } from 'cypress';
import * as cypressSplit from 'cypress-split';
import { unlinkSync } from 'fs';

export default defineConfig({
    viewportWidth: 1080,
    defaultCommandTimeout: 10000,
    retries: {
        runMode: 1,
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
        setupNodeEvents(on, config) {
            cypressSplit(on, config);

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
