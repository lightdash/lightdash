import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './playwright',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: [
        ['html'],
        ['@estruyf/github-actions-reporter']
    ],
    use: {
        baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
        trace: 'on-first-retry',
    },
    timeout: 10000,
    expect: {
        timeout: 5000,
    },
});