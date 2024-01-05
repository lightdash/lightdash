import { defineConfig } from 'cypress';
import * as cypressSplit from 'cypress-split';

export default defineConfig({
    viewportWidth: 1080,
    defaultCommandTimeout: 5000,
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
            // IMPORTANT: return the config object
            return config;
        },
    },
});
