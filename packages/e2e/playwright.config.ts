import type { GitHubActionOptions } from '@estruyf/github-actions-reporter';
import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './playwright',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: [
        ['html'], // HTML report for detailed viewing
        ['list'], // Clean console output showing test results
        ['github'], // GitHub Actions reporter for CI
        [
            '@estruyf/github-actions-reporter', // GitHub Actions reporter for CI
            <GitHubActionOptions>{
                title: "", // removes header
                useDetails: true, // creates expandable sections for each file
                includeResults: ['pass', 'fail', 'flaky'],
                showError: true,
                showTags: false,
            },
        ],
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