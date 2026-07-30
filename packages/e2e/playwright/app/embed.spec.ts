import {
    FilterInteractivityValues,
    SEED_PROJECT,
    type CreateEmbedJwt,
} from '@lightdash/common';
import {
    expect,
    test,
    type APIRequestContext,
    type APIResponse,
    type BrowserContext,
    type Page,
    type Request,
} from '@playwright/test';

const EMBED_API_PREFIX = `/api/v1/embed/${SEED_PROJECT.project_uuid}`;
const TILE_QUERY_PATH = `${EMBED_API_PREFIX}/query/dashboard-tile`;
const JAFFLE_DASHBOARD_NAME = 'Jaffle dashboard';
const TIMEZONE_OVERRIDE = 'America/Los_Angeles';

const isUnknownRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const requireRecord = (value: unknown, label: string) => {
    if (!isUnknownRecord(value)) {
        throw new Error(`${label} must be an object`);
    }

    return value;
};

const requireString = (value: unknown, label: string) => {
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`${label} must be a non-empty string`);
    }

    return value;
};

const hasOwnProperty = (record: Record<string, unknown>, key: string) =>
    Object.prototype.hasOwnProperty.call(record, key);

const parseJson = (serializedValue: string, label: string): unknown => {
    try {
        const value: unknown = JSON.parse(serializedValue);
        return value;
    } catch {
        throw new Error(`${label} must be valid JSON`);
    }
};

const parseJsonResponse = async (response: APIResponse, label: string) =>
    parseJson(await response.text(), label);

const requireOkResponse = async (response: APIResponse, label: string) => {
    await expect(response).toBeOK();

    const envelope = requireRecord(
        await parseJsonResponse(response, label),
        label,
    );
    if (envelope.status !== 'ok') {
        throw new Error(`${label} must have an ok status`);
    }

    return envelope;
};

const getJaffleDashboardUuid = async (request: APIRequestContext) => {
    const response = await request.get('/api/v2/content', {
        params: {
            contentTypes: 'dashboard',
            pageSize: 100,
            projectUuids: SEED_PROJECT.project_uuid,
            search: 'jaffle',
        },
    });
    const envelope = await requireOkResponse(response, 'Content response');
    const results = requireRecord(envelope.results, 'Content response results');

    if (!Array.isArray(results.data)) {
        throw new Error('Content response results data must be an array');
    }

    const dashboards = results.data.map((value, index) => {
        const dashboard = requireRecord(
            value,
            `Content response dashboard ${index}`,
        );
        if (dashboard.contentType !== 'dashboard') {
            throw new Error(
                `Content response dashboard ${index} must have dashboard content type`,
            );
        }

        return {
            name: requireString(
                dashboard.name,
                `Content response dashboard ${index} name`,
            ),
            uuid: requireString(
                dashboard.uuid,
                `Content response dashboard ${index} uuid`,
            ),
        };
    });
    const exactMatches = dashboards.filter(
        ({ name }) => name === JAFFLE_DASHBOARD_NAME,
    );

    if (exactMatches.length !== 1) {
        throw new Error(
            `Expected exactly one ${JAFFLE_DASHBOARD_NAME}, found ${exactMatches.length}`,
        );
    }

    const dashboard = exactMatches[0];
    if (dashboard === undefined) {
        throw new Error(`Could not resolve ${JAFFLE_DASHBOARD_NAME}`);
    }

    return dashboard.uuid;
};

const updateEmbedConfigDashboards = async (
    request: APIRequestContext,
    dashboardUuid: string,
) => {
    const response = await request.patch(`${EMBED_API_PREFIX}/config`, {
        data: {
            dashboardUuids: [dashboardUuid],
            chartUuids: [],
            allowAllDashboards: false,
            allowAllCharts: false,
        },
        headers: { 'Content-Type': 'application/json' },
    });

    await requireOkResponse(response, 'Embed config response');
};

const getEmbedUrl = async (
    request: APIRequestContext,
    body: CreateEmbedJwt,
) => {
    const response = await request.post(`${EMBED_API_PREFIX}/get-embed-url`, {
        data: body,
        headers: { 'Content-Type': 'application/json' },
    });
    const envelope = await requireOkResponse(response, 'Embed URL response');
    const results = requireRecord(
        envelope.results,
        'Embed URL response results',
    );
    const serializedUrl = requireString(
        results.url,
        'Embed URL response results URL',
    );

    try {
        return new URL(serializedUrl);
    } catch {
        throw new Error('Embed URL response results URL must be a valid URL');
    }
};

const prepareEmbeddedDashboard = async (
    request: APIRequestContext,
    context: BrowserContext,
    createJwt: (dashboardUuid: string) => CreateEmbedJwt,
) => {
    const dashboardUuid = await getJaffleDashboardUuid(request);
    await updateEmbedConfigDashboards(request, dashboardUuid);
    const embedUrl = await getEmbedUrl(request, createJwt(dashboardUuid));

    await context.clearCookies();

    return embedUrl;
};

const waitForTileQuery = (page: Page) =>
    page.waitForRequest((browserRequest) => {
        const requestUrl = new URL(browserRequest.url());
        return (
            browserRequest.method() === 'POST' &&
            requestUrl.pathname === TILE_QUERY_PATH
        );
    });

const parseTileQueryBody = (browserRequest: Request) => {
    expect(browserRequest.method()).toBe('POST');
    expect(new URL(browserRequest.url()).pathname).toBe(TILE_QUERY_PATH);

    const serializedBody = browserRequest.postData();
    if (serializedBody === null) {
        throw new Error('Embed tile query must have a serialized body');
    }

    return requireRecord(
        parseJson(serializedBody, 'Embed tile query body'),
        'Embed tile query body',
    );
};

test.describe('Embedded dashboard', { tag: '@mutating' }, () => {
    test.beforeEach(async ({ page }) => {
        await page.route(/^https:\/\/(?:[^/]+\.)?loom\.com\//, (route) =>
            route.abort(),
        );
    });

    test('can view an embedded dashboard with all interactivity options', async ({
        context,
        page,
        request,
    }) => {
        const embedUrl = await prepareEmbeddedDashboard(
            request,
            context,
            (dashboardUuid) => ({
                content: {
                    type: 'dashboard',
                    dashboardUuid,
                    dashboardFiltersInteractivity: {
                        enabled: FilterInteractivityValues.all,
                    },
                    canExportCsv: true,
                    canExportImages: true,
                    canDateZoom: true,
                    canExportPagePdf: true,
                },
            }),
        );

        await page.goto(embedUrl.toString());

        await expect(
            page.getByText('Welcome to Lightdash!', { exact: true }),
        ).toBeVisible();
        await expect(
            page.getByText(
                'Lightdash is an open source analytics for your dbt project.',
                { exact: true },
            ),
        ).toBeVisible();
        await expect(
            page.getByText('Payments total revenue', { exact: true }),
        ).toBeVisible();

        const averageSpendTileTitle = page.getByText(
            "What's the average spend per customer?",
            { exact: true },
        );
        await expect(averageSpendTileTitle).toBeVisible();
        await expect(
            page.getByText('Average order size', { exact: true }),
        ).toBeVisible();
        await expect(
            page.getByText(
                'Which customers have not recently ordered an item?',
                {
                    exact: true,
                },
            ),
        ).toBeVisible();
        await expect(
            page.getByText('Days between created and first order', {
                exact: true,
            }),
        ).toBeVisible();
        await expect(
            page.getByText('Is completed is true', { exact: true }),
        ).toBeVisible();
        await expect(
            page.getByText('Order date year in the last 10 completed years', {
                exact: true,
            }),
        ).toBeVisible();

        await averageSpendTileTitle.hover();
        const moreIcon = page.getByTestId('tile-icon-more');
        await expect(moreIcon).toHaveCount(1);
        await expect(moreIcon).toBeVisible();

        const menuButton = moreIcon.locator('xpath=ancestor::button[1]');
        await expect(menuButton).toHaveCount(1);
        await menuButton.click();

        await expect(
            page.getByRole('menuitem', { name: 'Download data', exact: true }),
        ).toBeVisible();
        await expect(
            page.getByRole('menuitem', { name: 'Export image', exact: true }),
        ).toBeVisible();
        await expect(
            page.getByRole('button', { name: 'Default zoom', exact: true }),
        ).toBeVisible();
    });

    test('forwards the timezone session override into embed tile queries', async ({
        context,
        page,
        request,
    }) => {
        const embedUrl = await prepareEmbeddedDashboard(
            request,
            context,
            (dashboardUuid) => ({
                content: { type: 'dashboard', dashboardUuid },
            }),
        );
        embedUrl.searchParams.set('timezone', TIMEZONE_OVERRIDE);

        const tileQueryPromise = waitForTileQuery(page);
        await page.goto(embedUrl.toString());
        const tileQueryBody = parseTileQueryBody(await tileQueryPromise);

        expect(hasOwnProperty(tileQueryBody, 'timezone')).toBe(true);
        expect(tileQueryBody.timezone).toBe(TIMEZONE_OVERRIDE);
    });

    test('omits timezone from embed tile queries without a session override', async ({
        context,
        page,
        request,
    }) => {
        const embedUrl = await prepareEmbeddedDashboard(
            request,
            context,
            (dashboardUuid) => ({
                content: { type: 'dashboard', dashboardUuid },
            }),
        );

        const tileQueryPromise = waitForTileQuery(page);
        await page.goto(embedUrl.toString());
        const tileQueryBody = parseTileQueryBody(await tileQueryPromise);

        expect(hasOwnProperty(tileQueryBody, 'timezone')).toBe(false);
    });
});
