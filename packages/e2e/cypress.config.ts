import { defineConfig } from 'cypress';

export default defineConfig({
    viewportWidth: 1080,
    defaultCommandTimeout: 5000,
    retries: {
        runMode: 0,
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
        trashAssetsBeforeRuns: false,
    },
});
