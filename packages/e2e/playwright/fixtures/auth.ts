import {
    SEED_ORG_1_ADMIN_EMAIL,
    SEED_ORG_1_ADMIN_PASSWORD,
    SEED_ORG_1_EDITOR_EMAIL,
    SEED_ORG_1_EDITOR_PASSWORD,
    SEED_ORG_1_VIEWER_EMAIL,
    SEED_ORG_1_VIEWER_PASSWORD,
    SEED_ORG_2_ADMIN_EMAIL,
    SEED_ORG_2_ADMIN_PASSWORD,
} from '@lightdash/common';
import {
    test as base,
    expect,
    type Browser,
    type Page,
} from '@playwright/test';

const BLOCKED_HOSTS = [
    '*.rudderlabs.com',
    '*.intercom.io',
    '*.headwayapp.co',
    'chat.lightdash.com',
    '*.loom.com',
    'analytics.lightdash.com',
];

function hostMatchesPattern(host: string, pattern: string): boolean {
    if (pattern.startsWith('*.')) {
        const suffix = pattern.slice(1); // e.g. ".rudderlabs.com"
        return host.endsWith(suffix);
    }
    return host === pattern;
}

/**
 * Log in once as the given seed user and return a storage-state JSON blob
 * containing the session cookie. The blob is created per-worker, so each
 * worker owns its own server-side session — a logout / session-regenerate
 * in one worker cannot invalidate the cookies used by sibling workers.
 */
async function loginAndCaptureState(
    browser: Browser,
    email: string,
    password: string,
): Promise<string> {
    const context = await browser.newContext();
    const response = await context.request.post('api/v1/login', {
        data: { email, password },
    });
    expect(response.status()).toBe(200);
    const state = await context.storageState();
    await context.close();
    return JSON.stringify(state);
}

async function createAuthenticatedPage(
    browser: Browser,
    storageStateJson: string,
): Promise<Page> {
    const context = await browser.newContext({
        storageState: JSON.parse(storageStateJson),
    });

    // Block third-party hosts (equivalent to Cypress blockHosts).
    await context.route('**/*', (route) => {
        const url = new URL(route.request().url());
        if (
            BLOCKED_HOSTS.some((pattern) =>
                hostMatchesPattern(url.hostname, pattern),
            )
        ) {
            return route.abort();
        }
        return route.continue();
    });

    return context.newPage();
}

export type AuthFixtures = {
    adminPage: Page;
    editorPage: Page;
    viewerPage: Page;
    org2AdminPage: Page;
};

type AuthWorkerFixtures = {
    adminState: string;
    editorState: string;
    viewerState: string;
    org2AdminState: string;
};

export const test = base.extend<AuthFixtures, AuthWorkerFixtures>({
    adminState: [
        async ({ browser }, use) => {
            const state = await loginAndCaptureState(
                browser,
                SEED_ORG_1_ADMIN_EMAIL.email,
                SEED_ORG_1_ADMIN_PASSWORD.password,
            );
            await use(state);
        },
        { scope: 'worker' },
    ],
    editorState: [
        async ({ browser }, use) => {
            const state = await loginAndCaptureState(
                browser,
                SEED_ORG_1_EDITOR_EMAIL.email,
                SEED_ORG_1_EDITOR_PASSWORD.password,
            );
            await use(state);
        },
        { scope: 'worker' },
    ],
    viewerState: [
        async ({ browser }, use) => {
            const state = await loginAndCaptureState(
                browser,
                SEED_ORG_1_VIEWER_EMAIL.email,
                SEED_ORG_1_VIEWER_PASSWORD.password,
            );
            await use(state);
        },
        { scope: 'worker' },
    ],
    org2AdminState: [
        async ({ browser }, use) => {
            const state = await loginAndCaptureState(
                browser,
                SEED_ORG_2_ADMIN_EMAIL.email,
                SEED_ORG_2_ADMIN_PASSWORD.password,
            );
            await use(state);
        },
        { scope: 'worker' },
    ],

    adminPage: async ({ browser, adminState }, use) => {
        const page = await createAuthenticatedPage(browser, adminState);
        await use(page);
        await page.context().close();
    },
    editorPage: async ({ browser, editorState }, use) => {
        const page = await createAuthenticatedPage(browser, editorState);
        await use(page);
        await page.context().close();
    },
    viewerPage: async ({ browser, viewerState }, use) => {
        const page = await createAuthenticatedPage(browser, viewerState);
        await use(page);
        await page.context().close();
    },
    org2AdminPage: async ({ browser, org2AdminState }, use) => {
        const page = await createAuthenticatedPage(browser, org2AdminState);
        await use(page);
        await page.context().close();
    },
});

export { expect };
