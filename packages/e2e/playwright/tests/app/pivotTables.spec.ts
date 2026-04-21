import { SEED_PROJECT } from '@lightdash/common';
import { expect, test } from '../../fixtures';
import { dragAndDrop } from '../../helpers';

test.describe('Pivot Tables', () => {
    test('Can view shared pivot table from URL in explore', async ({
        adminPage: page,
    }) => {
        // Navigate to the explore page
        await page.goto(
            `/projects/${SEED_PROJECT.project_uuid}/tables/orders?create_saved_chart_version=%7B%22tableName%22%3A%22orders%22%2C%22metricQuery%22%3A%7B%22exploreName%22%3A%22%22%2C%22dimensions%22%3A%5B%22orders_order_date_week%22%2C%22orders_status%22%2C%22orders_is_completed%22%5D%2C%22metrics%22%3A%5B%22orders_total_order_amount%22%5D%2C%22filters%22%3A%7B%7D%2C%22sorts%22%3A%5B%7B%22fieldId%22%3A%22orders_order_date_week%22%2C%22descending%22%3Atrue%7D%5D%2C%22limit%22%3A500%2C%22tableCalculations%22%3A%5B%5D%2C%22additionalMetrics%22%3A%5B%5D%2C%22metricOverrides%22%3A%7B%7D%7D%2C%22pivotConfig%22%3A%7B%22columns%22%3A%5B%22orders_status%22%5D%7D%2C%22tableConfig%22%3A%7B%22columnOrder%22%3A%5B%22orders_order_date_week%22%2C%22orders_status%22%2C%22orders_is_completed%22%2C%22orders_total_order_amount%22%5D%7D%2C%22chartConfig%22%3A%7B%22type%22%3A%22table%22%2C%22config%22%3A%7B%22showColumnCalculation%22%3Afalse%2C%22showRowCalculation%22%3Afalse%2C%22showTableNames%22%3Atrue%2C%22showResultsTotal%22%3Afalse%2C%22showSubtotals%22%3Afalse%2C%22columns%22%3A%7B%7D%2C%22hideRowNumbers%22%3Afalse%2C%22conditionalFormattings%22%3A%5B%5D%2C%22metricsAsRows%22%3Afalse%7D%7D%7D`,
        );

        // run query
        await page.getByRole('button', { name: 'Run query' }).first().click();

        // These strings appear both in the pivot header and in the raw
        // results table, so scope the assertions to the first match.
        await expect(page.getByText('placed').first()).toBeVisible();
        await expect(page.getByText('shipped').first()).toBeVisible();

        await expect(page.getByText('False').first()).toBeVisible();
        await expect(page.getByText('2025-06-09').first()).toBeVisible();
        await expect(page.getByText('$1.00').first()).toBeVisible();
    });

    test('Can create a pivot table chart on explore', async ({
        adminPage: page,
    }) => {
        // Navigate to the explore page
        await page.goto(
            `/projects/${SEED_PROJECT.project_uuid}/tables/orders?create_saved_chart_version=%7B%22tableName%22%3A%22orders%22%2C%22metricQuery%22%3A%7B%22exploreName%22%3A%22%22%2C%22dimensions%22%3A%5B%22orders_order_date_week%22%2C%22orders_status%22%2C%22orders_is_completed%22%5D%2C%22metrics%22%3A%5B%22orders_total_order_amount%22%5D%2C%22filters%22%3A%7B%7D%2C%22sorts%22%3A%5B%7B%22fieldId%22%3A%22orders_order_date_week%22%2C%22descending%22%3Atrue%7D%5D%2C%22limit%22%3A500%2C%22tableCalculations%22%3A%5B%5D%2C%22additionalMetrics%22%3A%5B%5D%2C%22metricOverrides%22%3A%7B%7D%7D%2C%22tableConfig%22%3A%7B%22columnOrder%22%3A%5B%22orders_order_date_week%22%2C%22orders_status%22%2C%22orders_is_completed%22%2C%22orders_total_order_amount%22%5D%7D%2C%22chartConfig%22%3A%7B%22type%22%3A%22table%22%2C%22config%22%3A%7B%22showColumnCalculation%22%3Afalse%2C%22showRowCalculation%22%3Afalse%2C%22showTableNames%22%3Atrue%2C%22showResultsTotal%22%3Afalse%2C%22showSubtotals%22%3Afalse%2C%22columns%22%3A%7B%7D%2C%22hideRowNumbers%22%3Afalse%2C%22conditionalFormattings%22%3A%5B%5D%2C%22metricsAsRows%22%3Afalse%7D%7D%7D`,
        );

        // run query
        await page.getByRole('button', { name: 'Run query' }).first().click();

        await expect(page.getByText('Tables')).toBeVisible(); // Ensure the sidebar has loaded before clicking configure below
        await page.getByText('Configure').click();
        await expect(
            page.getByText(
                'Drag dimensions into this area to pivot your table',
            ),
        ).toBeVisible();

        const dragSelector =
            '[role="tabpanel"] [data-rfd-drag-handle-draggable-id="orders_is_completed"]';
        const dropSelector = '[data-rfd-droppable-id="COLUMNS"]';

        await dragAndDrop(page, dragSelector, dropSelector);

        const chartArea = page.getByTestId('visualization');

        await expect(chartArea.getByText('Loading chart')).toHaveCount(0);
        await expect(chartArea.getByText('Is completed')).toBeVisible(); // Check that the chart updated successfully with the pivot table(containing 'is completed' column)
    });

    // todo: remove
    test.skip('I can save a pivot table chart and add it to a dashboard', async ({
        adminPage: page,
    }) => {
        // Navigate to the explore page
        await page.goto(
            `/projects/${SEED_PROJECT.project_uuid}/tables/orders?create_saved_chart_version=%7B%22tableName%22%3A%22orders%22%2C%22metricQuery%22%3A%7B%22exploreName%22%3A%22%22%2C%22dimensions%22%3A%5B%22orders_order_date_week%22%2C%22orders_status%22%2C%22orders_is_completed%22%5D%2C%22metrics%22%3A%5B%22orders_total_order_amount%22%5D%2C%22filters%22%3A%7B%7D%2C%22sorts%22%3A%5B%7B%22fieldId%22%3A%22orders_order_date_week%22%2C%22descending%22%3Atrue%7D%5D%2C%22limit%22%3A500%2C%22tableCalculations%22%3A%5B%5D%2C%22additionalMetrics%22%3A%5B%5D%2C%22metricOverrides%22%3A%7B%7D%7D%2C%22pivotConfig%22%3A%7B%22columns%22%3A%5B%22orders_status%22%5D%7D%2C%22tableConfig%22%3A%7B%22columnOrder%22%3A%5B%22orders_order_date_week%22%2C%22orders_status%22%2C%22orders_is_completed%22%2C%22orders_total_order_amount%22%5D%7D%2C%22chartConfig%22%3A%7B%22type%22%3A%22table%22%2C%22config%22%3A%7B%22showColumnCalculation%22%3Afalse%2C%22showRowCalculation%22%3Afalse%2C%22showTableNames%22%3Atrue%2C%22showResultsTotal%22%3Afalse%2C%22showSubtotals%22%3Afalse%2C%22columns%22%3A%7B%7D%2C%22hideRowNumbers%22%3Afalse%2C%22conditionalFormattings%22%3A%5B%5D%2C%22metricsAsRows%22%3Afalse%7D%7D%7D`,
        );

        // Save a pivot table
        await page.getByText('Save chart').click();
        await page
            .getByTestId('ChartCreateModal/NameInput')
            .fill('My Pivot Table Chart');
        await page.getByText('Next').click();
        await page.getByText('Save').click();
        await expect(page.getByText('Chart was saved')).toBeVisible();
        await expect(page.getByText('My Pivot Table Chart')).toBeVisible();

        // Add pivot table to a new dashboard
        await page.locator('button:has(.tabler-icon-dots)').click();
        await page.getByText('Add to dashboard').click();

        await expect(page.getByText('Add chart to dashboard')).toBeVisible();
        await page.getByText('Create new dashboard').click();
        await page.locator('#dashboard-name').fill('My Pivot Table Dashboard');
        await page.locator('button[type="submit"]').click({ force: true }); // Create dashboard
        await page.getByText('Open dashboard').click();

        // Wait until dashboard is loaded
        await expect(page.getByText('Date Zoom')).toBeVisible();
        await expect(page.getByText('My Pivot Table Chart')).toBeVisible();
        await expect(page.getByText('placed')).toBeVisible();
        await expect(page.getByText('shipped')).toBeVisible();
        await expect(page.getByText('False')).toBeVisible();
        await expect(page.getByText('2025-06-09')).toBeVisible();
        await expect(page.getByText('$1.00')).toBeVisible();
    });
});

// todo: move to unit test
test.describe.skip('100% stacked bar chart', () => {
    test('Can create a 100% stacked bar chart with correct percentage labels', async ({
        adminPage: page,
    }) => {
        // Load directly a chart with parameters to build a 100% bar chart with labels
        const chartConfig = `?create_saved_chart_version=%7B%22tableName%22%3A%22orders%22%2C%22metricQuery%22%3A%7B%22exploreName%22%3A%22orders%22%2C%22dimensions%22%3A%5B%22orders_status%22%2C%22orders_order_date_month%22%5D%2C%22metrics%22%3A%5B%22orders_unique_order_count%22%5D%2C%22filters%22%3A%7B%7D%2C%22sorts%22%3A%5B%7B%22fieldId%22%3A%22orders_status%22%2C%22descending%22%3Afalse%7D%5D%2C%22limit%22%3A500%2C%22tableCalculations%22%3A%5B%5D%2C%22additionalMetrics%22%3A%5B%5D%2C%22metricOverrides%22%3A%7B%7D%7D%2C%22tableConfig%22%3A%7B%22columnOrder%22%3A%5B%22orders_status%22%2C%22orders_order_date_month%22%2C%22orders_unique_order_count%22%5D%7D%2C%22chartConfig%22%3A%7B%22type%22%3A%22cartesian%22%2C%22config%22%3A%7B%22layout%22%3A%7B%22xField%22%3A%22orders_order_date_month%22%2C%22yField%22%3A%5B%22orders_unique_order_count%22%5D%2C%22stack%22%3A%22stack100%22%7D%2C%22eChartsConfig%22%3A%7B%22series%22%3A%5B%7B%22type%22%3A%22bar%22%2C%22yAxisIndex%22%3A0%2C%22label%22%3A%7B%22show%22%3Atrue%2C%22position%22%3A%22inside%22%7D%2C%22encode%22%3A%7B%22xRef%22%3A%7B%22field%22%3A%22orders_order_date_month%22%7D%2C%22yRef%22%3A%7B%22field%22%3A%22orders_unique_order_count%22%2C%22pivotValues%22%3A%5B%7B%22field%22%3A%22orders_status%22%2C%22value%22%3A%22completed%22%7D%5D%7D%7D%2C%22stack%22%3A%22orders_unique_order_count%22%2C%22isFilteredOut%22%3Afalse%7D%2C%7B%22type%22%3A%22bar%22%2C%22yAxisIndex%22%3A0%2C%22label%22%3A%7B%22show%22%3Atrue%2C%22position%22%3A%22inside%22%7D%2C%22encode%22%3A%7B%22xRef%22%3A%7B%22field%22%3A%22orders_order_date_month%22%7D%2C%22yRef%22%3A%7B%22field%22%3A%22orders_unique_order_count%22%2C%22pivotValues%22%3A%5B%7B%22field%22%3A%22orders_status%22%2C%22value%22%3A%22placed%22%7D%5D%7D%7D%2C%22stack%22%3A%22orders_unique_order_count%22%2C%22isFilteredOut%22%3Afalse%7D%2C%7B%22type%22%3A%22bar%22%2C%22yAxisIndex%22%3A0%2C%22label%22%3A%7B%22show%22%3Atrue%2C%22position%22%3A%22inside%22%7D%2C%22encode%22%3A%7B%22xRef%22%3A%7B%22field%22%3A%22orders_order_date_month%22%7D%2C%22yRef%22%3A%7B%22field%22%3A%22orders_unique_order_count%22%2C%22pivotValues%22%3A%5B%7B%22field%22%3A%22orders_status%22%2C%22value%22%3A%22returned%22%7D%5D%7D%7D%2C%22stack%22%3A%22orders_unique_order_count%22%2C%22isFilteredOut%22%3Afalse%7D%2C%7B%22type%22%3A%22bar%22%2C%22yAxisIndex%22%3A0%2C%22label%22%3A%7B%22show%22%3Atrue%2C%22position%22%3A%22inside%22%7D%2C%22encode%22%3A%7B%22xRef%22%3A%7B%22field%22%3A%22orders_order_date_month%22%7D%2C%22yRef%22%3A%7B%22field%22%3A%22orders_unique_order_count%22%2C%22pivotValues%22%3A%5B%7B%22field%22%3A%22orders_status%22%2C%22value%22%3A%22return_pending%22%7D%5D%7D%7D%2C%22stack%22%3A%22orders_unique_order_count%22%2C%22isFilteredOut%22%3Afalse%7D%2C%7B%22type%22%3A%22bar%22%2C%22yAxisIndex%22%3A0%2C%22label%22%3A%7B%22show%22%3Atrue%2C%22position%22%3A%22inside%22%7D%2C%22encode%22%3A%7B%22xRef%22%3A%7B%22field%22%3A%22orders_order_date_month%22%7D%2C%22yRef%22%3A%7B%22field%22%3A%22orders_unique_order_count%22%2C%22pivotValues%22%3A%5B%7B%22field%22%3A%22orders_status%22%2C%22value%22%3A%22shipped%22%7D%5D%7D%7D%2C%22stack%22%3A%22orders_unique_order_count%22%2C%22isFilteredOut%22%3Afalse%7D%5D%7D%7D%7D%2C%22pivotConfig%22%3A%7B%22columns%22%3A%5B%22orders_status%22%5D%7D%7D&isExploreFromHere=true`;
        await page.goto(
            `/projects/${SEED_PROJECT.project_uuid}/tables/orders${chartConfig}`,
        );
        await expect(page.getByTestId('page-spinner')).toHaveCount(0);

        // These data should remain constant for the same data in orders table
        // Check labels on the chart are showing % values
        await expect(page.locator('svg').getByText('100.0%')).toBeVisible();
        await expect(page.locator('svg').getByText('88.9%')).toBeVisible();
        await expect(page.locator('svg').getByText('22.2%')).toBeVisible();
        await expect(page.locator('svg').getByText('0.0%')).toBeVisible();
    });
});
