import { defineConfig, devices } from '@playwright/test';
import adminAuthenticationFile from './playwright/auth';

const retries = Number.parseInt(process.env.PLAYWRIGHT_RETRIES ?? '2', 10);

export default defineConfig({
    testDir: './playwright',
    outputDir: './playwright-results',
    fullyParallel: false,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? retries : 0,
    workers: 1,
    reporter: process.env.CI
        ? [
              ['list'],
              ['html', { open: 'never', outputFolder: 'playwright-report' }],
          ]
        : 'list',
    use: {
        baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
        actionTimeout: 10_000,
        navigationTimeout: 30_000,
        screenshot: 'only-on-failure',
        trace: 'on-first-retry',
        video: 'retain-on-failure',
    },
    projects: [
        {
            name: 'setup',
            testMatch: '**/*.setup.ts',
        },
        {
            name: 'firefox',
            dependencies: ['setup'],
            testMatch: '**/*.spec.ts',
            use: {
                ...devices['Desktop Firefox'],
                storageState: adminAuthenticationFile,
                viewport: { width: 1920, height: 1080 },
            },
        },
    ],
});
