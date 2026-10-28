import { SEED_PROJECT } from '@lightdash/common';
import {
    expect,
    getMonacoEditorText,
    loginAs,
    runQuery,
    scrollTreeToItem,
    SEED_USERS,
    test,
    type Page,
} from '../../support/test';

const selectOrderCustomerFields = async (page: Page) => {
    await (await scrollTreeToItem(page, 'Order Customer')).click();
    await (await scrollTreeToItem(page, 'First name')).click();
    await (await scrollTreeToItem(page, 'Unique order count')).click();
};

test.describe('Explore', () => {
    test.beforeEach(async ({ api }) => {
        await loginAs(api.raw, SEED_USERS.admin);
    });

    // todo: combine tests
    test('Should query orders', async ({ page }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/tables`);
        await expect(page.getByTestId('page-spinner')).toHaveCount(0);

        await page.getByText('Orders', { exact: true }).click();
        await expect(
            page.getByText('Dimensions', { exact: true }),
        ).toBeAttached();
        await (await scrollTreeToItem(page, 'Order Customer')).click();

        // ! Tests run with auto-fetch enabled, so a query runs after each change in the explorer (e.g. clicking a field)
        // ! This means that right after clicking a field the default sort is applied
        // ! Since we check attempt to set the order to "First name" we need to click on a different field first, otherwise the sort for first name is applied and the test fails
        await (await scrollTreeToItem(page, 'Unique order count')).click();
        await (await scrollTreeToItem(page, 'First name')).click();

        // open column menu
        await page
            .locator('th')
            .filter({ hasText: 'Order Customer First name' })
            .locator('button')
            .click();

        // sort `Order Customer First-Name` by ascending
        await page.getByRole('menuitem', { name: 'Sort A-Z' }).click();

        // run query
        await runQuery(page);

        // wait for query to finish
        await expect(
            page.getByText('Loading results', { exact: true }),
        ).toHaveCount(0);

        // check that first row in first column is 'Aaron'
        await expect(page.locator('table td').nth(1)).toContainText('Aaron');
    });

    // todo: combine tests
    test('Should save chart', async ({ page }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/tables`);
        await expect(page.getByTestId('page-spinner')).toHaveCount(0);

        await page.getByText('Orders', { exact: true }).click();
        await expect(
            page.getByText('Dimensions', { exact: true }),
        ).toBeVisible();
        await (await scrollTreeToItem(page, 'Order Customer')).click();
        await (await scrollTreeToItem(page, 'First name')).click();
        await (await scrollTreeToItem(page, 'Unique order count')).click();

        await page.getByTestId('Chart-card-expand').click();

        await page.getByText('Save chart', { exact: true }).click();

        await page.getByTestId('ChartCreateModal/NameInput').fill('My chart');
        await page.getByText('Next').click();
        await page.getByText('Save', { exact: true }).click();
        await expect(
            page.getByText('Success! Chart was saved.', { exact: true }),
        ).toBeVisible();

        // FIXME disabling save changes button is currently broken...
        // cy.findByText('Save changes').parent().should('be.disabled');

        // wait for the chart to finish loading
        await expect(
            page.getByText('Loading chart', { exact: true }),
        ).toHaveCount(0);

        await page
            .getByText('Edit chart', { exact: true })
            .locator('..')
            .click();
        await page.getByText('Configure', { exact: true }).click();
        await page.getByRole('button', { name: 'Change chart type' }).click();
        await page
            .getByRole('button', {
                name: 'Horizontal bar chart',
            })
            .click();

        // cy.findByText('Save changes').parent().should('not.be.disabled');
        await page
            .getByText('Save changes', { exact: true })
            .locator('..')
            .click();

        await expect(
            page.getByText('Success! Chart was updated.', { exact: true }),
        ).toBeVisible();
    });

    // todo: combine tests
    test('Should change chart config type', async ({ page }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/tables/orders`);

        await expect(page.getByTestId('page-spinner')).toHaveCount(0);

        // choose table and select fields
        await selectOrderCustomerFields(page);

        // check that selected fields are in the table headers
        await expect(
            page.locator('th').filter({ hasText: 'Order Customer First name' }),
        ).not.toHaveCount(0);
        await expect(
            page.locator('th').filter({ hasText: 'Orders Unique order count' }),
        ).not.toHaveCount(0);

        // run query
        await runQuery(page);

        // open chart
        await page.getByTestId('Chart-card-expand').click();

        // wait for the chart to finish loading
        await expect(page.getByText('Loading chart')).toHaveCount(0);

        // open the chart gallery and change chart types
        await page.getByText('Configure', { exact: true }).click();
        await page.getByRole('button', { name: 'Change chart type' }).click();
        await expect(
            page.getByRole('button', { name: 'Table', pressed: true }),
        ).toBeVisible();

        const selectChartType = async (chartType: string) => {
            await page
                .getByRole('button', {
                    name: chartType,
                    exact: true,
                    pressed: false,
                })
                .click();
            await expect(
                page.getByRole('button', {
                    name: chartType,
                    exact: true,
                    pressed: true,
                }),
            ).toBeVisible();
            await expect(
                page.getByText('Choose chart type', { exact: true }),
            ).toBeVisible();
        };

        await selectChartType('Bar chart');
        await selectChartType('Horizontal bar chart');
        await selectChartType('Line chart');
        await selectChartType('Area chart');
        await selectChartType('Scatter chart');
        await selectChartType('Pie chart');
        await selectChartType('Big value');
        await selectChartType('Table');
    });

    // todo: move to unit test
    test.skip('Keeps chart config after updating table calculation', async ({
        page,
    }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/tables/orders`);

        await expect(page.getByTestId('page-spinner')).toHaveCount(0);

        // choose table and select fields
        await selectOrderCustomerFields(page);

        // add table calculation
        await page
            .getByRole('button', { name: 'Table calculation' })
            .first()
            .click();

        const nameInput = page.getByTestId('table-calculation-name-input');
        await expect(nameInput).toBeEnabled();
        await nameInput.fill('TC');
        await expect(nameInput).toHaveValue('TC');
        await nameInput.blur();
        // Ensure focus moves to ace editor before typing
        await page.locator('div.ace_content').click();
        await expect(page.locator(':focus')).toHaveClass(/ace_text-input/);
        // eslint-disable-next-line no-template-curly-in-string
        await page.keyboard.type('${orders.unique_order_count}');
        await page.getByTestId('table-calculation-save-button').click();

        // run query
        await runQuery(page);

        // wait for the chart to finish loading
        await expect(page.getByText('Loading chart')).toHaveCount(0);

        // open chart menu and change chart types
        await page.getByText('Configure', { exact: true }).click();

        // change X-axis to table calculation
        const xAxis = page.getByTestId('x-axis-field-select');
        await xAxis.click();
        await xAxis.fill('TC');
        await xAxis.press('ArrowDown');
        await xAxis.press('Enter');

        // change y-axis to table calculation
        const yAxis = page.getByTestId('y-axis-field-select');
        await yAxis.click();
        await yAxis.fill('TC');
        await yAxis.press('ArrowDown');
        await yAxis.press('Enter');

        await page
            .locator('th')
            .filter({ hasText: 'TC' })
            .locator('button')
            .click();

        const newTCName = 'TC2';

        await page.getByRole('button', { name: 'Edit calculation' }).click();
        await page.getByTestId('table-calculation-name-input').fill(newTCName);
        await page.getByTestId('table-calculation-save-button').click();

        // run query
        await runQuery(page);

        // wait for the chart to finish loading
        await expect(page.getByText('Loading chart')).toHaveCount(0);

        await expect(xAxis).toHaveValue(newTCName);
        await expect(yAxis).toHaveValue(newTCName);
    });

    // todo: move to unit test
    test.skip('Should change chart config layout', async ({ page }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/tables/orders`);
        await expect(page.getByTestId('page-spinner')).toHaveCount(0);

        await selectOrderCustomerFields(page);

        // run query
        await runQuery(page);

        // without labels
        await expect
            .poll(() => page.locator('g > text').count())
            .toBeLessThan(30);

        await page.getByText('Configure', { exact: true }).click();
        await page.getByText('Series', { exact: true }).click();
        await page
            .getByText('Value labels', { exact: true })
            .locator('..')
            .locator('[role="combobox"]')
            .click();
        await page
            .locator('.mantine-Select-item')
            .filter({ hasText: 'Top' })
            .click();

        // with labels
        await expect
            .poll(() => page.locator('g > text').count())
            .toBeGreaterThan(30);
    });

    // todo: move to unit test
    test.describe.skip('Sort', () => {
        test('should sort multisort results', async ({ page }) => {
            await page.goto(`/projects/${SEED_PROJECT.project_uuid}/tables`);

            await page.getByText('Orders', { exact: true }).click();
            await expect(
                page.getByText('Dimensions', { exact: true }),
            ).toBeVisible();
            await selectOrderCustomerFields(page);

            // run query
            await runQuery(page);

            // wait for query to finish
            await expect(
                page.getByText('Loading results', { exact: true }),
            ).toHaveCount(0);

            // open column menu
            await page
                .locator('th')
                .filter({ hasText: 'Orders Unique order count' })
                .locator('button')
                .click();
            // sort `Orders Unique order count` by ascending
            await page.getByRole('menuitem', { name: 'Sort 1-9' }).click();

            const sortedByBadge = page
                .locator('.mantine-Badge-inner')
                .filter({ hasText: 'Sorted by' })
                .locator('..');
            await expect(sortedByBadge).toContainText('Unique order count');

            await page
                .locator('th')
                .filter({ hasText: 'Order Customer First name' })
                .locator('button')
                .click();
            // sort `Order Customer First name` by ascending
            await page.getByRole('menuitem', { name: 'Sort Z-A' }).click();

            await expect(sortedByBadge).toContainText('First name');

            // wait for query to finish
            await expect(
                page.getByText('Loading results', { exact: true }),
            ).toHaveCount(0);

            // Add multi sort via popover
            await sortedByBadge.click();
            await page.getByRole('button', { name: 'Add sort' }).click();
            await page.getByPlaceholder('Add sort field').click();

            // click on Unique order count to add it to the sort
            await page
                .locator('.mantine-Select-item')
                .filter({ hasText: 'Unique order count' })
                .click();

            // Multiple sort should be visible in badge
            await expect(sortedByBadge).toContainText('2 fields');

            // wait for query to finish
            await expect(
                page.getByText('Loading results', { exact: true }),
            ).toHaveCount(0);
        });
    });

    // todo: move to unit test
    test.describe.skip('Chart type', () => {
        test.describe('Table', () => {
            test.describe('Config', () => {
                test('should hide table names from the header according to the config', async ({
                    page,
                }) => {
                    await page.goto(
                        `/projects/${SEED_PROJECT.project_uuid}/tables/orders`,
                    );

                    // choose table and select fields
                    await selectOrderCustomerFields(page);

                    // run query
                    await runQuery(page);

                    // wait for the chart to finish loading
                    await expect(
                        page.getByText('Loading chart', { exact: true }),
                    ).toHaveCount(0);

                    // open chart menu and change chart type to Table
                    await page
                        .getByRole('button', { name: 'Configure' })
                        .first()
                        .click();
                    await page
                        .getByRole('button', {
                            name: 'Change chart type',
                        })
                        .click();
                    await page.getByRole('button', { name: 'Table' }).click();

                    const headers = page
                        .getByTestId('visualization')
                        .locator('th');
                    // check that chart table headers are correct (table names hidden by default)
                    await expect(
                        headers.filter({ hasText: 'First name' }),
                    ).not.toHaveCount(0);
                    await expect(
                        headers.filter({
                            hasText: 'Order Customer First name',
                        }),
                    ).toHaveCount(0);

                    await page
                        .getByLabel('Show table names')
                        .click({ force: true });

                    // check that chart table headers show table names after toggle
                    await expect(
                        headers.filter({
                            hasText: 'Order Customer First name',
                        }),
                    ).not.toHaveCount(0);
                });

                test('should show header overrides according to the config', async ({
                    page,
                }) => {
                    await page.goto(
                        `/projects/${SEED_PROJECT.project_uuid}/tables/orders`,
                    );

                    // choose table and select fields
                    await selectOrderCustomerFields(page);

                    // run query
                    await runQuery(page);

                    // wait for the chart to finish loading
                    await expect(
                        page.getByText('Loading chart', { exact: true }),
                    ).toHaveCount(0);

                    // open chart menu and change chart type to Table
                    await page
                        .getByRole('button', { name: 'Configure' })
                        .first()
                        .click();
                    await page
                        .getByRole('button', {
                            name: 'Change chart type',
                        })
                        .click();
                    await page.getByRole('button', { name: 'Table' }).click();

                    const secondHeader = page
                        .getByTestId('visualization')
                        .locator('th')
                        .nth(1);
                    // check that chart table headers are correct (table names hidden by default)
                    await expect(secondHeader).toContainText('First name');

                    // open configuration and add custom header
                    const headerInput = page.getByPlaceholder('First name');
                    await headerInput.focus();
                    await headerInput.pressSequentially('Overridden header');
                    await headerInput.blur();

                    // check that chart table headers are overridden
                    await expect(secondHeader).toContainText(
                        'Overridden header',
                    );
                });
            });
        });
    });

    // todo: move to unit test
    test.skip('Should open SQL Runner with current query', async ({ page }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/tables`);

        await page.getByText('Orders', { exact: true }).click();
        await (await scrollTreeToItem(page, 'Is completed')).click();

        // open SQL
        await page.getByTestId('SQL-card-expand').click();

        // wait to compile query
        const openInSqlRunner = page
            .getByText('Open in SQL Runner', { exact: true })
            .locator('..');
        await expect(openInSqlRunner).toBeEnabled();

        // Get compiled SQL query from Explore
        const exploreSql = await getMonacoEditorText(page);
        // open SQL Runner and wait for route change
        await openInSqlRunner.click();
        await expect(page).toHaveURL(/\/sql-runner/);
        // Get compiled SQL query from SQL runner; they should match
        expect(await getMonacoEditorText(page)).toBe(exploreSql);
    });

    // todo: move to unit test
    test.skip('Should clear query using hotkeys', async ({ page }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/tables`);

        await page.getByText('Orders', { exact: true }).click();
        await (await scrollTreeToItem(page, 'Is completed')).click();

        // run query
        await runQuery(page);

        // wait for query to finish
        await expect(
            page.getByText('Loading results', { exact: true }),
        ).toHaveCount(0);

        // clear query hotkeys
        await page.keyboard.press('Control+Alt+k');

        // verify empty query keeping selected table
        await expect(
            page.locator('a', { hasText: /^Tables$/ }).locator('..'),
        ).toHaveText('Tables/Orders');
        await expect(
            page.getByText('Pick a metric & select its dimensions', {
                exact: true,
            }),
        ).toBeAttached();
    });

    // todo: move to unit test
    test.skip('Should search tables and select fields', async ({ page }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/tables`);
        await expect(page.getByTestId('page-spinner')).toHaveCount(0);

        // Select the Orders table from search results
        await page.getByText('Orders', { exact: true }).click();

        // Wait for the explore page to load
        await expect(
            page.getByText('Dimensions', { exact: true }),
        ).toBeAttached();

        // Search for tables using the search input
        await page.getByTestId('ExploreTree/SearchInput').fill('First name');

        // Select some fields to query
        await (await scrollTreeToItem(page, 'First name')).click();

        // Run the query
        await runQuery(page);

        // Wait for query to finish loading
        await expect(
            page.getByText('Loading results', { exact: true }),
        ).toHaveCount(0);

        // Check that the results table exists and has the expected columns
        await expect(page.locator('table').first()).toBeAttached();
        await expect(
            page.locator('th').filter({ hasText: 'Order Customer First name' }),
        ).not.toHaveCount(0);

        // Verify that we have actual data in the table
        await expect(page.locator('tbody tr')).not.toHaveCount(0);

        // Check specific data - first row should have a customer name
        await expect(
            page.locator('tbody tr').first().locator('td').nth(1),
        ).not.toBeEmpty();
    });

    // todo: move to unit test
    test.skip('Should add a custom dimension', async ({ page }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/tables`);
        await expect(page.getByTestId('page-spinner')).toHaveCount(0);

        // Select the Orders table
        await page.getByText('Orders', { exact: true }).click();

        // Wait for the explore page to load
        await expect(
            page.getByText('Dimensions', { exact: true }),
        ).toBeAttached();

        // Scroll to the Dimensions section header (which has the Add Custom Dimension button)
        await scrollTreeToItem(page, 'Dimensions');

        // Click the Add Custom Dimension button
        await page
            .getByTestId('VirtualSectionHeader/AddCustomDimensionButton')
            .click();

        await page
            .getByTestId('CustomSqlDimensionModal/LabelInput')
            .fill('A custom dimension');
        await page.locator('#ace-editor').click();
        await page.keyboard.type('true');
        await page.getByText('Create', { exact: true }).click();

        // Run query
        await page.getByTestId('RefreshButton/RunQueryButton').first().click();

        // Wait for query to finish loading
        await expect(
            page.getByText('Loading results', { exact: true }),
        ).toHaveCount(0);

        // Check that the results table exists and has the expected columns
        await expect(page.locator('table').first()).toBeAttached();
        await expect(
            page.locator('th').filter({ hasText: 'A custom dimension' }),
        ).not.toHaveCount(0);

        // Verify that we have actual data in the table
        await expect(page.locator('tbody tr')).not.toHaveCount(0);

        // Check specific data - first row should have a customer name
        await expect(
            page.locator('tbody tr').first().locator('td').nth(1),
        ).not.toBeEmpty();
    });
});
