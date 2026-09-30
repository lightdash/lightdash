import { defineConfig } from '@playwright/test';

const CI = process.env.CI !== undefined;

export default defineConfig({
    testDir: './specs',
    outputDir: './test-results',
    fullyParallel: true,
    forbidOnly: CI,
    retries: 0,
    timeout: 30_000,
    reporter: CI ? [['list'], ['github']] : [['list']],
    use: {
        baseURL: 'http://localhost:3011',
        viewport: { width: 1200, height: 900 },
        deviceScaleFactor: 1,
    },
    webServer: {
        command: 'pnpm exec vite --config browser/vite.config.ts',
        cwd: '..',
        url: 'http://localhost:3011',
        reuseExistingServer: !CI,
        timeout: 60_000,
    },
    projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
