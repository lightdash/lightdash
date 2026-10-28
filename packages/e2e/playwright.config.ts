import { defineConfig } from '@playwright/test';

const CI = process.env.CI !== undefined;

export default defineConfig({
    testDir: './tests',
    outputDir: './test-results',
    // Specs share a preview database, so tests inside a file run in order; files run in parallel.
    fullyParallel: false,
    forbidOnly: CI,
    retries: parseInt(process.env.PLAYWRIGHT_RETRIES ?? (CI ? '2' : '0'), 10),
    workers: CI ? 2 : 1,
    timeout: 120_000,
    expect: { timeout: 10_000 },
    reporter: CI
        ? [['list'], ['github'], ['html', { open: 'never' }]]
        : [['list'], ['html', { open: 'on-failure' }]],
    use: {
        baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
        viewport: { width: 1920, height: 1080 },
        actionTimeout: 10_000,
        navigationTimeout: 30_000,
        timezoneId: process.env.TZ,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'off',
        ignoreHTTPSErrors: true,
    },
    projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
