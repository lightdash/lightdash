import { SEED_PROJECT } from '@lightdash/common';
import { expect, test, type Locator, type Page } from '@playwright/test';

const tableChart = {
    tableName: 'orders',
    metricQuery: {
        exploreName: '',
        dimensions: [
            'orders_order_date_week',
            'orders_status',
            'orders_is_completed',
        ],
        metrics: ['orders_total_order_amount'],
        filters: {},
        sorts: [
            {
                fieldId: 'orders_order_date_week',
                descending: true,
            },
        ],
        limit: 500,
        tableCalculations: [],
        additionalMetrics: [],
        metricOverrides: {},
    },
    tableConfig: {
        columnOrder: [
            'orders_order_date_week',
            'orders_status',
            'orders_is_completed',
            'orders_total_order_amount',
        ],
    },
    chartConfig: {
        type: 'table',
        config: {
            showColumnCalculation: false,
            showRowCalculation: false,
            showTableNames: true,
            showResultsTotal: false,
            showSubtotals: false,
            columns: {},
            hideRowNumbers: false,
            conditionalFormattings: [],
            metricsAsRows: false,
        },
    },
};

const sharedPivotTableChart = {
    ...tableChart,
    pivotConfig: {
        columns: ['orders_status'],
    },
};

const getExploreUrl = (chart: typeof tableChart) =>
    `/projects/${SEED_PROJECT.project_uuid}/tables/orders?create_saved_chart_version=${encodeURIComponent(JSON.stringify(chart))}`;

const runQuery = async (page: Page) => {
    await page
        .getByRole('button', { name: /^Run query/ })
        .first()
        .click();
};

const expectPivotedResults = async (page: Page) => {
    const visualization = page.getByTestId('visualization');
    await expect(
        visualization.getByText('placed', { exact: true }).first(),
    ).toBeVisible();
    await expect(
        visualization.getByText('shipped', { exact: true }).first(),
    ).toBeVisible();
    await expect(
        visualization.getByText('False', { exact: true }).first(),
    ).toBeVisible();
    await expect(
        visualization.getByText('2025-06-09', { exact: true }).first(),
    ).toBeVisible();
    await expect(
        visualization.getByText('$1.00', { exact: true }).first(),
    ).toBeVisible();
};

const dragTo = async (page: Page, draggable: Locator, droppable: Locator) => {
    await draggable.scrollIntoViewIfNeeded();
    const start = await draggable.boundingBox();
    const end = await droppable.boundingBox();

    if (start === null || end === null) {
        throw new Error('Drag and drop elements must be visible');
    }

    await page.mouse.move(
        start.x + start.width / 2,
        start.y + start.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(start.x + start.width / 2 + 5, start.y + 5, {
        steps: 5,
    });
    await page.waitForTimeout(50);
    await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, {
        steps: 10,
    });
    await page.waitForTimeout(50);
    await page.mouse.up();
};

test('admin can view a shared pivot table from an explore URL', async ({
    page,
}) => {
    await page.goto(getExploreUrl(sharedPivotTableChart));
    await runQuery(page);

    await expectPivotedResults(page);
});

test('admin can create a pivot table in the explorer', async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto(getExploreUrl(tableChart));
    await runQuery(page);

    await expect(page.getByText('Tables', { exact: true })).toBeVisible();
    await page.getByText('Configure', { exact: true }).click();
    await expect(
        page.getByText('Drag dimensions into this area to pivot your table'),
    ).toBeVisible();

    const draggable = page.locator(
        '[role="tabpanel"] [data-rfd-drag-handle-draggable-id="orders_is_completed"]',
    );
    const droppable = page.locator('[data-rfd-droppable-id="COLUMNS"]');
    await dragTo(page, draggable, droppable);
    await expect(
        droppable.locator('[data-rfd-draggable-id="orders_is_completed"]'),
    ).toBeVisible();

    await runQuery(page);

    const visualization = page.getByTestId('visualization');
    await expect(
        visualization.getByRole('row', {
            name: 'Orders Is completed False True',
            exact: true,
        }),
    ).toBeVisible({ timeout: 30_000 });
});
