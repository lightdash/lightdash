import { defineConfig } from 'cypress';

export default defineConfig({
    viewportWidth: 1080,
    defaultCommandTimeout: 5000,
    retries: {
        runMode: 1,
        openMode: 0,
    },
    e2e: {
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
    },
});
