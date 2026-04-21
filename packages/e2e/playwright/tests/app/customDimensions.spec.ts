import { SEED_PROJECT } from '@lightdash/common';
import { expect, test } from '../../fixtures';
import { getMonacoEditorText, scrollTreeToItem } from '../../helpers';

// todo: move to unit tests
test.describe.skip('Custom dimensions', () => {
    test('I can create a bin number', async ({ adminPage: page }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/tables`);
        await page.getByText('Payments').click();
        await scrollTreeToItem(page, 'Amount');
        await page.getByText('Amount').hover();
        await page.locator('span.mantine-NavLink-rightSection').nth(1).click();
        await page.getByText('Add custom dimensions').click();

        await page
            .getByPlaceholder('Enter custom dimension label')
            .fill('amount range');
        await page
            .locator('.mantine-NumberInput-wrapper')
            .locator('input')
            .clear();
        await page
            .locator('.mantine-NumberInput-wrapper')
            .locator('input')
            .fill('5');

        await page.getByText('Create').click();

        // Select metric
        await scrollTreeToItem(page, 'Orders');
        await page.getByText('Orders').click();
        // Select metric
        await scrollTreeToItem(page, 'Total order amount');
        await page.getByText('Total order amount').click();

        await page.getByRole('button', { name: 'Run query' }).first().click();

        // Check valid results
        await expect(page.getByText('0 - 11')).toBeVisible();
        await expect(page.getByText('$679.94')).toBeVisible();
        await expect(page.getByText('11 - 22')).toBeVisible();
        await expect(page.getByText('$1,331.02')).toBeVisible();

        // Show SQL
        await page.getByTestId('Chart-card-expand').click(); // Close chart
        await page.getByTestId('Results-card-expand').click(); // Close results
        await page.getByTestId('SQL-card-expand').click();

        const sqlLines = [
            `WITH amount_amount_range_cte AS (`,
            `FLOOR( (MAX("payments".amount) - MIN("payments".amount)) / 5 ) AS bin_width`,
            `WHEN "payments".amount >= amount_amount_range_cte.min_id + amount_amount_range_cte.bin_width * 0`,
            `ELSE ( amount_amount_range_cte.min_id + amount_amount_range_cte.bin_width * 4 || ' - ' || amount_amount_range_cte.max_id )`,
            `CROSS JOIN amount_amount_range_cte`,
            `GROUP BY 1`,
        ];
        const text = await getMonacoEditorText(page);
        // eslint-disable-next-line no-restricted-syntax
        for (const line of sqlLines) {
            expect(text).toContain(line);
        }
    });

    test('I can create a custom SQL dimension number', async ({
        adminPage: page,
    }) => {
        await page.goto(
            `/projects/${SEED_PROJECT.project_uuid}/tables/payments`,
        );
        await page.getByText('Add').click();

        await page
            .getByPlaceholder('Enter custom dimension label')
            .fill('random number');
        await page.locator('#ace-editor').fill(`random() + 1`);
        await page.locator(`.mantine-Select-input[value='String']`).click();
        await page.getByText('Number').click();
        await page.getByText('Create').click();

        // Select metric
        await scrollTreeToItem(page, 'Total revenue');
        await page.getByText('Total revenue').click();

        await page.getByRole('button', { name: 'Run query' }).first().click();

        // Show SQL
        await page.getByTestId('Chart-card-expand').click(); // Close chart
        await page.getByTestId('Results-card-expand').click(); // Close results
        await page.getByTestId('SQL-card-expand').click();

        const sqlLines = [
            `(random() + 1) AS "random_number",`,
            `SUM("payments".amount) AS "payments_total_revenue"`,
            `GROUP BY 1`,
            `ORDER BY "payments_total_revenue" DESC`,
        ];
        const text = await getMonacoEditorText(page);
        // eslint-disable-next-line no-restricted-syntax
        for (const line of sqlLines) {
            expect(text).toContain(line);
        }
    });

    test('I can create a custom SQL dimension string', async ({
        adminPage: page,
    }) => {
        await page.goto(
            `/projects/${SEED_PROJECT.project_uuid}/tables/payments`,
        );
        await page.getByText('Add').click();

        await page
            .getByPlaceholder('Enter custom dimension label')
            .fill('payment method');
        await page
            .locator('#ace-editor')
            .fill(`'payment_' || \${payments.payment_method}`);
        // Defaults to string
        await page.getByText('Create').click();
        await expect(page.locator('#ace-editor')).toHaveCount(0);

        // Select metric
        await scrollTreeToItem(page, 'Total revenue');
        await page.getByText('Total revenue').click();

        await page.getByRole('button', { name: 'Run query' }).first().click();

        // Check results
        await expect(page.getByText('payment_credit_card')).toBeVisible();
        await expect(page.getByText('1,452.16')).toBeVisible();
        // Show SQL
        await page.getByTestId('Chart-card-expand').click(); // Close chart
        await page.getByTestId('Results-card-expand').click(); // Close results
        await page.getByTestId('SQL-card-expand').click();

        const sqlLines = [
            `('payment_' || ("payments".payment_method)) AS "payment_method",`,
            `SUM("payments".amount) AS "payments_total_revenue"`,
            `GROUP BY 1`,
            `ORDER BY "payments_total_revenue" DESC`,
        ];
        const text = await getMonacoEditorText(page);
        // eslint-disable-next-line no-restricted-syntax
        for (const line of sqlLines) {
            expect(text).toContain(line);
        }
    });

    test('I can create a custom metric from a custom dimension', async ({
        adminPage: page,
    }) => {
        await page.goto(
            `/projects/${SEED_PROJECT.project_uuid}/tables/payments`,
        );
        await page.getByText('Add').click();

        await page
            .getByPlaceholder('Enter custom dimension label')
            .fill('discounted amount');
        await page.locator('#ace-editor').fill(`(\${orders.amount}) / 10`);
        await page.locator(`.mantine-Select-input[value='String']`).click();
        await page.getByText('Number').click();
        await page.getByText('Create').click();

        // Create custom metric
        await page.locator('.tabler-icon-dots').click();
        await page.getByRole('menuitem', { name: 'Max' }).click();
        await page.getByRole('button', { name: 'Create' }).click();

        // Select dimension
        await scrollTreeToItem(page, 'Payment method');
        const treeContainer = page.getByTestId(
            'virtualized-tree-scroll-container',
        );
        await treeContainer.getByText('Payment method').click();

        // Select metric
        await scrollTreeToItem(page, 'Total revenue');
        await treeContainer.getByText('Total revenue').click();

        // Deselect custom dimension
        await scrollTreeToItem(page, 'discounted amount');
        await treeContainer.getByText('discounted amount').click();

        await page.getByRole('button', { name: 'Run query' }).first().click();

        // Check results
        await expect(page.getByText('bank_transfer')).toBeVisible();
        await expect(page.getByText('6.9')).toBeVisible();
        // Show SQL
        await page.getByTestId('Chart-card-expand').click(); // Close chart
        await page.getByTestId('Results-card-expand').click(); // Close results
        await page.getByTestId('SQL-card-expand').click();

        const sqlLines = [
            `"payments".payment_method AS "payments_payment_method",`,
            `MAX((("orders".amount)) / 10) AS "payments_discounted_amount_max_of_discounted_amount",`,
            `GROUP BY 1`,
            `ORDER BY "payments_payment_method"`,
        ];
        const text = await getMonacoEditorText(page);
        // eslint-disable-next-line no-restricted-syntax
        for (const line of sqlLines) {
            expect(text).toContain(line);
        }

        // We deselected the custom dimension, it should not appear in the SQL
        expect(text).not.toContain('"discounted_amount"');
    });
});
