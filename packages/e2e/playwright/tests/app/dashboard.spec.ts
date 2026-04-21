import { SEED_PROJECT } from '@lightdash/common';
import { expect, test } from '../../fixtures';

test.describe('Dashboard', () => {
    test('Should see dashboard', async ({ adminPage: page }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/dashboards`);

        // wait for the dashboard to load
        await expect(page.getByText('Loading dashboards')).toHaveCount(0);

        const jaffleDashboardLink = page
            .locator('a')
            .filter({ hasText: 'Jaffle dashboard' })
            .first();
        await expect(jaffleDashboardLink).toBeVisible({ timeout: 15000 });
        await jaffleDashboardLink.click();

        const grid = page.locator('.react-grid-layout');
        await expect(
            grid.getByText("What's our total revenue to date?"),
        ).toBeVisible();
        await expect(
            grid.getByText("What's the average spend per customer?"),
        ).toBeVisible();

        await expect(page.getByText('Loading chart')).toHaveCount(0); // Finish loading

        await expect(page.getByText('No chart available')).toHaveCount(0);
        await expect(page.getByText('No data available')).toHaveCount(0);

        // Scroll down to trigger deferred chart rendering for below-fold tiles
        await page.locator('.react-grid-layout').scrollIntoViewIfNeeded();
        await page.evaluate(() =>
            window.scrollTo(0, document.body.scrollHeight),
        );

        await expect(page.locator('.echarts-for-react')).toHaveCount(3); // Charts

        await expect(
            grid.getByText('Payments total revenue', { exact: true }),
        ).toBeVisible(); // BigNumber chart
        await expect(grid.locator('thead th')).toHaveCount(6); // Table chart
    });

    // todo: move to unit tests
    test.skip('Should use dashboard filters, should clear them for new dashboards', async ({
        adminPage: page,
    }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/dashboards`);

        // wait for the dashboard to load
        await expect(page.getByText('Loading dashboards')).toHaveCount(0);

        const jaffleDashboardLink = page
            .locator('a')
            .filter({ hasText: 'Jaffle dashboard' })
            .first();
        await expect(jaffleDashboardLink).toBeVisible({ timeout: 15000 });
        await jaffleDashboardLink.click();

        const grid = page.locator('.react-grid-layout');
        await expect(grid.getByText('How much revenue')).toBeVisible();

        await expect(page.getByText('Loading chart')).toHaveCount(0); // Finish loading

        await expect(page.getByText('bank_transfer')).toHaveCount(1);

        // Add filter
        await page.getByText('Add filter').click();

        await page.getByTestId('FilterConfiguration/FieldSelect').click();
        await page.getByTestId('FilterConfiguration/FieldSelectSearch').click();
        await page
            .getByTestId('FilterConfiguration/FieldSelectSearch')
            .fill('payment');
        await page.waitForTimeout(200);

        await page
            .locator(
                '[data-combobox-option="true"][value="payments_payment_method"]',
            )
            .click();
        await page
            .getByPlaceholder('Start typing to filter results')
            .fill('credit_card');
        await page.getByRole('option', { name: 'credit_card' }).click();
        await page.getByRole('tab').nth(0).click();
        await page
            .getByRole('button', { name: 'Apply' })
            .click({ force: true });

        await expect(page.getByText('bank_transfer')).toHaveCount(0);

        // Check url includes no saved filters
        await expect(page).not.toHaveURL(/filters=/);
        await expect(page).not.toHaveURL(/years/);

        // Check url includes temp filters
        await expect(page).toHaveURL(/tempFilters=/);
        await expect(page).toHaveURL(/credit_card/);

        // Check that temp filter gets kept on reload
        await page.reload();
        await expect(
            page.getByText('Payment method is credit_card'),
        ).toBeVisible();
        await expect(page.getByText('bank_transfer')).toHaveCount(0);

        // Create a new dashboard
        await page.getByTestId('ExploreMenu/NewButton').click();
        await page.getByTestId('ExploreMenu/NewDashboardButton').click();

        await page.getByLabel('Name your dashboard *').fill('Title');
        await page.getByText('Next').click();
        await page.getByText('Create').click();

        // Check url has no filters
        await expect(page).not.toHaveURL(/filters=/);
        await expect(page).not.toHaveURL(/tempFilters=/);
        await expect(page).not.toHaveURL(/\?/);
    });

    test('views underlying data with dimensions and metrics', async ({
        adminPage: page,
    }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/dashboards`);

        // wait for the dashboard to load
        await expect(page.getByText('Loading dashboards')).toHaveCount(0);

        const jaffleDashboardLink = page
            .locator('a')
            .filter({ hasText: 'Jaffle dashboard' })
            .first();
        await expect(jaffleDashboardLink).toBeVisible({ timeout: 15000 });
        await jaffleDashboardLink.click();

        const grid = page.locator('.react-grid-layout');
        await expect(
            grid.getByText("What's our total revenue to date?"),
        ).toBeVisible();

        await expect(page.getByText('Loading chart')).toHaveCount(0); // Finish loading

        await page
            .getByTestId('big-number-value')
            .first()
            .scrollIntoViewIfNeeded();
        await page.getByTestId('big-number-value').first().click();
        // Use getByRole to match only visible menu items in the accessibility tree.
        await page
            .getByRole('menuitem', { name: 'View underlying data' })
            .click({ force: true });

        const dialog = page.locator('section[role="dialog"]');
        // Metrics
        await expect(
            dialog.getByText('Payments Unique payment count'),
        ).toBeVisible();
        await expect(
            dialog.getByText('Orders Average order size'),
        ).toBeVisible();

        // Dimensions
        await expect(dialog.getByText('Orders Status')).toBeVisible();
        await expect(dialog.getByText('Orders Order date')).toBeVisible();
        await expect(dialog.getByText('Payments Amount')).toBeVisible();
    });

    test('Should create dashboard with saved chart + charts within dashboard + filters + tile targets', async ({
        adminPage: page,
    }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/dashboards`);

        await page
            .getByText('Create dashboard', { exact: false })
            .click({ timeout: 30000 });
        await page
            .getByLabel('Name your dashboard *', { exact: false })
            .fill('Title');
        await page.getByLabel('Dashboard description').fill('Description');
        await page.getByText('Next').click();
        // Step 2 is a space picker. Click the Jaffle shop treeitem so the
        // Create button becomes enabled (form.values.spaceUuid is required).
        await page
            .getByRole('dialog')
            .getByRole('treeitem', { name: /^Jaffle shop$/ })
            .click();
        const createDashButton = page.getByText('Create', { exact: true });
        await expect(createDashButton).toBeEnabled();
        await createDashButton.click({ timeout: 10000 });

        // Add Saved Chart
        await page.getByRole('button', { name: 'Add tile' }).first().click();
        await page
            .getByRole('menuitem', { name: 'Saved chart' })
            .click({ force: true });
        await page.getByRole('dialog').getByPlaceholder('Search...').click();
        // search
        await page
            .getByRole('dialog')
            .getByPlaceholder('Search...')
            .fill('How much revenue');
        await page
            .getByRole('option', {
                name: 'How much revenue do we have per payment method?',
            })
            .click();
        await page
            .getByRole('dialog')
            .locator('.mantine-MultiSelect-input')
            .click(); // Close dropdown
        await page
            .getByRole('dialog')
            .getByRole('button', { name: 'Add', exact: true })
            .click();
        await expect(
            page.getByText('How much revenue do we have per payment method?'),
        ).toBeVisible();

        // Create chart within dashboard
        await page.getByRole('button', { name: 'Add tile' }).first().click();
        await page
            .getByRole('menuitem', { name: /New chart/ })
            .click({ force: true });
        await expect(
            page.getByText('You are creating this chart from within "Title"'),
        ).toBeVisible();
        await page.getByText('Payments', { exact: true }).click();
        await page.getByText('Payment method', { exact: true }).click();
        await page.getByText('Unique payment count').click();
        await page.getByRole('button', { name: 'Save chart' }).click();
        const chartNameInput1 = page.getByTestId('ChartCreateModal/NameInput');
        await chartNameInput1.click();
        await chartNameInput1.fill(
            `What's the number of unique payments per payment method?`,
        );
        await expect(chartNameInput1).toHaveValue(
            `What's the number of unique payments per payment method?`,
        );
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(
            page.getByText(
                `Success! What's the number of unique payments per payment method? was added to Title`,
            ),
        ).toBeVisible();

        // Wait to be redirected to dashboard
        await expect(page).toHaveURL(/\/dashboards/);

        // Add filter Payment method is credit_card and apply
        await page.getByText('Add filter').click();
        await page.getByTestId('FilterConfiguration/FieldSelect').click();
        await page.getByTestId('FilterConfiguration/FieldSelectSearch').click();
        await page
            .getByTestId('FilterConfiguration/FieldSelectSearch')
            .fill('payment');
        await page.waitForTimeout(200);
        await page
            .locator(
                '[data-combobox-option="true"][value="payments_payment_method"]',
            )
            .click();
        // Mantine Switch keeps its <input> visually hidden, so click the
        // associated <label> text instead of the input itself.
        await page.getByText('Provide default value').click();
        await page
            .getByPlaceholder('Start typing to filter results')
            .fill('credit_card');
        await page.getByRole('option', { name: 'credit_card' }).click();
        // Close the multi-value combobox so the Apply button becomes enabled
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: 'Apply' }).click();

        // Filter should be applied and no other payment methods should be visible in the charts
        await expect(page.getByText('bank_transfer')).toHaveCount(0);

        // Save dashboard so that the filter persists across navigations
        await page.getByText('Save changes').click();
        await expect(
            page.getByText('Dashboard was updated').first(),
        ).toBeVisible();

        // Re-enter edit mode
        await page.getByLabel('Edit dashboard').click();

        // Create another chart within dashboard
        await page.getByRole('button', { name: 'Add tile' }).first().click();
        await page
            .getByRole('menuitem', { name: /New chart/ })
            .click({ force: true });
        await expect(
            page.getByText('You are creating this chart from within "Title"'),
        ).toBeVisible();
        await page.getByText('Payments', { exact: true }).click();
        await page.getByText('Payment method', { exact: true }).click();
        await page.getByText('Total revenue').click();
        await page.getByRole('button', { name: 'Save chart' }).click();
        const chartNameInput2 = page.getByTestId('ChartCreateModal/NameInput');
        await chartNameInput2.click();
        await chartNameInput2.fill(
            `What's the total revenue per payment method?`,
        );
        await expect(chartNameInput2).toHaveValue(
            `What's the total revenue per payment method?`,
        );
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(
            page.getByText(
                `Success! What's the total revenue per payment method? was added to Title`,
            ),
        ).toBeVisible();

        // Wait to be redirected to dashboard
        await expect(page).toHaveURL(/\/dashboards/);

        // Filter payment method should be already applied
        await expect(page.getByText('bank_transfer')).toHaveCount(0);

        // Check tile targets are correct and all charts have that filter applied
        await page.getByText('Payment method is credit_card').click();
        await page.getByRole('tab').nth(1).click();
        await expect(
            page.locator(
                '[data-testid="DashboardFilterConfiguration/ChartTiles"] .mantine-Checkbox-body',
            ),
        ).toHaveCount(4); // 3 checkboxes for the 3 charts + `select all` checkbox

        const checkboxBodies = page.locator(
            '[data-testid="DashboardFilterConfiguration/ChartTiles"] .mantine-Checkbox-body',
        );
        const count = await checkboxBodies.count();
        for (let i = 0; i < count; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            await expect(
                checkboxBodies.nth(i).locator('input[checked]'),
            ).toHaveCount(1);
        }

        // Remove filter from first chart - saved chart
        await page
            .locator(
                '[data-testid="DashboardFilterConfiguration/ChartTiles"] .mantine-Checkbox-body',
            )
            .nth(1)
            .click();
        await page
            .getByRole('button', { name: 'Apply' })
            .click({ force: true });

        // Saved chart should have no filter applied
        await expect(page.locator('.react-grid-item').first()).toContainText(
            'bank_transfer',
        );
        await expect(page.getByText('bank_transfer')).toHaveCount(1);

        // Save dashboard so that the filter target change persists across navigations
        await page.getByText('Save changes').click();
        await expect(
            page.getByText('Dashboard was updated').first(),
        ).toBeVisible();

        // Re-enter edit mode
        await page.getByLabel('Edit dashboard').click();

        // Create new chart within dashboard, but reference another explore
        await page.getByRole('button', { name: 'Add tile' }).first().click();
        await page
            .getByRole('menuitem', { name: /New chart/ })
            .click({ force: true });
        await expect(
            page.getByText('You are creating this chart from within "Title"'),
        ).toBeVisible();
        await page.getByText('staging').click();
        await page.getByText('Stg payments').click();
        await page.getByText('Payment method', { exact: true }).click();
        await page.getByText('Amount').click();
        await page.getByRole('button', { name: 'Save chart' }).click();
        const stgNameInput = page.getByTestId('ChartCreateModal/NameInput');
        await stgNameInput.click();
        await stgNameInput.fill(`Stg Payments (payment method x amount)?`);
        await expect(stgNameInput).toHaveValue(
            `Stg Payments (payment method x amount)?`,
        );
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(
            page.getByText(
                `Success! Stg Payments (payment method x amount)? was added to Title`,
            ),
        ).toBeVisible();

        // Wait to be redirected to dashboard
        await expect(page).toHaveURL(/\/dashboards/);

        // Open filter popover and check that all charts have the filter applied except for the new one
        await page.getByText('Payment method is credit_card').click();
        await page.getByRole('tab').nth(1).click();
        await expect(
            page.locator(
                '[data-testid="DashboardFilterConfiguration/ChartTiles"] .mantine-Checkbox-body',
            ),
        ).toHaveCount(5); // 4 checkboxes for the 4 charts + `select all` checkbox

        // Enable filter for the new chart (Stg payments - different explore)
        const stgTileItem = page
            .locator(
                '[data-testid="DashboardFilterConfiguration/ChartTiles"] [data-testid="tile-filter-item"]',
            )
            .filter({
                hasText: 'Stg Payments (payment method x amount)?',
            });
        await stgTileItem.locator('.mantine-Checkbox-body').click();
        await expect(
            stgTileItem.locator('input[type="checkbox"]'),
        ).toBeChecked();
        await page
            .getByRole('button', { name: 'Apply' })
            .click({ force: true });

        // Saved chart should have the filter applied and only see credit_card bar
        await expect(page.locator('.react-grid-item').last()).not.toContainText(
            'bank_transfer',
        );

        // Add Markdown tile
        await page.getByRole('button', { name: 'Add tile' }).first().click();
        await page
            .getByRole('menuitem', { name: 'Markdown' })
            .click({ force: true });
        const addTileForm = page.getByTestId('add-tile-form');
        await addTileForm.getByRole('textbox', { name: 'Title' }).fill('Title');
        await addTileForm.locator('textarea').fill('Content');
        await page
            .getByRole('dialog')
            .getByRole('button', { name: 'Add', exact: true })
            .click();

        await page.getByText('Save changes').click();

        await expect(
            page.getByText('Dashboard was updated').first(),
        ).toBeVisible();

        await expect(page.getByText('Loading chart')).toHaveCount(0); // Finish loading
        await expect(page.getByText('No chart available')).toHaveCount(0);
        await expect(page.getByText('No data available')).toHaveCount(0);
    });

    // todo: move to api/unit tests
    test.skip('Should preview a dashboard image export', async ({
        adminPage: page,
    }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/dashboards`);
        // create dashboard with title small
        await page.getByText('Create dashboard').click();
        await page.getByLabel('Name your dashboard *').fill('Small');
        await page.getByText('Next').click();
        await page.getByText('Create').click();

        // Create chart within dashboard
        await page.getByText('Add tile').click();
        await page.getByText('New chart').click();
        await expect(
            page.getByText('You are creating this chart from within "Small"'),
        ).toBeVisible();
        await page.getByText('Payments', { exact: true }).click();
        await page.getByText('Payment method', { exact: true }).click();
        await page.getByText('Unique payment count').click();
        await page.getByRole('button', { name: 'Save chart' }).click();
        const chartNameInput3 = page.getByTestId('ChartCreateModal/NameInput');
        await chartNameInput3.click();
        await chartNameInput3.fill(
            `What's the number of unique payments per payment method?`,
        );
        await expect(chartNameInput3).toHaveValue(
            `What's the number of unique payments per payment method?`,
        );
        await page.getByRole('button', { name: 'Save', exact: true }).click();

        await page.getByText('Save changes').click();

        await expect(
            page.getByText('Dashboard was updated').first(),
        ).toBeVisible();

        await page.waitForTimeout(2000);

        await page.getByTestId('dashboard-header-menu').click();
        await page.getByText('Export dashboard').click();
        await page.getByText('Generate preview').click();

        await expect(page.locator('div').getByText('Success')).toBeVisible({
            timeout: 20000,
        });
    });

    // todo: move to api/unit tests
    test.skip('Should access dashboard by slug instead of UUID', async ({
        adminPage: page,
    }) => {
        // First, verify we can access via slug
        const slug = 'jaffle-dashboard';
        await page.goto(
            `/projects/${SEED_PROJECT.project_uuid}/dashboards/${slug}`,
        );

        // Verify the dashboard loads correctly
        const grid = page.locator('.react-grid-layout');
        await expect(
            grid.getByText("What's our total revenue to date?"),
        ).toBeVisible();
        await expect(
            grid.getByText("What's the average spend per customer?"),
        ).toBeVisible();

        await expect(page.getByText('Loading chart')).toHaveCount(0);

        // Verify URL contains the slug
        await expect(page).toHaveURL(new RegExp(`/dashboards/${slug}`));

        // Verify charts render
        await expect(page.locator('.echarts-for-react')).toHaveCount(3);
    });

    // todo: move to api/unit tests
    test.skip('Should maintain dashboard filters when using slug', async ({
        adminPage: page,
    }) => {
        const slug = 'jaffle-dashboard';
        await page.goto(
            `/projects/${SEED_PROJECT.project_uuid}/dashboards/${slug}`,
        );

        const grid = page.locator('.react-grid-layout');
        await expect(grid.getByText('How much revenue')).toBeVisible();

        await expect(page.getByText('Loading chart')).toHaveCount(0);

        // Add filter
        await page.getByText('Add filter').click();

        await page.getByTestId('FilterConfiguration/FieldSelect').click();
        await page.getByTestId('FilterConfiguration/FieldSelectSearch').click();
        await page
            .getByTestId('FilterConfiguration/FieldSelectSearch')
            .fill('payment');
        await page.waitForTimeout(200);
        await page
            .locator(
                '[data-combobox-option="true"][value="payments_payment_method"]',
            )
            .click();
        await page
            .getByPlaceholder('Start typing to filter results')
            .fill('credit_card');
        await page.getByRole('option', { name: 'credit_card' }).click();
        await page.getByRole('tab').nth(0).click();
        await page
            .getByRole('button', { name: 'Apply' })
            .click({ force: true });

        await expect(page.getByText('bank_transfer')).toHaveCount(0);

        // Verify URL still uses slug with temp filters
        await expect(page).toHaveURL(new RegExp(`/dashboards/${slug}`));
        await expect(page).toHaveURL(/tempFilters=/);
        await expect(page).toHaveURL(/credit_card/);

        // Reload and verify slug is preserved
        await page.reload();
        await expect(page).toHaveURL(new RegExp(`/dashboards/${slug}`));
        await expect(
            page.getByText('Payment method is credit_card'),
        ).toBeVisible();
    });

    // todo: move to api/unit tests
    test.skip('Should access dashboard via API using slug', async ({
        adminPage: page,
    }) => {
        const slug = 'jaffle-dashboard';

        // Test API endpoint with slug
        const response = await page.request.get(`/api/v1/dashboards/${slug}`);
        const body = await response.json();
        expect(response.status()).toBe(200);
        expect(body).toHaveProperty('status', 'ok');
        expect(body.results).toHaveProperty('name', 'Jaffle dashboard');
        expect(body.results).toHaveProperty('slug', slug);
        expect(body.results).toHaveProperty('uuid');
        expect(body.results.tiles).toBeInstanceOf(Array);
    });

    // todo: move to api/unit tests
    test.skip('Should handle invalid dashboard slug gracefully', async ({
        adminPage: page,
    }) => {
        await page.goto(
            `/projects/${SEED_PROJECT.project_uuid}/dashboards/non-existent-slug`,
        );

        // Should show an error message
        await expect(page.getByText('Dashboard not found')).toBeVisible();
    });
});
