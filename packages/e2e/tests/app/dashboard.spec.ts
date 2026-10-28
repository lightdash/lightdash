import { SEED_PROJECT } from '@lightdash/common';
import {
    expect,
    loginAs,
    SEED_USERS,
    test,
    type Page,
} from '../../support/test';

const getTileTitleRects = (page: Page, name: string) =>
    page.getByRole('link', { name }).evaluate((title) => {
        const card = title.closest('.mantine-Card-root');
        if (!card || !title.parentElement)
            throw new Error('Title has no card or container');
        const rect = title.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        return {
            left: rect.left - cardRect.left,
            top: rect.top - cardRect.top,
            containerHeight: title.parentElement.getBoundingClientRect().height,
        };
    });

const addPaymentMethodFilterField = async (page: Page) => {
    await page.getByText('Add filter').click();
    await page.getByTestId('FilterConfiguration/FieldSelect').click();
    await page
        .getByTestId('FilterConfiguration/FieldSelect')
        .pressSequentially('payment');
    await page
        .locator(
            '[data-combobox-option="true"][value="payments_payment_method"]',
        )
        .click();
};

const createChartWithinDashboard = async (
    page: Page,
    fields: string[],
    chartName: string,
) => {
    await page.getByRole('button', { name: 'Add tile' }).first().click();
    await page
        .getByRole('menuitem', { name: /New chart/ })
        .click({ force: true });
    await expect(
        page.getByText('You are creating this chart from within "Title"', {
            exact: true,
        }),
    ).toBeAttached();
    for (const field of fields) {
        await page.getByText(field, { exact: true }).click();
    }
    await page.getByText('Save chart', { exact: true }).click();
    await page.getByTestId('ChartCreateModal/NameInput').clear();
    await page.getByTestId('ChartCreateModal/NameInput').fill(chartName);
    await page.getByText('Save', { exact: true }).click();
    await expect(
        page.getByText(`Success! ${chartName} was added to Title`, {
            exact: true,
        }),
    ).toBeAttached();

    // Wait to be redirected to dashboard
    await expect(page).toHaveURL(/\/dashboards/);
};

const openJaffleDashboard = async (page: Page) => {
    await page.goto(`/projects/${SEED_PROJECT.project_uuid}/dashboards`);

    // wait for the dashboard to load
    await expect(
        page.getByText('Loading dashboards', { exact: true }),
    ).toHaveCount(0);

    await page
        .locator('a')
        .filter({ hasText: 'Jaffle dashboard' })
        .first()
        .click();
};

test.describe('Dashboard', () => {
    test.beforeEach(async ({ api }) => {
        await loginAs(api.raw, SEED_USERS.admin);
    });

    test('keeps a chart tile title in place on hover', async ({ page }) => {
        const name = 'How much revenue do we have per payment method?';
        await page.goto(
            '/projects/jaffle-shop/dashboards/jaffle-dashboard/view',
        );

        const title = page.getByRole('link', { name });
        await expect(title).toBeVisible({ timeout: 30_000 });
        await title.scrollIntoViewIfNeeded();
        const initial = await getTileTitleRects(page, name);

        await title.hover();
        await expect(title).toHaveAttribute('data-hovered', 'true');
        await expect
            .poll(async () => {
                const hovered = await getTileTitleRects(page, name);
                return (
                    Math.abs(hovered.left - initial.left) <= 0.5 &&
                    Math.abs(hovered.top - initial.top) <= 0.5 &&
                    Math.abs(
                        hovered.containerHeight - initial.containerHeight,
                    ) <= 0.5
                );
            })
            .toBe(true);
    });

    test('Should see dashboard', async ({ page }) => {
        await openJaffleDashboard(page);

        const grid = page.locator('.react-grid-layout');
        await expect(
            grid.getByText("What's our total revenue to date?", {
                exact: true,
            }),
        ).toBeAttached();
        await expect(
            grid.getByText("What's the average spend per customer?", {
                exact: true,
            }),
        ).toBeAttached();

        await expect(
            page.getByText('Loading chart', { exact: true }),
        ).toHaveCount(0); // Finish loading

        await expect(
            page.getByText('No chart available', { exact: true }),
        ).toHaveCount(0);
        await expect(
            page.getByText('No data available', { exact: true }),
        ).toHaveCount(0);

        // Scroll down to trigger deferred chart rendering for below-fold tiles
        await grid.scrollIntoViewIfNeeded();
        await page.evaluate(() =>
            window.scrollTo(0, document.body.scrollHeight),
        );

        await expect(page.locator('.echarts-for-react')).toHaveCount(3); // Charts

        await expect(
            grid.getByText('Payments total revenue').first(),
        ).toBeAttached(); // BigNumber chart
        await expect(grid.locator('thead th')).toHaveCount(6); // Table chart
    });

    // todo: move to unit tests
    test.skip('Should use dashboard filters, should clear them for new dashboards', async ({
        page,
    }) => {
        await openJaffleDashboard(page);

        await expect(
            page
                .locator('.react-grid-layout')
                .getByText('How much revenue')
                .first(),
        ).toBeAttached();

        await expect(
            page.getByText('Loading chart', { exact: true }),
        ).toHaveCount(0); // Finish loading

        await expect(page.getByText('bank_transfer').first()).toBeAttached();

        // Add filter
        await addPaymentMethodFilterField(page);
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
            page.getByText('Payment method is credit_card').first(),
        ).toBeAttached();
        await expect(page.getByText('bank_transfer')).toHaveCount(0);

        // Create a new dashboard
        await page.getByTestId('ExploreMenu/NewButton').click();
        await page.getByTestId('ExploreMenu/NewDashboardButton').click();

        await page.getByLabel('Name your dashboard *').fill('Title');
        await page.getByText('Next', { exact: true }).click();
        await page.getByText('Create', { exact: true }).click();

        // Check url has no filters
        await expect(page).not.toHaveURL(/filters=/);
        await expect(page).not.toHaveURL(/tempFilters=/);
        await expect(page).not.toHaveURL(/\?/);
    });

    test('views underlying data with dimensions and metrics', async ({
        page,
    }) => {
        await openJaffleDashboard(page);

        await expect(
            page
                .locator('.react-grid-layout')
                .getByText("What's our total revenue to date?", {
                    exact: true,
                }),
        ).toBeAttached();

        await expect(
            page.getByText('Loading chart', { exact: true }),
        ).toHaveCount(0); // Finish loading

        const bigNumber = page.getByTestId('big-number-value').first();
        await bigNumber.scrollIntoViewIfNeeded();
        await bigNumber.click();
        // getByRole only matches visible menu items; Mantine v8 keeps hidden dropdowns in the DOM.
        await page
            .getByRole('menuitem', { name: 'View underlying data' })
            .click({ force: true });

        const dialog = page.locator('section[role="dialog"]');
        // Metrics
        await expect(
            dialog.getByText('Payments Unique payment count').first(),
        ).toBeAttached();
        await expect(
            dialog.getByText('Orders Average order size').first(),
        ).toBeAttached();

        // Dimensions
        await expect(dialog.getByText('Orders Status').first()).toBeAttached();
        await expect(
            dialog.getByText('Orders Order date').first(),
        ).toBeAttached();
        await expect(
            dialog.getByText('Payments Amount').first(),
        ).toBeAttached();
    });

    test('Should create dashboard with saved chart + charts within dashboard + filters + tile targets', async ({
        page,
    }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/dashboards`);

        await page
            .getByText('Create dashboard')
            .first()
            .click({ timeout: 30_000 });
        await page
            .getByLabel('Name your dashboard *')
            .fill('Title', { timeout: 10_000 });
        await page.getByLabel('Dashboard description').fill('Description');
        await page.getByText('Next', { exact: true }).click();
        await page
            .getByText('Create', { exact: true })
            .click({ timeout: 10_000 });

        // Add Saved Chart
        // first() handles both toolbar and empty state buttons; clicking both Menu triggers toggles open→closed.
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
        // Synthetic keydown like Cypress `{esc}`: closes the dropdown without closing the modal
        await page
            .getByRole('dialog')
            .getByRole('textbox')
            .dispatchEvent('keydown', { key: 'Escape', bubbles: true });
        await page.getByText('Add', { exact: true }).click();
        await expect(
            page.getByText('How much revenue do we have per payment method?', {
                exact: true,
            }),
        ).toBeAttached();

        // Create chart within dashboard
        await createChartWithinDashboard(
            page,
            ['Payments', 'Payment method', 'Unique payment count'],
            "What's the number of unique payments per payment method?",
        );

        // Add filter Payment method is credit_card and apply
        await addPaymentMethodFilterField(page);
        // using force click here because this is a     mantine switch and the actual checkbox is hidden
        await page.getByLabel('Provide default value').click({ force: true });
        await page
            .getByPlaceholder('Start typing to filter results')
            .fill('credit_card');
        await page.getByRole('option', { name: 'credit_card' }).click();
        await page
            .getByRole('button', { name: 'Apply' })
            .click({ force: true });

        // Filter should be applied and no other payment methods should be visible in the charts
        await expect(page.getByText('bank_transfer')).toHaveCount(0);

        // Save dashboard so that the filter persists across navigations
        // (creating a chart within dashboard navigates away and back)
        await page.getByText('Save changes', { exact: true }).click();
        await expect(
            page.getByText('Dashboard was updated').first(),
        ).toBeAttached();

        // Re-enter edit mode
        await page.getByLabel('Edit dashboard').click();

        // Create another chart within dashboard
        await createChartWithinDashboard(
            page,
            ['Payments', 'Payment method', 'Total revenue'],
            "What's the total revenue per payment method?",
        );

        // Filter payment method should be already applied
        await expect(page.getByText('bank_transfer')).toHaveCount(0);

        // Check tile targets are correct and all charts have that filter applied
        await page.getByText('Payment method is credit_card').first().click();
        await page.getByRole('tab').nth(1).click();
        const tileCheckboxes = page
            .getByTestId('DashboardFilterConfiguration/ChartTiles')
            .getByRole('checkbox');
        await expect(tileCheckboxes).toHaveCount(4); // 3 checkboxes for the 3 charts + `select all` checkbox
        for (const checkbox of await tileCheckboxes.all()) {
            await expect(checkbox).toBeChecked();
        }

        // Remove filter from first chart - saved chart
        await tileCheckboxes.nth(1).click({ force: true });
        await expect(tileCheckboxes.nth(1)).not.toBeChecked();
        await page
            .getByRole('button', { name: 'Apply' })
            .click({ force: true });

        // Saved chart should have no filter applied
        await expect(page.locator('.react-grid-item').first()).toContainText(
            'bank_transfer',
        );
        await expect(page.getByText('bank_transfer').first()).toBeAttached();

        // Save dashboard so that the filter target change persists across navigations
        await page.getByText('Save changes', { exact: true }).click();
        await expect(
            page.getByText('Dashboard was updated').first(),
        ).toBeAttached();

        // Re-enter edit mode
        await page.getByLabel('Edit dashboard').click();

        // Create new chart within dashboard, but reference another explore
        await createChartWithinDashboard(
            page,
            ['staging', 'Stg payments', 'Payment method', 'Amount'],
            'Stg Payments (payment method x amount)?',
        );

        // Open filter popover  and check that all charts have the filter applied except for the new one (which is referencing another explore)
        await page.getByText('Payment method is credit_card').first().click(); // Note: disable React strict mode in local dev to avoid error in this line
        await page.getByRole('tab').nth(1).click();
        await expect(tileCheckboxes).toHaveCount(5); // 4 checkboxes for the 4 charts + `select all` checkbox

        // Enable filter for the new chart (Stg payments - different explore)
        // Checking the box auto-selects a default field via matchFieldByTypeAndName
        const stgTile = page
            .getByTestId('DashboardFilterConfiguration/ChartTiles')
            .getByTestId('tile-filter-item')
            .filter({ hasText: 'Stg Payments (payment method x amount)?' });
        await stgTile.getByRole('checkbox').check({ force: true });
        await expect(stgTile.locator('input[type="checkbox"]')).toBeChecked();
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
        await page.getByLabel('Title', { exact: true }).fill('Title');
        await page
            .getByTestId('add-tile-form')
            .locator('textarea')
            .fill('Content');
        await page.getByText('Add', { exact: true }).click();

        await page.getByText('Save changes', { exact: true }).click();

        await expect(
            page.getByText('Dashboard was updated').first(),
        ).toBeAttached();

        await expect(
            page.getByText('Loading chart', { exact: true }),
        ).toHaveCount(0); // Finish loading
        await expect(
            page.getByText('No chart available', { exact: true }),
        ).toHaveCount(0);
        await expect(
            page.getByText('No data available', { exact: true }),
        ).toHaveCount(0);
    });

    // todo: move to api/unit tests
    test.skip('Should preview a dashboard image export', async ({ page }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/dashboards`);
        // create dashboard with title small
        await page.getByText('Create dashboard').first().click();
        await page.getByLabel('Name your dashboard *').fill('Small');
        await page.getByText('Next', { exact: true }).click();
        await page.getByText('Create', { exact: true }).click();

        // Create chart within dashboard
        for (const addTile of await page
            .getByText('Add tile', { exact: true })
            .all()) {
            await addTile.click();
        }
        await page.getByText('New chart', { exact: true }).click();
        await expect(
            page.getByText('You are creating this chart from within "Small"', {
                exact: true,
            }),
        ).toBeAttached();
        await page.getByText('Payments', { exact: true }).click();
        await page.getByText('Payment method', { exact: true }).click();
        await page.getByText('Unique payment count', { exact: true }).click();
        await page.getByText('Save chart', { exact: true }).click();
        await page.getByTestId('ChartCreateModal/NameInput').clear();
        await page
            .getByTestId('ChartCreateModal/NameInput')
            .fill("What's the number of unique payments per payment method?");
        await page.getByText('Save', { exact: true }).click();

        await page.getByText('Save changes', { exact: true }).click();

        await expect(
            page.getByText('Dashboard was updated').first(),
        ).toBeAttached();

        await page.waitForTimeout(2000);

        // get the fourth button with class  mantine-ActionIcon-root
        await page.getByTestId('dashboard-header-menu').click();
        await page.getByText('Export dashboard').first().click();
        await page.getByText('Generate preview', { exact: true }).click();

        await expect(
            page.locator('div').filter({ hasText: 'Success' }).first(),
        ).toBeAttached({ timeout: 20_000 });
    });

    // todo: move to api/unit tests
    test.skip('Should access dashboard by slug instead of UUID', async ({
        page,
    }) => {
        // First, verify we can access via slug
        const slug = 'jaffle-dashboard';
        await page.goto(
            `/projects/${SEED_PROJECT.project_uuid}/dashboards/${slug}`,
        );

        // Verify the dashboard loads correctly
        const grid = page.locator('.react-grid-layout');
        await expect(
            grid.getByText("What's our total revenue to date?", {
                exact: true,
            }),
        ).toBeAttached();
        await expect(
            grid.getByText("What's the average spend per customer?", {
                exact: true,
            }),
        ).toBeAttached();

        await expect(
            page.getByText('Loading chart', { exact: true }),
        ).toHaveCount(0);

        // Verify URL contains the slug
        await expect(page).toHaveURL(new RegExp(`/dashboards/${slug}`));

        // Verify charts render
        await expect(page.locator('.echarts-for-react')).toHaveCount(3);
    });

    // todo: move to api/unit tests
    test.skip('Should maintain dashboard filters when using slug', async ({
        page,
    }) => {
        const slug = 'jaffle-dashboard';
        await page.goto(
            `/projects/${SEED_PROJECT.project_uuid}/dashboards/${slug}`,
        );

        await expect(
            page
                .locator('.react-grid-layout')
                .getByText('How much revenue')
                .first(),
        ).toBeAttached();

        await expect(
            page.getByText('Loading chart', { exact: true }),
        ).toHaveCount(0);

        // Add filter
        await addPaymentMethodFilterField(page);
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
            page.getByText('Payment method is credit_card').first(),
        ).toBeAttached();
    });

    // todo: move to api/unit tests
    test.skip('Should access dashboard via API using slug', async ({ api }) => {
        const slug = 'jaffle-dashboard';

        // Test API endpoint with slug
        const response = await api.get(`/api/v1/dashboards/${slug}`);
        expect(response.status()).toBe(200);
        const body = (await response.json()) as {
            status: string;
            results: {
                name: string;
                slug: string;
                uuid: string;
                tiles: unknown;
            };
        };
        expect(body.status).toBe('ok');
        expect(body.results.name).toBe('Jaffle dashboard');
        expect(body.results.slug).toBe(slug);
        expect(body.results.uuid).toBeDefined();
        expect(Array.isArray(body.results.tiles)).toBe(true);
    });

    // todo: move to api/unit tests
    test.skip('Should handle invalid dashboard slug gracefully', async ({
        page,
    }) => {
        await page.goto(
            `/projects/${SEED_PROJECT.project_uuid}/dashboards/non-existent-slug`,
        );

        // Should show an error message
        await expect(
            page.getByText('Dashboard not found').first(),
        ).toBeAttached();
    });
});
