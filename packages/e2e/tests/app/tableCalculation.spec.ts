import { SEED_PROJECT } from '@lightdash/common';
import {
    expect,
    getMonacoEditorText,
    loginAs,
    scrollTreeToItem,
    SEED_USERS,
    test,
} from '../../support/test';

test.describe.skip('Table calculations', () => {
    test.beforeEach(async ({ api }) => {
        await loginAs(api.raw, SEED_USERS.admin);
    });

    // todo: move to unit test
    test.skip('I can create a quick table calculation (rank in column)', async ({
        page,
    }) => {
        await page.goto(
            `/projects/${SEED_PROJECT.project_uuid}/tables/payments`,
        );

        // Select metrics and dimensions
        await (await scrollTreeToItem(page, 'Payment method')).click();
        await (await scrollTreeToItem(page, 'Total revenue')).click();

        // Select quick calculation
        await page.locator('thead .mantine-ActionIcon-root').nth(1).click();
        await page.getByText('Rank in column').click();

        // Show SQL
        await page.getByTestId('Results-card-expand').click(); // Close results
        await page.getByTestId('SQL-card-expand').click();

        const sqlLines = [
            `RANK() OVER ( ORDER BY "payments_total_revenue" ASC ) AS "rank_in_column_of_total_revenue"`,
            `FROM metrics`,
        ];
        for (const line of sqlLines) {
            await expect.poll(() => getMonacoEditorText(page)).toContain(line);
        }
    });

    // todo: move to unit test
    test.skip('I can create a quick table calculation (running total)', async ({
        page,
    }) => {
        await page.goto(
            `/projects/${SEED_PROJECT.project_uuid}/tables/payments`,
        );

        // Select metrics and dimensions
        await (await scrollTreeToItem(page, 'Payment method')).click();
        await (await scrollTreeToItem(page, 'Total revenue')).click();

        // Select quick calculation
        await page.locator('thead .mantine-ActionIcon-root').nth(1).click();
        await page.getByText('Running total').click();

        // Show SQL
        await page.getByTestId('Results-card-expand').click(); // Close results
        await page.getByTestId('SQL-card-expand').click();

        const sqlLines = [
            `SUM("payments_total_revenue") OVER ( ORDER BY "payments_payment_method" ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW )`,
            `AS "running_total_of_total_revenue"`,
            `FROM metrics`,
        ];
        for (const line of sqlLines) {
            await expect.poll(() => getMonacoEditorText(page)).toContain(line);
        }
    });

    // todo: move to unit test
    test.skip('I can create a string table calculation', async ({ page }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/tables/orders`);
        // Select metrics and dimensions
        await (await scrollTreeToItem(page, 'Order date')).click();
        await page.getByText('Month').first().click();
        await (await scrollTreeToItem(page, 'Total order amount')).click();

        await page.getByText('Table calculation', { exact: true }).click();

        await page.locator('#ace-editor').click();
        await page.keyboard.type(
            `'rank_' || RANK() OVER(ORDER BY \${orders.total_order_amount} ASC)`,
        );
        await page.locator(`.mantine-Select-input[value='number']`).click();
        await page.getByText('string').click();

        await page
            .getByPlaceholder('E.g. Cumulative order count')
            .fill('Ranking');
        await page.locator('form').getByText('Create').click({ force: true });

        // Run query
        const runQuery = page
            .getByRole('button', { name: 'Run query' })
            .first();
        await runQuery.click();

        // Check valid results
        await expect(page.getByText('rank_1').first()).toBeVisible();
        await expect(page.getByText('rank_2').first()).toBeVisible();

        // Add string filter
        await page.getByTestId('Filters-card-expand').click();
        await page.getByText('Add filter').click();
        const searchField = page.getByPlaceholder('Search field...');
        await searchField.fill('Ranking');
        await searchField.press('ArrowDown');
        await searchField.press('Enter');

        await expect(page.locator('.tabler-icon-abc').first()).toBeAttached(); // Check if the abc icon is present, which means the table calculation is a string type
        await page.locator(".mantine-Select-input[value='is']").click();
        await page.getByText('starts with').click(); // If the type is number, this option will not be available and it will fail when running the query

        await page.getByPlaceholder('Enter value(s)').fill('rank_1');
        await page.getByText('Add "rank_1"').click();

        // Run query
        await runQuery.click();

        // Check valid results
        await expect(page.getByText('rank_1').first()).toBeVisible();
        await expect(page.getByText('rank_2')).toHaveCount(0);
    });

    // todo: move to unit test
    test.skip('I can create a number table calculation', async ({ page }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/tables/orders`);
        // Select metrics and dimensions
        await (await scrollTreeToItem(page, 'Order date')).click();
        await page.getByText('Month').first().click();
        await (await scrollTreeToItem(page, 'Total order amount')).click();

        await page.getByText('Table calculation', { exact: true }).click();

        await page.locator('#ace-editor').click();
        await page.keyboard.type(
            `RANK() OVER(ORDER BY \${orders.total_order_amount} ASC) * 100`,
        );

        await page
            .getByPlaceholder('E.g. Cumulative order count')
            .fill('Ranking');
        // Defaults to number
        await page.locator('form').getByText('Create').click({ force: true });

        // Run query
        const runQuery = page
            .getByRole('button', { name: 'Run query' })
            .first();
        await runQuery.click();

        // Check valid results
        await expect(page.getByText('100').first()).toBeVisible();
        await expect(page.getByText('1500').first()).toBeVisible();
        await expect(page.getByText('1800').first()).toBeVisible();
        await expect(page.getByText('2000').first()).toBeVisible();

        // Add string filter
        await page.getByTestId('Filters-card-expand').click();
        await page.getByText('Add filter').click();
        const searchField = page.getByPlaceholder('Search field...');
        await searchField.fill('Ranking');
        await searchField.press('ArrowDown');
        await searchField.press('Enter');

        await expect(page.locator('.tabler-icon-123').first()).toBeAttached(); // Check if the 123 icon is present, which means the table calculation is a number type
        await page.locator(".mantine-Select-input[value='is']").click();
        await page.getByText('greater than').click(); // If the type is string, this option will not be available and it will fail when running the query

        await page.getByPlaceholder('Enter value(s)').fill('2000');
        await page.waitForTimeout(350); // Wait for FilterNumberInput debounce (300ms) to complete
        await runQuery.click();

        // Check valid results`
        await expect(page.getByText('2200').first()).toBeVisible();
        await expect(page.getByText('1800')).toHaveCount(0);
    });
});
