import { ChartKind, SEED_PROJECT } from '@lightdash/common';
import {
    expect,
    json,
    loginAs,
    SEED_USERS,
    test,
    type Page,
} from '../../support/test';

// The SQL/Chart toggle is a segmented control; click its option by exact text.
const selectEditorTab = (page: Page, tab: 'SQL' | 'Chart') =>
    page.getByRole('radiogroup').getByText(tab, { exact: true }).click();

test.describe('SQL Runner (new)', () => {
    let schema: string;

    test.beforeEach(async ({ page, api }) => {
        await loginAs(api.raw, SEED_USERS.admin);
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/home`);
        const newButton = page.getByRole('button', { name: /^New$/ });
        await expect(newButton).toBeEnabled({ timeout: 30_000 });
        await newButton.click();
        await page.getByText('SQL runner').click();
        const response = await api.get(
            `/api/v1/projects/${SEED_PROJECT.project_uuid}/sqlRunner/tables`,
        );
        [schema] = Object.keys(await json<Record<string, unknown>>(response));
    });

    // todo: move to unit test
    test.skip('Should verify that the query is autocompleted, run, and the results are displayed', async ({
        page,
    }) => {
        const monaco = page.locator('.monaco-editor').first();
        const runButton = page.getByTestId('sql-runner-run-button');

        // Verify the autocomplete SQL query
        await expect(monaco).toBeVisible();
        await page.getByText('jaffle').first().click();
        await page
            .getByText(/^orders$/)
            .first()
            .click();
        await expect(monaco).toContainText(`SELECT * FROM "jaffle"."orders"`);

        // Verify that the query is run and the results are displayed
        await runButton.click();

        const results = page.locator('#sql-runner-panel-results');
        // The first column is the row index.
        const headers = results.locator('table thead th');
        await expect(headers).toHaveCount(23);
        await expect(headers.nth(0)).toContainText('#');
        await expect(headers.nth(1)).toContainText('order_id');
        await expect(headers.nth(2)).toContainText('customer_id');
        await expect(headers.nth(3)).toContainText('order_date');
        await expect(headers.nth(4)).toContainText('status');
        const cells = results.locator('table tbody tr').first().locator('td');
        await expect(cells.nth(0)).toContainText('1');
        await expect(cells.nth(1)).toContainText('1');
        await expect(cells.nth(2)).toContainText('1');
        await expect(cells.nth(3)).toContainText('2023-03-15T00:00:00.000Z');
        await expect(cells.nth(4)).toContainText('returned');

        // Verify that the query is saved in the draft history
        await page
            .locator('button[data-testid="sql-query-history-button"]')
            .click();
        await expect(
            page.locator('button[data-testid="sql-query-history-item"]'),
        ).toHaveCount(1);

        // Verify that the query is replaced with the new table suggestion and the new results are displayed
        await page
            .getByText(/^customers$/)
            .first()
            .click();
        await expect(monaco).toContainText(
            `SELECT * FROM "jaffle"."customers"`,
        );
        await runButton.click();
        await expect(page.locator('table thead th').nth(0)).toContainText(
            'customer_id',
        );

        // TODO: Verify that the user is warned when a query has not been run yet
        // cy.get('.monaco-editor').type(' LIMIT 10');
        // // Expect button that hovering on button `SQL` displays a tooltip with the text `You haven't run this query yet.`
        // // get label element with attribute `data-active="true"`
        // cy.get('label[data-active="true"]')
        //     .contains('SQL')
        //     .trigger('mouseover')
        //     .then(() => {
        //         cy.contains("You haven't run this query yet.").should(
        //             'be.visible',
        //         );
        //     });
    });

    // todo: remove
    test.skip('Should verify that the chart is displayed', async ({ page }) => {
        const monaco = page.locator('.monaco-editor').first();
        const runButton = page.getByTestId('sql-runner-run-button');
        const chartText = (text: string) =>
            page.locator('.echarts-for-react text', { hasText: text }).first();

        // Verify that the Run button is disabled by default
        await expect(runButton).toBeDisabled();

        // Verify that the query is run
        await expect(monaco).toBeVisible();
        await page.getByText('jaffle').first().click();
        await page
            .getByText(/^customers$/)
            .first()
            .click();
        await expect(monaco).toContainText(
            `SELECT * FROM "jaffle"."customers"`,
        );
        await runButton.click();
        await expect(page.locator('table thead th').nth(0)).toContainText(
            'customer_id',
        );

        // Verify that the chart is ready to be configured
        await selectEditorTab(page, 'Chart');
        await expect(chartText('Created')).toBeVisible();
        await expect(chartText('Age sum')).toBeVisible();

        // Add a new series
        await page.locator('button[data-testid="add-y-axis-field"]').click();
        await expect(chartText('Age sum')).toBeVisible();
        await expect(chartText('Last name count')).toBeVisible();

        // Group by first_name
        await page.locator('input[placeholder="Select group by"]').click();
        await page
            .locator('div[role="option"]', { hasText: 'first_name' })
            .first()
            .click();
        await expect(chartText('Age sum amy')).toBeVisible();

        // Verify that the chart is not displayed when the configuration is incomplete
        await page.locator('button[data-testid="remove-x-axis-field"]').click();
        await expect(
            page.getByText('Incomplete chart configuration'),
        ).toBeVisible();
        await expect(page.getByText("You're missing an X axis")).toBeVisible();
    });

    // todo: move to unit test
    test.skip('Should verify that the all chart types are displayed', async ({
        page,
    }) => {
        const monaco = page.locator('.monaco-editor').first();
        const runButton = page.getByTestId('sql-runner-run-button');
        const chartText = (text: string) =>
            page.locator('.echarts-for-react text', { hasText: text }).first();

        // Verify that the Run button is disabled by default
        await expect(runButton).toBeDisabled();

        // Verify that the query is run
        await expect(monaco).toBeVisible();
        await page.getByText('jaffle').first().click();
        await page
            .getByText(/^customers$/)
            .first()
            .click();
        await expect(monaco).toContainText(
            `SELECT * FROM "jaffle"."customers"`,
        );
        await runButton.click();
        await expect(page.locator('table thead th').nth(0)).toContainText(
            'customer_id',
        );

        // Verify that the chart is ready to be configured
        await selectEditorTab(page, 'Chart');
        await expect(chartText('Created')).toBeVisible();
        await expect(chartText('Age sum')).toBeVisible();

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
        ).toBeAttached();

        // Verify that the pie chart is displayed
        await page
            .locator(`button[data-testid="visualization-${ChartKind.PIE}"]`)
            .click();
        await expect(
            page.locator(`div[data-testid="chart-view-${ChartKind.PIE}"]`),
        ).toBeAttached();

        // Verify that the big number is displayed
        await page
            .locator(
                `button[data-testid="visualization-${ChartKind.BIG_NUMBER}"]`,
            )
            .click();
        await expect(
            page.locator(
                `div[data-testid="chart-view-${ChartKind.BIG_NUMBER}"]`,
            ),
        ).toBeAttached();
        await expect(page.getByTestId('big-number-value')).toBeVisible();

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
        ).toBeAttached();
    });

    test('Should save a big number chart and render it in view mode', async ({
        page,
    }) => {
        const bigNumberView = page.locator(
            `div[data-testid="chart-view-${ChartKind.BIG_NUMBER}"]`,
        );

        await expect(page.locator('.monaco-editor').first()).toBeVisible();
        // Filter the virtualized catalog so the target table is rendered.
        await page.getByPlaceholder('Search tables').fill('customers');
        await page
            .getByText(/^customers$/)
            .first()
            .click();
        await page.getByTestId('sql-runner-run-button').click();
        await expect(page.locator('table thead th').nth(0)).toContainText(
            'customer_id',
        );

        await selectEditorTab(page, 'Chart');
        await page
            .locator(
                `button[data-testid="visualization-${ChartKind.BIG_NUMBER}"]`,
            )
            .click();

        // The label defaults to the value field and can be overridden
        await page.getByRole('tab', { name: 'Display' }).click();
        await page.getByPlaceholder('age', { exact: true }).fill('Average age');
        await expect(bigNumberView).toContainText('Average age');

        await page.getByRole('button', { name: /^Save/ }).first().click();
        await page
            .getByPlaceholder('eg. How many weekly active users do we have?')
            .fill('Customers big number SQL chart');
        await page.getByText('Next', { exact: true }).click();
        await page
            .locator('section[role="dialog"]')
            .getByRole('button', { name: 'Save' })
            .click();

        // The saved chart renders on the view page, not an ECharts canvas
        await expect(
            page.getByText('Customers big number SQL chart').first(),
        ).toBeVisible();
        await expect(bigNumberView).toBeAttached();
        await expect(page.getByTestId('big-number-value')).toBeVisible();
        await expect(page.locator('.echarts-for-react')).toHaveCount(0);
    });

    test('Should save a chart', async ({ page }) => {
        const monaco = page.locator('.monaco-editor').first();
        const runButton = page.getByTestId('sql-runner-run-button');
        const barChartView = page.locator(
            `div[data-testid="chart-view-${ChartKind.VERTICAL_BAR}"]`,
        );
        const dialog = page.locator('section[role="dialog"]');

        // Verify that the Run button is disabled by default
        await expect(runButton).toBeDisabled();

        // Verify that the query is run
        await expect(monaco).toBeVisible();
        // Filter the virtualized catalog so the target table is rendered.
        await page.getByPlaceholder('Search tables').fill('customers');
        await page
            .getByText(/^customers$/)
            .first()
            .click();
        await expect(monaco).toContainText(
            `SELECT * FROM "jaffle"."customers"`,
        );
        await runButton.click();
        await expect(page.locator('table thead th').nth(0)).toContainText(
            'customer_id',
        );

        // View chart
        await selectEditorTab(page, 'Chart');

        // Verify that the chart is saved
        await page.getByRole('button', { name: /^Save/ }).first().click();
        await page
            .getByPlaceholder('eg. How many weekly active users do we have?')
            .fill('Customers table SQL chart');
        await page.getByText('Next', { exact: true }).click();
        await dialog.getByRole('button', { name: 'Save' }).click();

        // Verify that the chart is in view mode
        await expect(
            page.getByText('Customers table SQL chart').first(),
        ).toBeVisible();
        await expect(barChartView).toBeAttached();

        // Verify that the chart is in edit mode and make new changes and fix errors
        await page.getByText('Edit chart').click();

        await expect(barChartView).toBeAttached();
        // Edit mode re-runs the query; on a cold preview that takes longer than the default expect budget
        await expect(page.getByTestId('chart-data-table')).toContainText(
            'age_sum',
            { timeout: 30_000 },
        );

        await selectEditorTab(page, 'SQL');
        await expect(monaco).toBeVisible();
        const newQuery = `SELECT * FROM "${schema}"."jaffle"."orders"`;
        await monaco.click();
        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.press('Delete');
        await page.keyboard.type(newQuery);
        await expect(monaco).toContainText(newQuery);
        // The editor debounces SQL into the store with no visible signal
        await page.waitForTimeout(1000);
        await runButton.click();
        await expect(page.locator('table thead th').nth(0)).toContainText(
            'order_id',
        );

        // Verify that there are errors to be fixed and fix them
        await selectEditorTab(page, 'Chart');
        await expect(
            page.getByText('Column "created" does not exist. Choose another'),
        ).toBeVisible();
        await page.getByRole('button', { name: /^Save/ }).first().click();
        await dialog.getByRole('button', { name: 'Fix errors' }).click();
        await page.getByPlaceholder('Select X axis').click();
        await page
            .locator('.mantine-Select-dropdown:visible div[role="option"]', {
                hasText: 'status',
            })
            .first()
            .click();
        await page.getByPlaceholder('Select Y axis').click();
        await page
            .locator('.mantine-Select-dropdown:visible div[role="option"]', {
                hasText: 'customer_id',
            })
            .first()
            .click();

        // Verify that saving changes and going back to view page displays the chart
        await page.getByRole('button', { name: /^Save/ }).first().click();
        await page.getByTestId('back-to-view-page-button').click();
        await expect(barChartView).toBeAttached();
        await expect(
            page
                .locator('.echarts-for-react text', {
                    hasText: 'Customer id avg',
                })
                .first(),
        ).toBeVisible();
        await expect(
            page
                .locator('.echarts-for-react text', { hasText: 'Status' })
                .first(),
        ).toBeVisible();
    });

    // todo: remove
    test.skip('Should not trigger an extra query to the warehouse when styling a chart', async ({
        page,
    }) => {
        const monaco = page.locator('.monaco-editor').first();
        const runButton = page.getByTestId('sql-runner-run-button');
        const chartText = (text: string) =>
            page.locator('.echarts-for-react text', { hasText: text }).first();

        // Verify that the Run button is disabled by default
        await expect(runButton).toBeDisabled();

        // Verify that the query is run
        await expect(monaco).toBeVisible();
        await page.getByText('jaffle').first().click();
        await page
            .getByText(/^customers$/)
            .first()
            .click();
        await expect(monaco).toContainText(
            `SELECT * FROM "jaffle"."customers"`,
        );
        await runButton.click();
        await expect(page.locator('table thead th').nth(0)).toContainText(
            'customer_id',
        );

        // Verify that the chart is ready to be configured
        await selectEditorTab(page, 'Chart');
        await expect(chartText('Created')).toBeVisible();

        // Intercept the API call we don't expect to happen
        let runPivotQueryCount = 0;
        page.on('request', (request) => {
            if (
                request.method() === 'POST' &&
                /\/api\/v2\/projects\/[^/]+\/query\/sql/.test(request.url())
            ) {
                runPivotQueryCount += 1;
            }
        });

        // Perform the styling change
        await page.getByText('Display').first().click();
        const xAxisLabelInput = page
            .locator('.mantine-Stack-root', {
                has: page.locator('div', { hasText: 'X-axis label' }),
            })
            .last()
            .locator('input.mantine-Input-input');
        await xAxisLabelInput.fill('New x-axis label');

        // Wait for the chart label to update
        await expect(chartText('New x-axis label')).toBeVisible();

        // Verify that no extra queries were made
        expect(runPivotQueryCount).toBe(0);

        // Verify that the chart is displayed with the new label
        await expect(
            page.locator(
                `div[data-testid="chart-view-${ChartKind.VERTICAL_BAR}"]`,
            ),
        ).toBeAttached();
        await expect(chartText('New x-axis label')).toBeVisible();
    });
});
