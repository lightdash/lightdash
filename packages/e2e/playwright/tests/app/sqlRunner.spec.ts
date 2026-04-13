import { ChartKind, SEED_PROJECT } from '@lightdash/common';
import { expect, test } from '../../fixtures';

test.describe('SQL Runner (new)', () => {
    let schema: string;

    test.beforeEach(async ({ adminPage: page }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/home`);
        await page.waitForTimeout(3000);
        await page.getByText('New').click();
        await page.getByText('SQL runner').click();

        const response = await page.request.get(
            `/api/v1/projects/${SEED_PROJECT.project_uuid}/sqlRunner/tables`,
        );
        const body = await response.json();
        [schema] = Object.keys(body.results);
    });

    // todo: move to unit test
    test.skip('Should verify that the query is autocompleted, run, and the results are displayed', async ({
        adminPage: page,
    }) => {
        // Verify the autocomplete SQL query
        await expect(page.locator('.monaco-editor')).toBeVisible();
        await page.getByText('jaffle').click();
        await page.waitForTimeout(500);
        await page.getByText(/^orders$/).click();
        await expect(page.locator('.monaco-editor')).toContainText(
            `SELECT * FROM "${schema}"."jaffle"."orders"`,
        );

        // Verify that the query is run and the results are displayed
        await page.getByText('Run query').click();

        const resultsPanel = page.locator('#sql-runner-panel-results');
        await expect(resultsPanel.locator('table thead th')).toHaveCount(22);
        await expect(
            resultsPanel.locator('table thead th').nth(0),
        ).toContainText('order_id');
        await expect(
            resultsPanel.locator('table thead th').nth(1),
        ).toContainText('customer_id');
        await expect(
            resultsPanel.locator('table thead th').nth(2),
        ).toContainText('order_date');
        await expect(
            resultsPanel.locator('table thead th').nth(3),
        ).toContainText('status');

        const firstRow = resultsPanel.locator('table tbody tr').first();
        await expect(firstRow.locator('td').nth(0)).toContainText('1');
        await expect(firstRow.locator('td').nth(1)).toContainText('1');
        await expect(firstRow.locator('td').nth(2)).toContainText(
            '2023-03-15T00:00:00.000Z',
        );
        await expect(firstRow.locator('td').nth(3)).toContainText('returned');

        // Verify that the query is saved in the draft history
        await page
            .locator('button[data-testid="sql-query-history-button"]')
            .click();
        await expect(
            page.locator('button[data-testid="sql-query-history-item"]'),
        ).toHaveCount(1);

        // Verify that the query is replaced with the new table suggestion and the new results are displayed
        await page.getByText(/^customers$/).click();
        await expect(page.locator('.monaco-editor')).toContainText(
            `SELECT * FROM "${schema}"."jaffle"."customers"`,
        );
        await page.getByText('Run query').click();
        await expect(page.locator('table thead th').nth(0)).toContainText(
            'customer_id',
        );
    });

    // todo: remove
    test.skip('Should verify that the chart is displayed', async ({
        adminPage: page,
    }) => {
        // Verify that the Run query button is disabled by default
        await expect(page.getByText('Run query')).toBeDisabled();

        // Verify that the query is run
        await expect(page.locator('.monaco-editor')).toBeVisible();
        await page.getByText('jaffle').click();
        await page.waitForTimeout(500);
        await page.getByText(/^customers$/).click();
        await expect(page.locator('.monaco-editor')).toContainText(
            `SELECT * FROM "${schema}"."jaffle"."customers"`,
        );
        await page.getByText('Run query').click();
        await expect(page.locator('table thead th').nth(0)).toContainText(
            'customer_id',
        );

        // Verify that the chart is ready to be configured
        await page.getByLabel('Chart').click();
        await expect(
            page
                .locator('.echarts-for-react')
                .locator('text')
                .filter({ hasText: 'Created' }),
        ).toBeVisible();
        await expect(
            page
                .locator('.echarts-for-react')
                .locator('text')
                .filter({ hasText: 'Age sum' }),
        ).toBeVisible();

        // Add a new series
        await page.locator('button[data-testid="add-y-axis-field"]').click();
        await expect(
            page
                .locator('.echarts-for-react')
                .locator('text')
                .filter({ hasText: 'Age sum' }),
        ).toBeVisible();
        await expect(
            page
                .locator('.echarts-for-react')
                .locator('text')
                .filter({ hasText: 'Last name count' }),
        ).toBeVisible();

        // Group by first_name
        await page.locator('input[placeholder="Select group by"]').click();
        await page
            .locator('div[role="option"]')
            .filter({ hasText: 'first_name' })
            .click();
        await expect(
            page
                .locator('.echarts-for-react')
                .locator('text')
                .filter({ hasText: 'Age sum amy' }),
        ).toBeVisible();

        // Verify that the chart is not displayed when the configuration is incomplete
        await page.locator('button[data-testid="remove-x-axis-field"]').click();
        await expect(
            page.getByText('Incomplete chart configuration'),
        ).toBeVisible();
        await expect(page.getByText("You're missing an X axis")).toBeVisible();
    });

    // todo: move to unit test
    test.skip('Should verify that the all chart types are displayed', async ({
        adminPage: page,
    }) => {
        // Verify that the Run query button is disabled by default
        await expect(page.getByText('Run query')).toBeDisabled();

        // Verify that the query is run
        await expect(page.locator('.monaco-editor')).toBeVisible();
        await page.getByText('jaffle').click();
        await page.waitForTimeout(500);
        await page.getByText(/^customers$/).click();
        await expect(page.locator('.monaco-editor')).toContainText(
            `SELECT * FROM "${schema}"."jaffle"."customers"`,
        );
        await page.getByText('Run query').click();
        await expect(page.locator('table thead th').nth(0)).toContainText(
            'customer_id',
        );

        // Verify that the chart is ready to be configured
        await page.getByLabel('Chart').click();
        await expect(
            page
                .locator('.echarts-for-react')
                .locator('text')
                .filter({ hasText: 'Created' }),
        ).toBeVisible();
        await expect(
            page
                .locator('.echarts-for-react')
                .locator('text')
                .filter({ hasText: 'Age sum' }),
        ).toBeVisible();

        // Verify that the table is displayed
        await page
            .locator(`button[data-testid="visualization-${ChartKind.TABLE}"]`)
            .click();
        await expect(page.locator('table thead th').nth(0)).toContainText(
            'customer_id',
        );

        // Verify that the line chart is displayed
        await page
            .locator(`button[data-testid="visualization-${ChartKind.LINE}"]`)
            .click();
        await expect(
            page.locator(`div[data-testid="chart-view-${ChartKind.LINE}"]`),
        ).toBeVisible();

        // Verify that the pie chart is displayed
        await page
            .locator(`button[data-testid="visualization-${ChartKind.PIE}"]`)
            .click();
        await expect(
            page.locator(`div[data-testid="chart-view-${ChartKind.PIE}"]`),
        ).toBeVisible();

        // Verify that the bar chart is displayed
        await page
            .locator(
                `button[data-testid="visualization-${ChartKind.VERTICAL_BAR}"]`,
            )
            .click();
        await expect(
            page.locator(
                `div[data-testid="chart-view-${ChartKind.VERTICAL_BAR}"]`,
            ),
        ).toBeVisible();
    });

    test('Should save a chart', async ({ adminPage: page }) => {
        // Verify that the Run query button is disabled by default
        await expect(page.getByText('Run query')).toBeDisabled();

        // Verify that the query is run
        await expect(page.locator('.monaco-editor')).toBeVisible();
        await page.getByText('jaffle').click();
        await page.waitForTimeout(500);
        await page.getByText(/^customers$/).click();
        await expect(page.locator('.monaco-editor')).toContainText(
            `SELECT * FROM "${schema}"."jaffle"."customers"`,
        );
        await page.getByText('Run query').click();
        await expect(page.locator('table thead th').nth(0)).toContainText(
            'customer_id',
        );

        // View chart
        await page.getByLabel('Chart').click();

        // Verify that the chart is saved
        await page.getByText('Save').click();
        await page
            .locator(
                'input[placeholder="eg. How many weekly active users do we have?"]',
            )
            .fill('Customers table SQL chart');
        await page.getByText('Next').click();
        await page
            .locator('section[role="dialog"]')
            .getByRole('button', { name: 'Save' })
            .click();

        // Verify that the chart is in view mode
        await expect(page.getByText('Customers table SQL chart')).toBeVisible();
        await expect(
            page.locator(
                `div[data-testid="chart-view-${ChartKind.VERTICAL_BAR}"]`,
            ),
        ).toBeVisible();

        // Verify that the chart is in edit mode and make new changes and fix errors
        await page.getByText('Edit chart').click();

        await expect(
            page.locator(
                `div[data-testid="chart-view-${ChartKind.VERTICAL_BAR}"]`,
            ),
        ).toBeVisible();
        await expect(
            page.locator('div[data-testid="chart-data-table"]'),
        ).toContainText('age_sum');

        await page.getByLabel('SQL').click();
        await expect(page.locator('.monaco-editor')).toBeVisible();
        await page.locator('.monaco-editor').click();
        await page.keyboard.press('Meta+a');
        await page.keyboard.press('Backspace');
        await page.keyboard.type(`SELECT * FROM "${schema}"."jaffle"."orders"`);
        await page.waitForTimeout(1000);
        await page.getByText('Run query').click();
        await expect(page.locator('table thead th').nth(0)).toContainText(
            'order_id',
        );

        // Verify that there are errors to be fixed and fix them
        await page.getByLabel('Chart').click();
        await expect(
            page.getByText('Column "created" does not exist. Choose another'),
        ).toBeVisible();
        await page.getByText('Save').click();
        await page
            .locator('section[role="dialog"]')
            .getByRole('button', { name: 'Fix errors' })
            .click();
        await page.locator('input[placeholder="Select X axis"]').click();
        await page
            .locator('.mantine-8-Select-dropdown')
            .filter({ has: page.locator(':visible') })
            .locator('div[role="option"]')
            .filter({ hasText: 'status' })
            .click();
        await page.locator('input[placeholder="Select Y axis"]').click();
        await page
            .locator('.mantine-8-Select-dropdown')
            .filter({ has: page.locator(':visible') })
            .locator('div[role="option"]')
            .filter({ hasText: 'customer_id' })
            .click();

        // Verify that saving changes and going back to view page displays the chart
        await page.getByText('Save').click();
        await page
            .locator('button[data-testid="back-to-view-page-button"]')
            .click();
        await expect(
            page.locator(
                `div[data-testid="chart-view-${ChartKind.VERTICAL_BAR}"]`,
            ),
        ).toBeVisible();
        await expect(
            page
                .locator('.echarts-for-react')
                .locator('text')
                .filter({ hasText: 'Customer id avg' }),
        ).toBeVisible();
        await expect(
            page
                .locator('.echarts-for-react')
                .locator('text')
                .filter({ hasText: 'Status' }),
        ).toBeVisible();
    });

    // todo: remove
    test.skip('Should not trigger an extra query to the warehouse when styling a chart', async ({
        adminPage: page,
    }) => {
        // Verify that the Run query button is disabled by default
        await expect(page.getByText('Run query')).toBeDisabled();

        // Verify that the query is run
        await expect(page.locator('.monaco-editor')).toBeVisible();
        await page.getByText('jaffle').click();
        await page.waitForTimeout(500);
        await page.getByText(/^customers$/).click();
        await expect(page.locator('.monaco-editor')).toContainText(
            `SELECT * FROM "${schema}"."jaffle"."customers"`,
        );
        await page.getByText('Run query').click();
        await expect(page.locator('table thead th').nth(0)).toContainText(
            'customer_id',
        );

        // Verify that the chart is ready to be configured
        await page.getByLabel('Chart').click();
        await expect(
            page
                .locator('.echarts-for-react')
                .locator('text')
                .filter({ hasText: 'Created' }),
        ).toBeVisible();

        // Track API calls - we don't expect any pivot queries
        let pivotQueryCount = 0;
        await page.route(
            '**/api/v1/projects/*/sqlRunner/runPivotQuery',
            (route) => {
                pivotQueryCount += 1;
                return route.continue();
            },
        );

        // Perform the styling change
        await page.getByText('Display').click();
        const xAxisInput = page
            .locator('div')
            .filter({ hasText: 'X-axis label' })
            .locator('.mantine-Stack-root')
            .locator('input.mantine-Input-input');
        await xAxisInput.fill('New x-axis label');

        // Wait for the chart label to update
        await expect(
            page
                .locator('.echarts-for-react')
                .locator('text')
                .filter({ hasText: 'New x-axis label' }),
        ).toBeVisible();

        // Verify that no extra queries were made
        expect(pivotQueryCount).toBe(0);

        // Verify that the chart is displayed with the new label
        await expect(
            page.locator(
                `div[data-testid="chart-view-${ChartKind.VERTICAL_BAR}"]`,
            ),
        ).toBeVisible();
        await expect(
            page
                .locator('.echarts-for-react')
                .locator('text')
                .filter({ hasText: 'New x-axis label' }),
        ).toBeVisible();
    });
});
