import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright/test';

// Browser layouts inside a cached `chromium-<revision>` folder, newest first.
const EXECUTABLES_IN_REVISION = [
    'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    'chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
    'chrome-linux64/chrome',
    'chrome-linux/chrome',
];

const browsersCacheDir = () =>
    process.env.PLAYWRIGHT_BROWSERS_PATH ??
    (process.platform === 'darwin'
        ? path.join(homedir(), 'Library', 'Caches', 'ms-playwright')
        : path.join(homedir(), '.cache', 'ms-playwright'));

const revisionOf = (folder: string) => Number(folder.split('-')[1]);

/**
 * Avoids a browser download: Playwright's own Chromium when installed,
 * otherwise the newest Chromium another Playwright version already cached.
 * `undefined` lets Playwright report a missing browser with its install hint.
 */
export const resolveChromiumExecutable = (): string | undefined => {
    const override = process.env.E2E_AI_CHROMIUM_EXECUTABLE;
    if (override) return override;
    if (existsSync(chromium.executablePath())) return undefined;

    const cacheDir = browsersCacheDir();
    if (!existsSync(cacheDir)) return undefined;
    const revisions = readdirSync(cacheDir)
        .filter((folder) => /^chromium-\d+$/.test(folder))
        .sort((a, b) => revisionOf(b) - revisionOf(a));
    return revisions
        .flatMap((revision) =>
            EXECUTABLES_IN_REVISION.map((executable) =>
                path.join(cacheDir, revision, executable),
            ),
        )
        .find((candidate) => existsSync(candidate));
};
