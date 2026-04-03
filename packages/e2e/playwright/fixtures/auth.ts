import {
    test as base,
    type Browser,
    expect,
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

async function createAuthenticatedPage(
    browser: Browser,
    storageStatePath: string,
): Promise<Page> {
    const context = await browser.newContext({
        storageState: storageStatePath,
    });

    // Block third-party hosts (equivalent to Cypress blockHosts)
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

export const test = base.extend<AuthFixtures>({
    adminPage: async ({ browser }, use) => {
        const page = await createAuthenticatedPage(
            browser,
            'playwright/.auth/admin.json',
        );
        await use(page);
        await page.context().close();
    },
    editorPage: async ({ browser }, use) => {
        const page = await createAuthenticatedPage(
            browser,
            'playwright/.auth/editor.json',
        );
        await use(page);
        await page.context().close();
    },
    viewerPage: async ({ browser }, use) => {
        const page = await createAuthenticatedPage(
            browser,
            'playwright/.auth/viewer.json',
        );
        await use(page);
        await page.context().close();
    },
    org2AdminPage: async ({ browser }, use) => {
        const page = await createAuthenticatedPage(
            browser,
            'playwright/.auth/org2Admin.json',
        );
        await use(page);
        await page.context().close();
    },
});

export { expect };
