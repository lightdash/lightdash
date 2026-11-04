import {
    CreateEmbedJwt,
    FilterInteractivityValues,
    SEED_ORG_1_ADMIN,
    SEED_PROJECT,
} from '@lightdash/common';
import {
    expect,
    json,
    loginAs,
    logout,
    SEED_USERS,
    test,
    TrackedApi,
    type Page,
} from '../../support/test';

const EMBED_API_PREFIX = `/api/v1/embed/${SEED_PROJECT.project_uuid}`;

const updateEmbedConfigDashboards = async (
    api: TrackedApi,
    dashboardUuids: string[],
) => {
    const response = await api.patch(`${EMBED_API_PREFIX}/config`, {
        data: {
            dashboardUuids,
            chartUuids: [],
            allowAllDashboards: false,
            allowAllCharts: false,
        },
    });
    expect(response.status()).toBe(200);
};

const getEmbedUrl = async (api: TrackedApi, body: CreateEmbedJwt) => {
    const response = await api.post(`${EMBED_API_PREFIX}/get-embed-url`, {
        data: body,
    });
    expect(response.status()).toBe(200);
    return (await json<{ url: string }>(response)).url;
};

const getJaffleDashboardUuid = async (api: TrackedApi) => {
    const response = await api.get(
        `/api/v2/content?pageSize=1&contentTypes=dashboard&search=jaffle`,
    );
    const { data } = await json<{ data: { uuid: string }[] }>(response);
    return data[0]?.uuid;
};

// Parent of the closest Mantine card around the tile title, like `.closest('.mantine-Card-root').parent()`.
const getTile = (page: Page, title: string) =>
    page
        .getByText(title)
        .first()
        .locator(
            'xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " mantine-Card-root ")][1]/..',
        );

const openTileMenu = async (page: Page, title: string) => {
    const tile = getTile(page, title);
    await tile.hover();
    await tile.getByRole('button', { name: 'Tile actions' }).click();
};

const isTileQuery = (request: { method(): string; url(): string }) =>
    request.method() === 'POST' &&
    request.url().includes(`${EMBED_API_PREFIX}/query/dashboard-tile`);

test.describe('Embedded dashboard', () => {
    test.beforeEach(async ({ api }) => {
        await loginAs(api.raw, SEED_USERS.admin);
    });

    test('I can view embedded dashboard and all interactivity options', async ({
        page,
        api,
    }) => {
        const dashboardUuid = await getJaffleDashboardUuid(api);

        // First we need to whitelist the dashboard in the embed config
        await updateEmbedConfigDashboards(api, [dashboardUuid]);

        const url = await getEmbedUrl(api, {
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
        });

        // make sure we are logged out and rely on embed token
        await logout(api.raw);

        // visit embed url
        await page.goto(url);

        // Check tiles
        await expect(page.getByText('Welcome to Lightdash!')).toBeVisible(); // markdown
        await expect(
            page.getByText(
                'Lightdash is an open source analytics for your dbt project.',
            ),
        ).toBeVisible(); // markdown

        await expect(
            page.getByText('Payments total revenue').first(),
        ).toBeVisible(); // big number tile

        await expect(
            page.getByText(`What's the average spend per customer?`),
        ).toBeVisible(); // bar chart
        await expect(
            page.getByText('Average order size').first(),
        ).toBeVisible(); // bar chart

        await expect(
            page.getByText(
                'Which customers have not recently ordered an item?',
            ),
        ).toBeVisible(); // table chart
        await expect(
            page.getByText('Days between created and first order').first(),
        ).toBeVisible(); // table chart

        // Check filters
        // Boolean pill values render the localized label ("True"),
        // not the raw value, since the uiOverrides refactor
        await expect(page.getByText('Is completed is True')).toBeVisible();

        await expect(
            page.getByText(/Order date year in the last \d+ completed years/),
        ).toBeVisible();

        // Check export options
        const chartTitle = `What's the average spend per customer?`;
        await openTileMenu(page, chartTitle);
        await expect(page.getByText('Download data')).toBeVisible();
        await expect(page.getByText('Export image')).toBeVisible();

        await getTile(page, chartTitle).dispatchEvent('mouseleave');
        await page.mouse.click(1, 1);
        await expect(page.getByText('Download data')).toHaveCount(0);

        // Check date zoom
        await expect(
            page.getByRole('button', { name: /zoom/i }),
        ).toBeAttached();
    });

    test('forwards the ?timezone= session override into embed tile queries', async ({
        page,
        api,
    }) => {
        const dashboardUuid = await getJaffleDashboardUuid(api);

        await updateEmbedConfigDashboards(api, [dashboardUuid]);

        const url = await getEmbedUrl(api, {
            content: { type: 'dashboard', dashboardUuid },
        });
        await logout(api.raw);

        const tileQueryPromise = page.waitForRequest(isTileQuery);

        // The session timezone is set via ?timezone= before the JWT
        // hash; the frontend should forward it in the request body.
        const embedUrl = new URL(url);
        embedUrl.searchParams.set('timezone', 'America/Los_Angeles');
        await page.goto(embedUrl.toString());

        const tileQuery = await tileQueryPromise;
        expect(
            (tileQuery.postDataJSON() as { timezone?: string }).timezone,
        ).toBe('America/Los_Angeles');
    });

    test('omits the timezone from embed tile queries when ?timezone= is absent', async ({
        page,
        api,
    }) => {
        const dashboardUuid = await getJaffleDashboardUuid(api);

        await updateEmbedConfigDashboards(api, [dashboardUuid]);

        const url = await getEmbedUrl(api, {
            content: { type: 'dashboard', dashboardUuid },
        });
        await logout(api.raw);

        const tileQueryPromise = page.waitForRequest(isTileQuery);

        await page.goto(url);

        const tileQuery = await tileQueryPromise;
        expect(tileQuery.postDataJSON()).not.toHaveProperty('timezone');
    });

    // todo: move to unit test
    test.skip('I can use "Explore from here" in embedded dashboard and view the correct elements', async ({
        page,
        api,
    }) => {
        const dashboardUuid = await getJaffleDashboardUuid(api);

        // First we need to whitelist the dashboard in the embed config
        await updateEmbedConfigDashboards(api, [dashboardUuid]);

        const url = await getEmbedUrl(api, {
            content: {
                type: 'dashboard',
                dashboardUuid,
                dashboardFiltersInteractivity: {
                    enabled: FilterInteractivityValues.all,
                },
                canExplore: true,
            },
        });

        // make sure we are logged out and rely on embed token
        await logout(api.raw);

        // visit embed url
        await page.goto(url);

        await expect(page.getByText('Welcome to Lightdash!')).toBeVisible();
        await expect(page.getByText('bank_transfer').first()).toBeVisible();

        // Find a chart tile and click "Explore from here"
        await openTileMenu(
            page,
            `How much revenue do we have per payment method?`,
        );
        await page.getByText('Explore from here').click();

        // Should navigate to embedded explore page
        await expect(page).toHaveURL(/\/embed\//);
        await expect(page).toHaveURL(/\/explore\//);

        // Check that "Back to Dashboard" button is visible
        await expect(page.getByText('Back to Dashboard')).toBeVisible();

        // Check that core explorer elements are visible
        await expect(page.getByText('Filters').first()).toBeVisible();
        await expect(page.getByText('Chart').first()).toBeVisible();
        await expect(page.getByText('Results').first()).toBeVisible();

        // Check that refresh button is visible (look for "Run query" text)
        await expect(page.getByText('Run query').first()).toBeVisible();

        // Check that elements that should NOT be visible in embedded mode are hidden
        // Save chart button should not be visible in embedded mode
        await expect(page.getByText('Save chart')).toHaveCount(0);

        // Share button should not be visible in embedded mode
        await expect(page.getByText('Share')).toHaveCount(0);

        // SQL card should not be visible in embedded mode (requires permissions)
        await expect(page.getByText('SQL')).toHaveCount(0);

        // Refresh DBT button should not be visible in embedded mode
        await expect(page.getByText('Refresh dbt')).toHaveCount(0);

        // No error message should be visible
        await expect(page.getByText('Error')).toHaveCount(0);

        // Test going back to dashboard
        await page.getByText('Back to Dashboard').click();
        await expect(page).toHaveURL(/\/embed\//);
        await expect(page).not.toHaveURL(/\/explore\//);

        // Should be back on the dashboard
        await expect(page.getByText('Welcome to Lightdash!')).toBeVisible();
    });

    // todo: move to unit test
    test.skip('URL syncs for dashboard filters in direct mode', async ({
        page,
        api,
    }) => {
        const dashboardUuid = await getJaffleDashboardUuid(api);

        await updateEmbedConfigDashboards(api, [dashboardUuid]);

        const url = await getEmbedUrl(api, {
            content: {
                type: 'dashboard',
                dashboardUuid,
                dashboardFiltersInteractivity: {
                    enabled: FilterInteractivityValues.all,
                },
            },
        });
        await logout(api.raw);
        await page.goto(url);

        // Wait for dashboard to load
        await expect(page.getByText('Welcome to Lightdash!')).toBeVisible();

        // Verify initial URL has no filter params
        await expect(page).not.toHaveURL(/filters=/);

        await page.getByText('Is completed is True').click();
        await expect(page.getByText('Orders Is completed')).toBeVisible();
        const dialog = page.getByRole('dialog');
        await dialog.locator('input[value="True"]').click();
        await dialog.getByText('False').click();
        await dialog
            .getByRole('button', { name: 'Apply' })
            .click({ force: true });

        // Verify URL contains filters param
        await expect(page).toHaveURL(/\?filters=/);
        await expect(page).toHaveURL(/false/);

        // Remove the filter
        await page.locator('[aria-label="Reset all filters"]').click();

        // Verify URL no longer contains filters param
        await expect(page).not.toHaveURL(/\?filters=/);
    });

    // todo: move to unit test
    test.skip('URL filter overrides apply for embedded dashboard with all filters allowed', async ({
        page,
        api,
    }) => {
        const dashboardUuid = await getJaffleDashboardUuid(api);

        await updateEmbedConfigDashboards(api, [dashboardUuid]);

        const url = await getEmbedUrl(api, {
            content: {
                type: 'dashboard',
                dashboardUuid,
                dashboardFiltersInteractivity: {
                    enabled: FilterInteractivityValues.all,
                },
            },
        });
        await logout(api.raw);

        // Construct filter override to set isComplete to false
        const filterOverride = {
            dimensions: [
                {
                    id: 'e7df7c5a-1070-439a-8300-125fe5f9b1af',
                    target: {
                        fieldId: 'orders_is_completed',
                        tableName: 'orders',
                    },
                    values: [false],
                    operator: 'equals',
                },
            ],
            metrics: [],
            tableCalculations: [],
        };

        const embedUrl = new URL(url);
        embedUrl.searchParams.set('filters', JSON.stringify(filterOverride));

        // Visit embed URL with filter override
        await page.goto(embedUrl.toString());

        // Wait for dashboard to load
        await expect(page.getByText('Welcome to Lightdash!')).toBeVisible();

        // Assert the UI shows False (the override value)
        await expect(page.getByText('Is completed is False')).toBeVisible();

        // Click reset to remove overrides
        await page.locator('[aria-label="Reset all filters"]').click();

        // Assert it reverts to True (original dashboard value)
        await expect(page.getByText('Is completed is True')).toBeVisible();
    });

    // todo: move to unit test
    test.skip('URL syncs for date zoom in direct mode', async ({
        page,
        api,
    }) => {
        const dashboardUuid = await getJaffleDashboardUuid(api);

        await updateEmbedConfigDashboards(api, [dashboardUuid]);

        const url = await getEmbedUrl(api, {
            content: {
                type: 'dashboard',
                dashboardUuid,
                canDateZoom: true,
            },
        });
        await logout(api.raw);
        await page.goto(url);

        // Wait for dashboard to load
        await expect(page.getByText('Welcome to Lightdash!')).toBeVisible();

        // Verify initial URL has no dateZoom param
        await expect(page).not.toHaveURL(/dateZoom=/);

        // Check that Date Zoom dropdown is visible
        await expect(page.getByText('Default zoom')).toBeVisible();

        // Click the Date Zoom dropdown
        await page.getByText('Default zoom').click();

        // Select a granularity (e.g., Month)
        await page.getByText('Month').click();

        // Verify URL contains dateZoom param
        await expect(page).toHaveURL(/dateZoom=month/);
    });
});

test.describe('Embedded AI agent dashboard viewer', () => {
    test.beforeEach(async ({ api }) => {
        await loginAs(api.raw, SEED_USERS.admin);
    });

    // An aiAgent token opens a saved dashboard from its write space on the
    // embed's own route, read-only, and returns to the conversation.
    test('opens a write-space dashboard read-only with a way back', async ({
        page,
        api,
    }) => {
        const agentUuid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
        const dashboardUuid = await getJaffleDashboardUuid(api);
        const dashboardResponse = await api.get(
            `/api/v1/dashboards/${dashboardUuid}`,
        );
        const { spaceUuid } = await json<{ spaceUuid: string }>(
            dashboardResponse,
        );
        const url = await getEmbedUrl(api, {
            content: { type: 'aiAgent', agentUuid },
            writeActions: {
                userUuid: SEED_ORG_1_ADMIN.user_uuid,
                spaceUuid,
            },
        });
        await logout(api.raw);

        const token = url.split('#')[1];
        const threadsPath = `/embed/${SEED_PROJECT.project_uuid}/ai-agents/${agentUuid}/threads`;
        const embedDashboardPromise = page.waitForResponse(
            (response) =>
                response.request().method() === 'POST' &&
                /\/api\/v1\/embed\/[^/]+\/dashboard/.test(response.url()),
        );
        await page.goto(
            `/embed/${SEED_PROJECT.project_uuid}/ai-agents/${agentUuid}/dashboards/${dashboardUuid}?embedBackUrl=${encodeURIComponent(threadsPath)}#${token}`,
        );
        expect((await embedDashboardPromise).status()).toBe(200);

        await expect(
            page.getByText('Payments total revenue').first(),
        ).toBeVisible();
        await expect(
            page.getByText(`What's the average spend per customer?`),
        ).toBeVisible();

        // Read-only: a tile's menu offers Explore from here
        // (the write user may explore) and nothing that
        // exports or edits. The menu appears once the tile's
        // query has loaded, so wait for it rather than
        // asserting before the tiles load.
        const tileTitle = `What's the average spend per customer?`;
        const tile = getTile(page, tileTitle);
        await tile.scrollIntoViewIfNeeded();
        await tile.hover();
        const tileActions = tile.getByRole('button', { name: 'Tile actions' });
        await expect(tileActions).toBeAttached({ timeout: 30_000 });
        await tileActions.click({ force: true });
        const menu = page.getByRole('menu');
        await expect(menu).toBeVisible();
        await expect(menu.getByText('Explore from here')).toBeVisible();
        await expect(menu.getByRole('menuitem')).toHaveCount(1);
        await expect(page.getByText('Download data')).toHaveCount(0);
        await expect(page.getByText('Export image')).toHaveCount(0);
        await page.keyboard.press('Escape');

        await page.getByRole('button', { name: 'Back to AI' }).click();
        await expect(page).toHaveURL(
            (currentUrl) => currentUrl.pathname === threadsPath,
        );
    });
});
