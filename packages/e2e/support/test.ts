import {
    APIRequestContext,
    APIResponse,
    test as base,
    PlaywrightWorkerArgs,
} from '@playwright/test';
import { loginAs, SEED_USERS } from './api';
import { deleteCreated, matchesTrackedRequest, trackCreated } from './cleanup';

export { expect } from '@playwright/test';
export type {
    APIRequestContext,
    APIResponse,
    Locator,
    Page,
    Request,
    Response,
} from '@playwright/test';
export * from './api';
export * from './ui';
export * from './cli';
export * from './env';

type RequestOptions = Parameters<APIRequestContext['fetch']>[1];

// `page.request` shares the browser's cookie jar, so API logins apply to the page too.
// Responses are recorded so created content is deleted after the worker finishes.
export class TrackedApi {
    constructor(private readonly request: APIRequestContext) {}

    private async send(
        method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
        url: string,
        options?: RequestOptions,
    ): Promise<APIResponse> {
        const response = await this.request.fetch(url, { ...options, method });
        if (matchesTrackedRequest(method, url)) {
            const body: unknown = await response.json().catch(() => null);
            trackCreated(method, url, body);
        }
        return response;
    }

    get(url: string, options?: RequestOptions) {
        return this.send('GET', url, options);
    }

    post(url: string, options?: RequestOptions) {
        return this.send('POST', url, options);
    }

    put(url: string, options?: RequestOptions) {
        return this.send('PUT', url, options);
    }

    patch(url: string, options?: RequestOptions) {
        return this.send('PATCH', url, options);
    }

    delete(url: string, options?: RequestOptions) {
        return this.send('DELETE', url, options);
    }

    // Playwright's own context, for helpers typed against APIRequestContext.
    get raw(): APIRequestContext {
        return this.request;
    }
}

const THIRD_PARTY_HOSTS =
    /rudderlabs\.com|intercom\.io|headwayapp\.co|chat\.lightdash\.com|loom\.com|analytics\.lightdash\.com/;

type Fixtures = {
    api: TrackedApi;
    blockThirdParty: void;
    trackBrowserRequests: void;
};

type WorkerFixtures = {
    cleanupCreated: void;
};

export const test = base.extend<Fixtures, WorkerFixtures>({
    api: async ({ page }, use) => {
        await use(new TrackedApi(page.request));
    },
    blockThirdParty: [
        async ({ context }, use) => {
            await context.route(THIRD_PARTY_HOSTS, (route) => route.abort());
            // First-run notices open as dialogs and make `getByRole('dialog')` ambiguous
            await context.addInitScript(() => {
                window.localStorage.setItem(
                    'homepage-v2-default-notice-closed',
                    'true',
                );
            });
            await use();
        },
        { auto: true },
    ],
    trackBrowserRequests: [
        async ({ page }, use) => {
            page.on('response', (response) => {
                const method = response.request().method();
                if (!matchesTrackedRequest(method, response.url())) return;
                response
                    .json()
                    .then((body: unknown) =>
                        trackCreated(method, response.url(), body),
                    )
                    .catch(() => undefined);
            });
            await use();
        },
        { auto: true },
    ],
    cleanupCreated: [
        // eslint-disable-next-line no-empty-pattern
        async ({}, use, workerInfo) => {
            await use();
            const { baseURL } = workerInfo.project.use;
            if (baseURL) await deleteCreated(baseURL);
        },
        { scope: 'worker', auto: true },
    ],
});

// For beforeAll/afterAll, which cannot use the page-bound `api` fixture: an admin-authenticated request context.
export const withAdminApi = async <T>(
    playwright: PlaywrightWorkerArgs['playwright'],
    run: (api: APIRequestContext) => Promise<T>,
): Promise<T> => {
    const api = await playwright.request.newContext({
        baseURL: test.info().project.use.baseURL,
        ignoreHTTPSErrors: true,
    });
    try {
        await loginAs(api, SEED_USERS.admin);
        return await run(api);
    } finally {
        await api.dispose();
    }
};
