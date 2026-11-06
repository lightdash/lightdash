import { SEED_PROJECT } from '@lightdash/common';
import {
    dragAndDrop,
    expect,
    fillChartName,
    loginAs,
    SEED_USERS,
    test,
} from '../../support/test';

const PIVOTED_CHART_VERSION =
    '%7B%22tableName%22%3A%22orders%22%2C%22metricQuery%22%3A%7B%22exploreName%22%3A%22%22%2C%22dimensions%22%3A%5B%22orders_order_date_week%22%2C%22orders_status%22%2C%22orders_is_completed%22%5D%2C%22metrics%22%3A%5B%22orders_total_order_amount%22%5D%2C%22filters%22%3A%7B%7D%2C%22sorts%22%3A%5B%7B%22fieldId%22%3A%22orders_order_date_week%22%2C%22descending%22%3Atrue%7D%5D%2C%22limit%22%3A500%2C%22tableCalculations%22%3A%5B%5D%2C%22additionalMetrics%22%3A%5B%5D%2C%22metricOverrides%22%3A%7B%7D%7D%2C%22pivotConfig%22%3A%7B%22columns%22%3A%5B%22orders_status%22%5D%7D%2C%22tableConfig%22%3A%7B%22columnOrder%22%3A%5B%22orders_order_date_week%22%2C%22orders_status%22%2C%22orders_is_completed%22%2C%22orders_total_order_amount%22%5D%7D%2C%22chartConfig%22%3A%7B%22type%22%3A%22table%22%2C%22config%22%3A%7B%22showColumnCalculation%22%3Afalse%2C%22showRowCalculation%22%3Afalse%2C%22showTableNames%22%3Atrue%2C%22showResultsTotal%22%3Afalse%2C%22showSubtotals%22%3Afalse%2C%22columns%22%3A%7B%7D%2C%22hideRowNumbers%22%3Afalse%2C%22conditionalFormattings%22%3A%5B%5D%2C%22metricsAsRows%22%3Afalse%7D%7D%7D';
const UNPIVOTED_CHART_VERSION =
    '%7B%22tableName%22%3A%22orders%22%2C%22metricQuery%22%3A%7B%22exploreName%22%3A%22%22%2C%22dimensions%22%3A%5B%22orders_order_date_week%22%2C%22orders_status%22%2C%22orders_is_completed%22%5D%2C%22metrics%22%3A%5B%22orders_total_order_amount%22%5D%2C%22filters%22%3A%7B%7D%2C%22sorts%22%3A%5B%7B%22fieldId%22%3A%22orders_order_date_week%22%2C%22descending%22%3Atrue%7D%5D%2C%22limit%22%3A500%2C%22tableCalculations%22%3A%5B%5D%2C%22additionalMetrics%22%3A%5B%5D%2C%22metricOverrides%22%3A%7B%7D%7D%2C%22tableConfig%22%3A%7B%22columnOrder%22%3A%5B%22orders_order_date_week%22%2C%22orders_status%22%2C%22orders_is_completed%22%2C%22orders_total_order_amount%22%5D%7D%2C%22chartConfig%22%3A%7B%22type%22%3A%22table%22%2C%22config%22%3A%7B%22showColumnCalculation%22%3Afalse%2C%22showRowCalculation%22%3Afalse%2C%22showTableNames%22%3Atrue%2C%22showResultsTotal%22%3Afalse%2C%22showSubtotals%22%3Afalse%2C%22columns%22%3A%7B%7D%2C%22hideRowNumbers%22%3Afalse%2C%22conditionalFormattings%22%3A%5B%5D%2C%22metricsAsRows%22%3Afalse%7D%7D%7D';

test.describe('Pivot Tables', () => {
    test.beforeEach(async ({ api }) => {
        await loginAs(api.raw, SEED_USERS.admin);
    });
    test('Can view shared pivot table from URL in explore', async ({
        page,
    }) => {
        // Navigate to the explore page
        await page.goto(
            `/projects/${SEED_PROJECT.project_uuid}/tables/orders?create_saved_chart_version=${PIVOTED_CHART_VERSION}`,
        );

        // run query
        await page.getByRole('button', { name: 'Run query' }).first().click();

        // Create a pivot table
        await expect(page.getByText('placed').first()).toBeAttached();
        await expect(page.getByText('shipped').first()).toBeAttached();

        await expect(page.getByText('False').first()).toBeAttached();
        await expect(page.getByText('2025-06-09').first()).toBeAttached();
        await expect(page.getByText('$1.00').first()).toBeAttached();
    });
    test('Can create a pivot table chart on explore', async ({ page }) => {
        // Navigate to the explore page
        await page.goto(
            `/projects/${SEED_PROJECT.project_uuid}/tables/orders?create_saved_chart_version=${UNPIVOTED_CHART_VERSION}`,
        );

        await expect(page.getByTestId('page-spinner')).toHaveCount(0, {
            timeout: 30000,
        });

        // run query
        await page.getByRole('button', { name: 'Run query' }).first().click();

        // Ensure the sidebar has loaded before clicking configure below
        await expect(page.getByText('Tables').first()).toBeVisible();
        await page.getByText('Configure').first().click();
        await expect(
            page
                .getByText('Drag dimensions into this area to pivot your table')
                .first(),
        ).toBeAttached();

        const dragSelector =
            '[role="tabpanel"] [data-rfd-drag-handle-draggable-id="orders_is_completed"]:visible';
        const dropSelector = '[data-rfd-droppable-id="COLUMNS"]:visible';

        await dragAndDrop(page, dragSelector, dropSelector);

        // Pivoting now runs in SQL, so re-run the query to fetch pivoted results.
        await page.getByRole('button', { name: 'Run query' }).first().click();

        const chartArea = page.getByTestId('visualization');

        await expect(
            chartArea.getByText('Loading chart', { exact: true }),
        ).toHaveCount(0);
        // Generous timeout to cover the pivoted query round-trip.
        // Check that the chart updated successfully with the pivot table(containing 'is completed' column)
        await expect(chartArea.getByText('Is completed').first()).toBeAttached({
            timeout: 30000,
        });
    });

    // todo: remove
    test.skip('I can save a pivot table chart and add it to a dashboard', async ({
        page,
    }) => {
        // Navigate to the explore page
        await page.goto(
            `/projects/${SEED_PROJECT.project_uuid}/tables/orders?create_saved_chart_version=${PIVOTED_CHART_VERSION}`,
        );

        // Save a pivot table
        await page.getByText('Save chart').first().click();
        await fillChartName(page, 'My Pivot Table Chart');
        await page.getByText('Next', { exact: true }).click();
        await page.getByText('Save', { exact: true }).click();
        await expect(page.getByText('Chart was saved').first()).toBeAttached();
        await expect(
            page.getByText('My Pivot Table Chart').first(),
        ).toBeAttached();

        // Add pivot table to a new dashboard
        await page.locator('button:has(.tabler-icon-dots)').click();
        await page.getByText('Add to dashboard').first().click();

        await expect(
            page.getByText('Add chart to dashboard').first(),
        ).toBeAttached();
        await page.getByText('Create new dashboard').first().click();
        await page.locator('#dashboard-name').fill('My Pivot Table Dashboard');
        // Create dashboard
        await page.locator('button[type="submit"]').click({ force: true });
        await page.getByText('Open dashboard').first().click();

        // Wait until dashboard is loaded
        await expect(page.getByText('Date Zoom').first()).toBeAttached();
        await expect(
            page.getByText('My Pivot Table Chart').first(),
        ).toBeAttached();
        await expect(page.getByText('placed').first()).toBeAttached();
        await expect(page.getByText('shipped').first()).toBeAttached();
        await expect(page.getByText('False').first()).toBeAttached();
        await expect(page.getByText('2025-06-09').first()).toBeAttached();
        await expect(page.getByText('$1.00').first()).toBeAttached();
    });
});

// todo: move to unit test
test.describe.skip('100% stacked bar chart', () => {
    test.beforeEach(async ({ api }) => {
        await loginAs(api.raw, SEED_USERS.admin);
    });
    test('Can create a 100% stacked bar chart with correct percentage labels', async ({
        page,
    }) => {
        // Load directly a chart with parameters to build a 100% bar chat with labels
        const chartConfig = `?create_saved_chart_version=%7B%22tableName%22%3A%22orders%22%2C%22metricQuery%22%3A%7B%22exploreName%22%3A%22orders%22%2C%22dimensions%22%3A%5B%22orders_status%22%2C%22orders_order_date_month%22%5D%2C%22metrics%22%3A%5B%22orders_unique_order_count%22%5D%2C%22filters%22%3A%7B%7D%2C%22sorts%22%3A%5B%7B%22fieldId%22%3A%22orders_status%22%2C%22descending%22%3Afalse%7D%5D%2C%22limit%22%3A500%2C%22tableCalculations%22%3A%5B%5D%2C%22additionalMetrics%22%3A%5B%5D%2C%22metricOverrides%22%3A%7B%7D%7D%2C%22tableConfig%22%3A%7B%22columnOrder%22%3A%5B%22orders_status%22%2C%22orders_order_date_month%22%2C%22orders_unique_order_count%22%5D%7D%2C%22chartConfig%22%3A%7B%22type%22%3A%22cartesian%22%2C%22config%22%3A%7B%22layout%22%3A%7B%22xField%22%3A%22orders_order_date_month%22%2C%22yField%22%3A%5B%22orders_unique_order_count%22%5D%2C%22stack%22%3A%22stack100%22%7D%2C%22eChartsConfig%22%3A%7B%22series%22%3A%5B%7B%22type%22%3A%22bar%22%2C%22yAxisIndex%22%3A0%2C%22label%22%3A%7B%22show%22%3Atrue%2C%22position%22%3A%22inside%22%7D%2C%22encode%22%3A%7B%22xRef%22%3A%7B%22field%22%3A%22orders_order_date_month%22%7D%2C%22yRef%22%3A%7B%22field%22%3A%22orders_unique_order_count%22%2C%22pivotValues%22%3A%5B%7B%22field%22%3A%22orders_status%22%2C%22value%22%3A%22completed%22%7D%5D%7D%7D%2C%22stack%22%3A%22orders_unique_order_count%22%2C%22isFilteredOut%22%3Afalse%7D%2C%7B%22type%22%3A%22bar%22%2C%22yAxisIndex%22%3A0%2C%22label%22%3A%7B%22show%22%3Atrue%2C%22position%22%3A%22inside%22%7D%2C%22encode%22%3A%7B%22xRef%22%3A%7B%22field%22%3A%22orders_order_date_month%22%7D%2C%22yRef%22%3A%7B%22field%22%3A%22orders_unique_order_count%22%2C%22pivotValues%22%3A%5B%7B%22field%22%3A%22orders_status%22%2C%22value%22%3A%22placed%22%7D%5D%7D%7D%2C%22stack%22%3A%22orders_unique_order_count%22%2C%22isFilteredOut%22%3Afalse%7D%2C%7B%22type%22%3A%22bar%22%2C%22yAxisIndex%22%3A0%2C%22label%22%3A%7B%22show%22%3Atrue%2C%22position%22%3A%22inside%22%7D%2C%22encode%22%3A%7B%22xRef%22%3A%7B%22field%22%3A%22orders_order_date_month%22%7D%2C%22yRef%22%3A%7B%22field%22%3A%22orders_unique_order_count%22%2C%22pivotValues%22%3A%5B%7B%22field%22%3A%22orders_status%22%2C%22value%22%3A%22returned%22%7D%5D%7D%7D%2C%22stack%22%3A%22orders_unique_order_count%22%2C%22isFilteredOut%22%3Afalse%7D%2C%7B%22type%22%3A%22bar%22%2C%22yAxisIndex%22%3A0%2C%22label%22%3A%7B%22show%22%3Atrue%2C%22position%22%3A%22inside%22%7D%2C%22encode%22%3A%7B%22xRef%22%3A%7B%22field%22%3A%22orders_order_date_month%22%7D%2C%22yRef%22%3A%7B%22field%22%3A%22orders_unique_order_count%22%2C%22pivotValues%22%3A%5B%7B%22field%22%3A%22orders_status%22%2C%22value%22%3A%22return_pending%22%7D%5D%7D%7D%2C%22stack%22%3A%22orders_unique_order_count%22%2C%22isFilteredOut%22%3Afalse%7D%2C%7B%22type%22%3A%22bar%22%2C%22yAxisIndex%22%3A0%2C%22label%22%3A%7B%22show%22%3Atrue%2C%22position%22%3A%22inside%22%7D%2C%22encode%22%3A%7B%22xRef%22%3A%7B%22field%22%3A%22orders_order_date_month%22%7D%2C%22yRef%22%3A%7B%22field%22%3A%22orders_unique_order_count%22%2C%22pivotValues%22%3A%5B%7B%22field%22%3A%22orders_status%22%2C%22value%22%3A%22shipped%22%7D%5D%7D%7D%2C%22stack%22%3A%22orders_unique_order_count%22%2C%22isFilteredOut%22%3Afalse%7D%5D%7D%7D%7D%2C%22pivotConfig%22%3A%7B%22columns%22%3A%5B%22orders_status%22%5D%7D%7D&isExploreFromHere=true`;
        await page.goto(
            `/projects/${SEED_PROJECT.project_uuid}/tables/orders${chartConfig}`,
        );
        await expect(page.getByTestId('page-spinner')).toHaveCount(0);

        // These data should remain constant for the same data in orders table
        // Check labels on the chart are showing % values
        const svg = page.locator('svg');
        await expect(svg.getByText('100.0%').first()).toBeAttached();
        await expect(svg.getByText('88.9%').first()).toBeAttached();
        await expect(svg.getByText('22.2%').first()).toBeAttached();
        await expect(svg.getByText('0.0%').first()).toBeAttached();
    });
});
