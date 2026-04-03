import { SEED_PROJECT } from '@lightdash/common';
import { test, expect } from '../../fixtures';
import { scrollTreeToItem, getMonacoEditorText } from '../../helpers';

test.describe.skip('Table calculations', () => {
    // todo: move to unit test
    test.skip('I can create a quick table calculation (rank in column)', async ({
        adminPage: page,
    }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/tables/payments`);

        // Select metrics and dimensions
        await scrollTreeToItem(page, 'Payment method');
        await page.getByText('Payment method').click();
        await scrollTreeToItem(page, 'Total revenue');
        await page.getByText('Total revenue').click();

        // Select quick calculation
        await page.locator('thead').locator('.mantine-ActionIcon-root').nth(1).click();
        await page.getByText('Rank in column').click();

        // Show SQL
        await page.getByTestId('Results-card-expand').click(); // Close results
        await page.getByTestId('SQL-card-expand').click();

        const sqlLines = [
            `RANK() OVER ( ORDER BY "payments_total_revenue" ASC ) AS "rank_in_column_of_total_revenue"`,
            `FROM metrics`,
        ];
        const text = await getMonacoEditorText(page);
        for (const line of sqlLines) {
            expect(text).toContain(line);
        }
    });

    // todo: move to unit test
    test.skip('I can create a quick table calculation (running total)', async ({
        adminPage: page,
    }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/tables/payments`);

        // Select metrics and dimensions
        await scrollTreeToItem(page, 'Payment method');
        await page.getByText('Payment method').click();
        await scrollTreeToItem(page, 'Total revenue');
        await page.getByText('Total revenue').click();

        // Select quick calculation
        await page.locator('thead').locator('.mantine-ActionIcon-root').nth(1).click();
        await page.getByText('Running total').click();

        // Show SQL
        await page.getByTestId('Results-card-expand').click(); // Close results
        await page.getByTestId('SQL-card-expand').click();

        const sqlLines = [
            `SUM("payments_total_revenue") OVER ( ORDER BY "payments_payment_method" ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW )`,
            `AS "running_total_of_total_revenue"`,
            `FROM metrics`,
        ];
        const text = await getMonacoEditorText(page);
        for (const line of sqlLines) {
            expect(text).toContain(line);
        }
    });

    // todo: move to unit test
    test.skip('I can create a string table calculation', async ({
        adminPage: page,
    }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/tables/orders`);
        // Select metrics and dimensions
        await scrollTreeToItem(page, 'Order date');
        await page.getByText('Order date').click();
        await page.getByText('Month').click();
        await scrollTreeToItem(page, 'Total order amount');
        await page.getByText('Total order amount').click();

        await page.getByText('Table calculation').click();

        await page.locator('#ace-editor').fill(
            `'rank_' || RANK() OVER(ORDER BY \${orders.total_order_amount} ASC)`,
        );
        await page.locator(`.mantine-Select-input[value='number']`).click();
        await page.getByText('string').click();

        await page.getByPlaceholder('E.g. Cumulative order count').fill('Ranking');
        await page.locator('form').getByText('Create').click({ force: true });

        // Run query
        await page.getByRole('button', { name: 'Run query' }).click();

        // Check valid results
        await expect(page.getByText('rank_1')).toBeVisible();
        await expect(page.getByText('rank_2')).toBeVisible();

        // Add string filter
        await page.getByTestId('Filters-card-expand').click();
        await page.getByText('Add filter').click();
        await page.getByPlaceholder('Search field...').fill('Ranking');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');

        await expect(page.locator('.tabler-icon-abc')).toBeVisible(); // Check if the abc icon is present, which means the table calculation is a string type
        await page.locator(".mantine-Select-input[value='is']").click();
        await page.getByText('starts with').click(); // If the type is number, this option will not be available and it will fail when running the query

        await page.getByPlaceholder('Enter value(s)').fill('rank_1');
        await page.getByText('Add "rank_1"').click();

        // Run query
        await page.getByRole('button', { name: 'Run query' }).click();

        // Check valid results
        await expect(page.getByText('rank_1')).toBeVisible();
        await expect(page.getByText('rank_2')).toHaveCount(0);
    });

    // todo: move to unit test
    test.skip('I can create a number table calculation', async ({
        adminPage: page,
    }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/tables/orders`);
        // Select metrics and dimensions
        await scrollTreeToItem(page, 'Order date');
        await page.getByText('Order date').click();
        await page.getByText('Month').click();
        await scrollTreeToItem(page, 'Total order amount');
        await page.getByText('Total order amount').click();

        await page.getByText('Table calculation').click();

        await page.locator('#ace-editor').fill(
            `RANK() OVER(ORDER BY \${orders.total_order_amount} ASC) * 100`,
        );

        await page.getByPlaceholder('E.g. Cumulative order count').fill('Ranking');
        // Defaults to number
        await page.locator('form').getByText('Create').click({ force: true });

        // Run query
        await page.getByRole('button', { name: 'Run query' }).click();

        // Check valid results
        await expect(page.getByText('100')).toBeVisible();
        await expect(page.getByText('1500')).toBeVisible();
        await expect(page.getByText('1800')).toBeVisible();
        await expect(page.getByText('2000')).toBeVisible();

        // Add string filter
        await page.getByTestId('Filters-card-expand').click();
        await page.getByText('Add filter').click();
        await page.getByPlaceholder('Search field...').fill('Ranking');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');

        await expect(page.locator('.tabler-icon-123')).toBeVisible(); // Check if the 123 icon is present, which means the table calculation is a number type
        await page.locator(".mantine-Select-input[value='is']").click();
        await page.getByText('greater than').click(); // If the type is string, this option will not be available and it will fail when running the query

        await page.getByPlaceholder('Enter value(s)').clear();
        await page.getByPlaceholder('Enter value(s)').fill('2000');
        await page.waitForTimeout(350); // Wait for FilterNumberInput debounce (300ms) to complete
        await page.getByRole('button', { name: 'Run query' }).click();

        // Check valid results
        await expect(page.getByText('2200')).toBeVisible();
        await expect(page.getByText('1800')).toHaveCount(0);
    });
});
