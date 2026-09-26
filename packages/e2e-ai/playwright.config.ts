import { defineConfig } from 'playwright/test';
import { resolveChromiumExecutable } from './lib/chromium';
import { siteUrl } from './lib/env';

export default defineConfig({
    testDir: './tests',
    outputDir: './test-results',
    // Undoes fixtures left behind by killed runs (lib/cleanupLedger.ts).
    globalSetup: './lib/globalSetup.ts',
    // Serial, one worker, run order = file order (plan §2, §4).
    fullyParallel: false,
    workers: 1,
    // Variance retries are per assertion inside V tests (plan §5), not per test.
    retries: 0,
    // No runtime bounds (plan §8.5): model work takes as long as it takes.
    timeout: 0,
    // DOM settling only; waits on model work are explicit and unbounded.
    expect: { timeout: 30_000 },
    reporter: [['list'], ['html', { open: 'never' }]],
    use: {
        baseURL: siteUrl,
        launchOptions: { executablePath: resolveChromiumExecutable() },
        actionTimeout: 30_000,
        navigationTimeout: 60_000,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
});
