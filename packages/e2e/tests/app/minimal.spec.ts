import {
    ApiChartSummaryListResponse,
    DashboardBasicDetails,
    SCREENSHOT_READY_INDICATOR_ID,
    SEED_PROJECT,
} from '@lightdash/common';
import {
    expect,
    json,
    loginAs,
    SEED_USERS,
    test,
    TrackedApi,
} from '../../support/test';

const apiUrl = '/api/v1';

const getChartUuid = async (api: TrackedApi, name: string) => {
    const response = await api.get(
        `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/charts`,
    );
    const charts = await json<ApiChartSummaryListResponse['results']>(response);
    const savedChart = charts.find((s) => s.name === name);
    expect(savedChart, name).toBeDefined();
    return savedChart!.uuid;
};

test.describe('Minimal pages', () => {
    test.beforeEach(async ({ api }) => {
        await loginAs(api.raw, SEED_USERS.admin);
    });

    test('I can view a minimal chart', async ({ page, api }) => {
        const chartUuid = await getChartUuid(
            api,
            'How much revenue do we have per payment method?',
        );

        await page.goto(
            `/minimal/projects/${SEED_PROJECT.project_uuid}/saved/${chartUuid}`,
        );

        await expect(page.locator('.echarts-for-react')).toBeAttached();
        await expect(page.getByText('Payment method').first()).toBeVisible();
        await expect(page.getByText('Total revenue').first()).toBeVisible();
    });

    test('I can view a minimal table', async ({ page, api }) => {
        const chartUuid = await getChartUuid(
            api,
            'Which customers have not recently ordered an item?',
        );

        await page.goto(
            `/minimal/projects/${SEED_PROJECT.project_uuid}/saved/${chartUuid}`,
        );

        const table = page.locator('table');
        await expect(
            table.getByText('Days between created and first order').first(),
        ).toBeVisible();
        await expect(table.getByText('Total revenue').first()).toBeVisible();
    });

    test('I can view a minimal big number', async ({ page, api }) => {
        const chartUuid = await getChartUuid(
            api,
            `What's our total revenue to date?`,
        );

        await page.goto(
            `/minimal/projects/${SEED_PROJECT.project_uuid}/saved/${chartUuid}`,
        );

        await expect(
            page.locator(`#${SCREENSHOT_READY_INDICATOR_ID}`),
        ).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });

        await expect(
            page.getByText('Payments total revenue').first(),
        ).toBeVisible();
        await expect(page.getByTestId('big-number-value')).toContainText(
            '2,397',
        );
    });

    test('I can view a minimal dashboard', async ({ page, api }) => {
        const response = await api.get(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/dashboards`,
        );
        const dashboards = await json<DashboardBasicDetails[]>(response);
        const dashboard = dashboards.find((s) => s.name === `Jaffle dashboard`);
        expect(dashboard).toBeDefined();

        await page.goto(
            `/minimal/projects/${SEED_PROJECT.project_uuid}/dashboards/${dashboard!.uuid}`,
        );

        await expect(
            page.locator(`#${SCREENSHOT_READY_INDICATOR_ID}`),
        ).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });

        // await expect(page.getByText('Jaffle dashboard')).toBeVisible() // minimal doesn't show titles

        await expect(page.getByText('Welcome to Lightdash!')).toBeVisible(); // markdown
        await expect(
            page.getByText(
                'Lightdash is an open source analytics for your dbt project.',
            ),
        ).toBeVisible(); // markdown

        await expect(page.getByTestId('big-number-value')).toContainText(
            '1,961.5',
        );

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
    });

    test('Screenshot ready indicator works with edge cases (orphan tiles, empty results, errors)', async ({
        page,
    }) => {
        // Uses hardcoded dashboard from seed: 08_scheduled_delivery_edge_cases_dashboard.ts
        // Contains: 1 bar chart, 1 orphan tile, 1 empty results table, 1 table with invalid metric
        const edgeCasesDashboardUuid = '4f34f5a2-93df-4e5b-a6f1-b6167b19a8ba';

        await page.goto(
            `/minimal/projects/${SEED_PROJECT.project_uuid}/dashboards/${edgeCasesDashboardUuid}`,
        );

        const indicator = page.locator(`#${SCREENSHOT_READY_INDICATOR_ID}`);

        // Wait for screenshot ready indicator to appear (max 30s for slow queries)
        await expect(indicator).toBeAttached({ timeout: 30_000 });

        // Verify the indicator has expected data attributes
        await expect(indicator).toHaveAttribute('data-tiles-total', '4');

        // Should have some errored tiles (orphan + invalid metric)
        await expect
            .poll(async () =>
                Number(await indicator.getAttribute('data-tiles-errored')),
            )
            .toBeGreaterThan(0);

        // Verify status is completed-with-errors (due to orphan/error tiles)
        await expect(indicator).toHaveAttribute(
            'data-status',
            'completed-with-errors',
        );
    });
});
