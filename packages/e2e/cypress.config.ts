import { defineConfig } from 'cypress';
import { cypressSplit } from 'cypress-split';

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
            '*.cohere.so',
            '*.headwayapp.co',
            'chat.lightdash.com',
            '*.loom.com',
            'analytics.lightdash.com',
        ],
        trashAssetsBeforeRuns: true,
        videoUploadOnPasses: false,
        videoCompression: 50,
        setupNodeEvents(on, config) {
            cypressSplit(on, config);
            // IMPORTANT: return the config object
            return config;
        },
    },
});
