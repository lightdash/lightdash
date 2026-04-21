import { SEED_PROJECT } from '@lightdash/common';
import { expect, test } from '../../fixtures';
import { scrollTreeToItem } from '../../helpers';

test.describe('Explore', () => {
    // todo: combine tests
    test('Should query orders', async ({ adminPage: page }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/tables`);
        await expect(page.getByTestId('page-spinner')).toHaveCount(0);

        await page.getByText('Orders', { exact: true }).click();
        await expect(page.getByText('Dimensions')).toBeVisible();
        await scrollTreeToItem(page, 'Order Customer');
        await page.getByText('Order Customer').click();

        // ! Tests run with auto-fetch enabled, so a query runs after each change in the explorer (e.g. clicking a field)
        // ! This means that right after clicking a field the default sort is applied
        // ! Since we check attempt to set the order to "First name" we need to click on a different field first, otherwise the sort for first name is applied and the test fails
        await scrollTreeToItem(page, 'Unique order count');
        await page.getByText('Unique order count').dispatchEvent('click');
        await scrollTreeToItem(page, 'First name');
        await page.getByText('First name').dispatchEvent('click');

        // open column menu
        await page
            .locator('th')
            .filter({ hasText: 'Order Customer First name' })
            .locator('button')
            .click();

        // sort `Order Customer First-Name` by ascending
        await page.getByRole('menuitem', { name: 'Sort A-Z' }).click();

        // run query
        await page.getByRole('button', { name: 'Run query' }).first().click();

        // wait for query to finish
        await expect(page.getByText('Loading results')).toHaveCount(0);

        // check that first row in first column is 'Aaron'
        await expect(page.locator('table').locator('td').nth(1)).toContainText(
            'Aaron',
            { timeout: 10000 },
        );
    });

    // todo: combine tests
    test('Should save chart', async ({ adminPage: page }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/tables`);
        await expect(page.getByTestId('page-spinner')).toHaveCount(0);

        await page.getByText('Orders', { exact: true }).click();
        await expect(page.getByText('Dimensions')).toBeVisible();
        await scrollTreeToItem(page, 'Order Customer');
        await page.getByText('Order Customer').click();
        await scrollTreeToItem(page, 'First name');
        await page.getByText('First name').dispatchEvent('click');
        await scrollTreeToItem(page, 'Unique order count');
        await page.getByText('Unique order count').dispatchEvent('click');

        await page.getByTestId('Chart-card-expand').click();

        await page.getByRole('button', { name: 'Save chart' }).click();

        const nameInput = page.getByTestId('ChartCreateModal/NameInput');
        await nameInput.click();
        await nameInput.fill('My chart');
        await expect(nameInput).toHaveValue('My chart');
        await page.getByRole('button', { name: 'Next' }).click();
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(page.getByText('Success! Chart was saved.')).toBeVisible();

        // FIXME disabling save changes button is currently broken...
        // await expect(page.getByText('Save changes').locator('..')).toBeDisabled();

        // wait for the chart to finish loading
        await expect(page.getByText('Loading chart')).toHaveCount(0);

        await page.getByText('Edit chart').locator('..').click();
        await page.waitForTimeout(500); // Wait for edit mode to fully load
        await expect(page.getByText('Configure', { exact: false })).toBeVisible(
            {
                timeout: 10000,
            },
        );
        await page.getByText('Configure').click();
        await page.waitForTimeout(300); // Wait for configure panel to open
        await expect(page.getByText('Bar chart', { exact: false })).toBeVisible(
            {
                timeout: 10000,
            },
        );
        await page.getByText('Bar chart').click(); // Change chart type
        await page.getByText('Horizontal bar chart').click();

        // cy.findByText('Save changes').parent().should('not.be.disabled');
        await page.getByText('Save changes').locator('..').click();

        await expect(
            page.getByText('Success! Chart was updated.'),
        ).toBeVisible();
    });

    // todo: combine tests
    test('Should change chart config type', async ({ adminPage: page }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/tables/orders`);

        await expect(page.getByTestId('page-spinner')).toHaveCount(0);

        // choose table and select fields
        await scrollTreeToItem(page, 'Order Customer');
        await page.getByText('Order Customer').click();
        await scrollTreeToItem(page, 'First name');
        await page.getByText('First name').dispatchEvent('click');
        await scrollTreeToItem(page, 'Unique order count');
        await page.getByText('Unique order count').dispatchEvent('click');

        // check that selected fields are in the table headers
        await expect(
            page.locator('th').filter({ hasText: 'Order Customer First name' }),
        ).toBeVisible();
        await expect(
            page.locator('th').filter({ hasText: 'Orders Unique order count' }),
        ).toBeVisible();

        // run query
        await page.getByRole('button', { name: 'Run query' }).first().click();

        // wait for the chart to finish loading
        await expect(page.getByText('Loading chart')).toHaveCount(0);

        // open chart menu and change chart types
        await page.getByText('Configure').click();
        await page.waitForTimeout(500);
        await page.getByRole('button', { name: 'Bar chart' }).click();

        await page
            .getByRole('menuitem', { name: 'Bar chart', exact: true })
            .click();
        await page.waitForTimeout(500);
        await page.getByRole('button', { name: 'Bar chart' }).click();

        await page
            .getByRole('menuitem', { name: 'Horizontal bar chart' })
            .click();
        await page.waitForTimeout(500);
        await page
            .getByRole('button', { name: 'Horizontal bar chart' })
            .click();

        await page.getByRole('menuitem', { name: 'Line chart' }).click();
        await page.waitForTimeout(500);
        await page.getByRole('button', { name: 'Line chart' }).click();

        await page.getByRole('menuitem', { name: 'Area chart' }).click();
        await page.waitForTimeout(500);
        await page.getByRole('button', { name: 'Area chart' }).click();

        await page.getByRole('menuitem', { name: 'Scatter chart' }).click();
        await page.waitForTimeout(500);
        await page.getByRole('button', { name: 'Scatter chart' }).click();

        await page.getByRole('menuitem', { name: 'Pie chart' }).click();
        await page.waitForTimeout(500);
        await page.getByRole('button', { name: 'Pie chart' }).click();

        await page.getByRole('menuitem', { name: 'Table' }).click();
        // Use a different selector cause there is another button with 'Table'
        await page.getByTestId('VisualizationCardOptions').click();

        await page.getByRole('menuitem', { name: 'Big value' }).click();
        await expect(
            page.getByRole('button', { name: 'Big value' }),
        ).toBeVisible();
    });

    // todo: move to unit test
    test.skip('Keeps chart config after updating table calculation', async ({
        adminPage: page,
    }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/tables/orders`);

        await expect(page.getByTestId('page-spinner')).toHaveCount(0);

        // choose table and select fields
        await scrollTreeToItem(page, 'Order Customer');
        await page.getByText('Order Customer').click();
        await scrollTreeToItem(page, 'First name');
        await page.getByText('First name').dispatchEvent('click');
        await scrollTreeToItem(page, 'Unique order count');
        await page.getByText('Unique order count').dispatchEvent('click');

        // add table calculation
        await page.getByRole('button', { name: 'Table calculation' }).click();

        // Wait for the modal to fully render and stabilize
        await page.waitForTimeout(300);

        // Focus the input explicitly and wait for it to be ready
        const nameInput = page.getByTestId('table-calculation-name-input');
        await expect(nameInput).toBeVisible();
        await expect(nameInput).toBeEnabled();
        await nameInput.focus();
        await nameInput.clear();
        await page.waitForTimeout(100);
        await nameInput.fill('TC');
        await expect(nameInput).toHaveValue('TC');
        await nameInput.blur();

        // Ensure focus moves to ace editor before typing
        await page.waitForTimeout(100);
        await page.locator('div.ace_content').click();
        await page
            .locator('div.ace_content')
            // eslint-disable-next-line no-template-curly-in-string
            .type('${orders.unique_order_count}');
        await page.getByTestId('table-calculation-save-button').first().click();

        // run query
        await page.getByRole('button', { name: 'Run query' }).first().click();

        // wait for the chart to finish loading
        await expect(page.getByText('Loading chart')).toHaveCount(0);

        // open chart menu and change chart types
        await page.getByText('Configure').click();

        // change X-axis to table calculation
        await page.getByTestId('x-axis-field-select').click();
        await page.getByTestId('x-axis-field-select').clear();
        await page.getByTestId('x-axis-field-select').fill('TC');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');

        // change y-axis to table calculation
        await page.getByTestId('y-axis-field-select').click();
        await page.getByTestId('y-axis-field-select').clear();
        await page.getByTestId('y-axis-field-select').fill('TC');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');

        await page
            .locator('th')
            .filter({ hasText: 'TC' })
            .locator('button')
            .click();

        const newTCName = 'TC2';

        await page.getByRole('button', { name: 'Edit calculation' }).click();
        const tcNameInput = page.getByTestId('table-calculation-name-input');
        await tcNameInput.fill(newTCName);
        await page.getByTestId('table-calculation-save-button').first().click();

        // run query
        await page.getByRole('button', { name: 'Run query' }).first().click();

        // wait for the chart to finish loading
        await expect(page.getByText('Loading chart')).toHaveCount(0);

        await expect(page.getByTestId('x-axis-field-select')).toHaveValue(
            newTCName,
        );
        await expect(page.getByTestId('y-axis-field-select')).toHaveValue(
            newTCName,
        );
    });

    // todo: move to unit test
    test.skip('Should change chart config layout', async ({
        adminPage: page,
    }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/tables/orders`);
        await expect(page.getByTestId('page-spinner')).toHaveCount(0);

        await scrollTreeToItem(page, 'Order Customer');
        await page.getByText('Order Customer').click();
        await scrollTreeToItem(page, 'First name');
        await page.getByText('First name').dispatchEvent('click');
        await scrollTreeToItem(page, 'Unique order count');
        await page.getByText('Unique order count').dispatchEvent('click');

        // run query
        await page.getByRole('button', { name: 'Run query' }).first().click();

        expect(await page.locator('g').locator('text').count()).toBeLessThan(
            30,
        ); // without labels

        await page.getByText('Configure').click();
        await page.getByText('Series').click();
        await page
            .getByText('Value labels')
            .locator('..')
            .locator('[role="combobox"]')
            .click();
        await page.locator('.mantine-Select-item').getByText('Top').click();

        expect(await page.locator('g').locator('text').count()).toBeGreaterThan(
            30,
        ); // with labels
    });

    // todo: move to unit test
    test.describe.skip('Sort', () => {
        test('should sort multisort results', async ({ adminPage: page }) => {
            await page.goto(`/projects/${SEED_PROJECT.project_uuid}/tables`);

            await page.getByText('Orders', { exact: true }).click();
            await expect(page.getByText('Dimensions')).toBeVisible();
            await scrollTreeToItem(page, 'Order Customer');
            await page.getByText('Order Customer').click();
            await scrollTreeToItem(page, 'First name');
            await page.getByText('First name').dispatchEvent('click');
            await scrollTreeToItem(page, 'Unique order count');
            await page.getByText('Unique order count').dispatchEvent('click');

            // run query
            await page
                .getByRole('button', { name: 'Run query' })
                .first()
                .click();

            // wait for query to finish
            await expect(page.getByText('Loading results')).toHaveCount(0);

            // open column menu
            await page
                .locator('th')
                .filter({ hasText: 'Orders Unique order count' })
                .locator('button')
                .click();
            // sort `Orders Unique order count` by ascending
            await page.getByRole('menuitem', { name: 'Sort 1-9' }).click();

            await expect(
                page
                    .locator('.mantine-Badge-inner')
                    .filter({ hasText: 'Sorted by' })
                    .locator('..')
                    .getByText('Unique order count'),
            ).toBeVisible();

            await page
                .locator('th')
                .filter({ hasText: 'Order Customer First name' })
                .locator('button')
                .click();
            // sort `Order Customer First name` by ascending
            await page.getByRole('menuitem', { name: 'Sort Z-A' }).click();

            await expect(
                page
                    .locator('.mantine-Badge-inner')
                    .filter({ hasText: 'Sorted by' })
                    .locator('..')
                    .getByText('First name'),
            ).toBeVisible();

            // wait for query to finish
            await expect(page.getByText('Loading results')).toHaveCount(0);

            // Add multi sort via popover
            await page
                .locator('.mantine-Badge-inner')
                .filter({ hasText: 'Sorted by' })
                .locator('..')
                .click();
            await page.getByRole('button', { name: 'Add sort' }).click();
            await page.getByPlaceholder('Add sort field').click();

            // click on Unique order count to add it to the sort
            await page
                .locator('.mantine-Select-item')
                .getByText('Unique order count')
                .click();

            // Multiple sort should be visible in badge
            await expect(
                page
                    .locator('.mantine-Badge-inner')
                    .filter({ hasText: 'Sorted by' })
                    .locator('..')
                    .getByText('2 fields'),
            ).toBeVisible();

            // wait for query to finish
            await expect(page.getByText('Loading results')).toHaveCount(0);
        });
    });

    // todo: move to unit test
    test.describe.skip('Chart type', () => {
        test.describe('Table', () => {
            test.describe('Config', () => {
                test('should hide table names from the header according to the config', async ({
                    adminPage: page,
                }) => {
                    await page.goto(
                        `/projects/${SEED_PROJECT.project_uuid}/tables/orders`,
                    );

                    // choose table and select fields
                    await scrollTreeToItem(page, 'Order Customer');
                    await page.getByText('Order Customer').click();
                    await scrollTreeToItem(page, 'First name');
                    await page.getByText('First name').dispatchEvent('click');
                    await scrollTreeToItem(page, 'Unique order count');
                    await page
                        .getByText('Unique order count')
                        .dispatchEvent('click');

                    // run query
                    await page
                        .getByRole('button', { name: 'Run query' })
                        .click();

                    // wait for the chart to finish loading
                    await expect(page.getByText('Loading chart')).toHaveCount(
                        0,
                    );

                    // open chart menu and change chart type to Table
                    await page
                        .getByRole('button', { name: 'Configure' })
                        .click();
                    await page.getByTestId('VisualizationCardOptions').click();
                    await page.getByRole('menuitem', { name: 'Table' }).click();

                    // check that chart table headers are correct (table names hidden by default)
                    await expect(
                        page
                            .getByTestId('visualization')
                            .locator('th')
                            .filter({ hasText: 'First name' }),
                    ).toBeVisible();
                    await expect(
                        page.getByTestId('visualization').locator('th').filter({
                            hasText: 'Order Customer First name',
                        }),
                    ).toHaveCount(0);

                    await page
                        .getByLabel('Show table names')
                        .click({ force: true });

                    // check that chart table headers show table names after toggle
                    await expect(
                        page.getByTestId('visualization').locator('th').filter({
                            hasText: 'Order Customer First name',
                        }),
                    ).toBeVisible();
                });

                test('should show header overrides according to the config', async ({
                    adminPage: page,
                }) => {
                    await page.goto(
                        `/projects/${SEED_PROJECT.project_uuid}/tables/orders`,
                    );

                    // choose table and select fields
                    await scrollTreeToItem(page, 'Order Customer');
                    await page.getByText('Order Customer').click();
                    await scrollTreeToItem(page, 'First name');
                    await page.getByText('First name').dispatchEvent('click');
                    await scrollTreeToItem(page, 'Unique order count');
                    await page
                        .getByText('Unique order count')
                        .dispatchEvent('click');

                    // run query
                    await page
                        .getByRole('button', { name: 'Run query' })
                        .click();

                    // wait for the chart to finish loading
                    await expect(page.getByText('Loading chart')).toHaveCount(
                        0,
                    );

                    // open chart menu and change chart type to Table
                    await page
                        .getByRole('button', { name: 'Configure' })
                        .click();
                    await page.getByTestId('VisualizationCardOptions').click();
                    await page.getByRole('menuitem', { name: 'Table' }).click();

                    // check that chart table headers are correct (table names hidden by default)
                    await expect(
                        page
                            .getByTestId('visualization')
                            .locator('th')
                            .nth(1)
                            .getByText('First name'),
                    ).toBeVisible();

                    // open configuration and add custom header
                    await page.getByPlaceholder('First name').focus();
                    await page
                        .getByPlaceholder('First name')
                        .fill('Overridden header');
                    await page.getByPlaceholder('First name').blur();

                    // check that chart table headers are overridden
                    await expect(
                        page
                            .getByTestId('visualization')
                            .locator('th')
                            .nth(1)
                            .getByText('Overridden header'),
                    ).toBeVisible();
                });
            });
        });
    });

    // todo: move to unit test
    test.skip('Should open SQL Runner with current query', async ({
        adminPage: page,
    }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/tables`);

        await page.getByText('Orders', { exact: true }).click();
        await scrollTreeToItem(page, 'Is completed');
        await page.getByText('Is completed').click();

        // open SQL
        await page.getByTestId('SQL-card-expand').click();

        // wait to compile query
        await expect(
            page.getByText('Open in SQL Runner').locator('..'),
        ).toBeEnabled();

        // This test requires getMonacoEditorText helper
        // Skipped in Cypress too
    });

    // todo: move to unit test
    test.skip('Should clear query using hotkeys', async ({
        adminPage: page,
    }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/tables`);

        await page.getByText('Orders', { exact: true }).click();
        await scrollTreeToItem(page, 'Is completed');
        await page.getByText('Is completed').click();

        // run query
        await page.getByRole('button', { name: 'Run query' }).first().click();

        // wait for query to finish
        await expect(page.getByText('Loading results')).toHaveCount(0);

        // clear query hotkeys
        await page.keyboard.press('Control+Alt+KeyK');

        // verify empty query keeping selected table
        await expect(
            page.locator('a').filter({ hasText: 'Tables' }).locator('..'),
        ).toContainText('Tables/Orders');
        await expect(
            page.getByText('Pick a metric & select its dimensions'),
        ).toBeVisible();
    });

    // todo: move to unit test
    test.skip('Should search tables and select fields', async ({
        adminPage: page,
    }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/tables`);
        await expect(page.getByTestId('page-spinner')).toHaveCount(0);

        // Select the Orders table from search results
        await page.getByText('Orders', { exact: true }).click();

        // Wait for the explore page to load
        await expect(page.getByText('Dimensions')).toBeVisible();

        // Search for tables using the search input
        await page.getByTestId('ExploreTree/SearchInput').fill('First name');

        // Select some fields to query
        await scrollTreeToItem(page, 'First name');
        await page.getByText('First name').dispatchEvent('click');

        // Run the query
        await page.getByRole('button', { name: 'Run query' }).first().click();

        // Wait for query to finish loading
        await expect(page.getByText('Loading results')).toHaveCount(0);

        // Check that the results table exists and has the expected columns
        await expect(page.locator('table')).toBeVisible();
        await expect(
            page.locator('th').filter({ hasText: 'Order Customer First name' }),
        ).toBeVisible();

        // Verify that we have actual data in the table
        expect(await page.locator('tbody tr').count()).toBeGreaterThan(0);

        // Check specific data - first row should have a customer name
        await expect(
            page.locator('tbody tr').first().locator('td').nth(1),
        ).not.toBeEmpty();
    });

    // todo: move to unit test
    test.skip('Should add a custom dimension', async ({ adminPage: page }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/tables`);
        await expect(page.getByTestId('page-spinner')).toHaveCount(0);

        // Select the Orders table
        await page.getByText('Orders', { exact: true }).click();

        // Wait for the explore page to load
        await expect(page.getByText('Dimensions')).toBeVisible();

        // Scroll to the Dimensions section header (which has the Add Custom Dimension button)
        await scrollTreeToItem(page, 'Dimensions');

        // Click the Add Custom Dimension button
        await page
            .getByTestId('VirtualSectionHeader/AddCustomDimensionButton')
            .click();

        await page
            .getByTestId('CustomSqlDimensionModal/LabelInput')
            .fill('A custom dimension');
        await page.locator('#ace-editor').type('true');
        await page.getByText('Create').click();

        // Run query
        await page.getByTestId('RefreshButton/RunQueryButton').first().click();

        // Wait for query to finish loading
        await expect(page.getByText('Loading results')).toHaveCount(0);

        // Check that the results table exists and has the expected columns
        await expect(page.locator('table')).toBeVisible();
        await expect(
            page.locator('th').filter({ hasText: 'A custom dimension' }),
        ).toBeVisible();

        // Verify that we have actual data in the table
        expect(await page.locator('tbody tr').count()).toBeGreaterThan(0);

        // Check specific data - first row should have a customer name
        await expect(
            page.locator('tbody tr').first().locator('td').nth(1),
        ).not.toBeEmpty();
    });
});
