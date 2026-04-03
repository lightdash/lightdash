import {
    FilterInteractivityValues,
    SEED_PROJECT,
    type CreateEmbedJwt,
} from '@lightdash/common';
import { expect, test } from '../../fixtures';
import { logout } from '../../helpers';

const EMBED_API_PREFIX = `/api/v1/embed/${SEED_PROJECT.project_uuid}`;

const updateEmbedConfigDashboards = async (
    request: import('@playwright/test').APIRequestContext,
    dashboardUuids: string[],
) => {
    const response = await request.patch(
        `${EMBED_API_PREFIX}/config/dashboards`,
        {
            headers: { 'Content-type': 'application/json' },
            data: {
                dashboardUuids,
                chartUuids: [],
                allowAllDashboards: false,
                allowAllCharts: false,
            },
        },
    );
    return response;
};

const getEmbedUrl = async (
    request: import('@playwright/test').APIRequestContext,
    body: CreateEmbedJwt,
) => {
    const response = await request.post(`${EMBED_API_PREFIX}/get-embed-url`, {
        headers: { 'Content-type': 'application/json' },
        data: body,
    });
    return response;
};

const getJaffleDashboard = async (
    request: import('@playwright/test').APIRequestContext,
) => {
    const response = await request.get(
        `/api/v2/content?pageSize=1&contentTypes=dashboard&search=jaffle`,
    );
    return response;
};

test.describe('Embedded dashboard', () => {
    test('I can view embedded dashboard and all interactivity options', async ({
        adminPage: page,
    }) => {
        const dashboardsResp = await getJaffleDashboard(page.request);
        const dashboardsBody = await dashboardsResp.json();
        const dashboardUuid = dashboardsBody.results.data[0]?.uuid;

        // First we need to whitelist the dashboard in the embed config
        const updateResp = await updateEmbedConfigDashboards(page.request, [
            dashboardUuid,
        ]);
        expect(updateResp.status()).toBe(200);

        const resp = await getEmbedUrl(page.request, {
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
        const respBody = await resp.json();

        // make sure we are logged out and rely on embed token
        await logout(page.request);

        // visit embed url
        await page.goto(respBody.results.url);

        // Check tiles
        await expect(page.getByText('Welcome to Lightdash!')).toBeVisible();
        await expect(
            page.getByText(
                'Lightdash is an open source analytics for your dbt project.',
            ),
        ).toBeVisible(); // markdown

        await expect(page.getByText('Payments total revenue')).toBeVisible(); // big number tile

        await expect(
            page.getByText(`What's the average spend per customer?`),
        ).toBeVisible(); // bar chart
        await expect(page.getByText('Average order size')).toBeVisible(); // bar chart

        await expect(
            page.getByText(
                'Which customers have not recently ordered an item?',
            ),
        ).toBeVisible(); // table chart
        await expect(
            page.getByText('Days between created and first order'),
        ).toBeVisible(); // table chart

        // Check filters
        await expect(page.getByText('Is completed is true')).toBeVisible();

        await expect(
            page.getByText('Order date year in the last 10 completed years'),
        ).toBeVisible();

        // Check export options
        await page.getByText(`What's the average spend per customer?`).hover();
        await page.getByTestId('tile-icon-more').click();
        await expect(page.getByText('Download data')).toBeVisible();
        await expect(page.getByText('Export image')).toBeVisible();

        // Check date zoom
        await expect(page.getByText('Date Zoom')).toBeVisible();
    });

    // todo: move to unit test
    test.skip('I can use "Explore from here" in embedded dashboard and view the correct elements', async ({
        adminPage: page,
    }) => {
        const dashboardsResp = await getJaffleDashboard(page.request);
        const dashboardsBody = await dashboardsResp.json();
        const dashboardUuid = dashboardsBody.results.data[0]?.uuid;

        // First we need to whitelist the dashboard in the embed config
        const updateResp = await updateEmbedConfigDashboards(page.request, [
            dashboardUuid,
        ]);
        expect(updateResp.status()).toBe(200);

        const resp = await getEmbedUrl(page.request, {
            content: {
                type: 'dashboard',
                dashboardUuid,
                dashboardFiltersInteractivity: {
                    enabled: FilterInteractivityValues.all,
                },
                canExplore: true,
            },
        });
        const respBody = await resp.json();

        // make sure we are logged out and rely on embed token
        await logout(page.request);

        // visit embed url
        await page.goto(respBody.results.url);

        await expect(page.getByText('Welcome to Lightdash!')).toBeVisible();
        await expect(page.getByText('bank_transfer')).toBeVisible();

        // Find a chart tile and click "Explore from here"
        await page
            .getByText(`How much revenue do we have per payment method?`)
            .hover();
        await page.getByTestId('tile-icon-more').click();
        await page.getByText('Explore from here').click();

        // Should navigate to embedded explore page
        await expect(page).toHaveURL(/\/embed\//);
        await expect(page).toHaveURL(/\/explore\//);

        // Check that "Back to Dashboard" button is visible
        await expect(page.getByText('Back to Dashboard')).toBeVisible();

        // Check that core explorer elements are visible
        await expect(page.getByText('Filters')).toBeVisible();
        await expect(page.getByText('Chart')).toBeVisible();
        await expect(page.getByText('Results')).toBeVisible();

        // Check that refresh button is visible (look for "Run query" text)
        await expect(page.getByText('Run query')).toBeVisible();

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
        adminPage: page,
    }) => {
        const dashboardsResp = await getJaffleDashboard(page.request);
        const dashboardsBody = await dashboardsResp.json();
        const dashboardUuid = dashboardsBody.results.data[0]?.uuid;

        const updateResp = await updateEmbedConfigDashboards(page.request, [
            dashboardUuid,
        ]);
        expect(updateResp.status()).toBe(200);

        const resp = await getEmbedUrl(page.request, {
            content: {
                type: 'dashboard',
                dashboardUuid,
                dashboardFiltersInteractivity: {
                    enabled: FilterInteractivityValues.all,
                },
            },
        });
        const respBody = await resp.json();

        await logout(page.request);
        await page.goto(respBody.results.url);

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
        adminPage: page,
    }) => {
        const dashboardsResp = await getJaffleDashboard(page.request);
        const dashboardsBody = await dashboardsResp.json();
        const dashboardUuid = dashboardsBody.results.data[0]?.uuid;

        const updateResp = await updateEmbedConfigDashboards(page.request, [
            dashboardUuid,
        ]);
        expect(updateResp.status()).toBe(200);

        const resp = await getEmbedUrl(page.request, {
            content: {
                type: 'dashboard',
                dashboardUuid,
                dashboardFiltersInteractivity: {
                    enabled: FilterInteractivityValues.all,
                },
            },
        });
        const respBody = await resp.json();

        await logout(page.request);

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

        const embedUrl = new URL(respBody.results.url);
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
        adminPage: page,
    }) => {
        const dashboardsResp = await getJaffleDashboard(page.request);
        const dashboardsBody = await dashboardsResp.json();
        const dashboardUuid = dashboardsBody.results.data[0]?.uuid;

        const updateResp = await updateEmbedConfigDashboards(page.request, [
            dashboardUuid,
        ]);
        expect(updateResp.status()).toBe(200);

        const resp = await getEmbedUrl(page.request, {
            content: {
                type: 'dashboard',
                dashboardUuid,
                canDateZoom: true,
            },
        });
        const respBody = await resp.json();

        await logout(page.request);
        await page.goto(respBody.results.url);

        // Wait for dashboard to load
        await expect(page.getByText('Welcome to Lightdash!')).toBeVisible();

        // Verify initial URL has no dateZoom param
        await expect(page).not.toHaveURL(/dateZoom=/);

        // Check that Date Zoom dropdown is visible
        await expect(page.getByText('Date Zoom')).toBeVisible();

        // Click the Date Zoom dropdown
        await page.getByText('Date Zoom').click();

        // Select a granularity (e.g., Month)
        await page.getByText('Month').click();

        // Verify URL contains dateZoom param
        await expect(page).toHaveURL(/dateZoom=month/);
    });
});
