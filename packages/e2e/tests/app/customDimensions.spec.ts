import { SEED_PROJECT } from '@lightdash/common';
import {
    expect,
    getMonacoEditorText,
    loginAs,
    runQuery,
    scrollTreeToItem,
    SEED_USERS,
    test,
    typeInAceEditor,
    type Page,
} from '../../support/test';

const showSql = async (page: Page) => {
    await page.getByTestId('Chart-card-expand').click(); // Close chart
    await page.getByTestId('Results-card-expand').click(); // Close results
    await page.getByTestId('SQL-card-expand').click();
};

const expectSqlToInclude = async (page: Page, sqlLines: string[]) => {
    for (const line of sqlLines) {
        expect(await getMonacoEditorText(page)).toContain(line);
    }
};

// todo: move to unit tests
test.describe.skip('Custom dimensions', () => {
    test.beforeEach(async ({ api }) => {
        await loginAs(api.raw, SEED_USERS.admin);
    });

    test('I can create a bin number', async ({ page }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/tables`);
        await page.getByText('Payments', { exact: true }).click();
        await (await scrollTreeToItem(page, 'Amount')).hover();
        await page.locator('span.mantine-NavLink-rightSection').nth(1).click();
        await page.getByText('Add custom dimensions', { exact: true }).click();

        await page
            .getByPlaceholder('Enter custom dimension label')
            .fill('amount range');
        await page.locator('.mantine-NumberInput-wrapper input').fill('5');

        await page.getByText('Create', { exact: true }).click();

        // Select metric
        await (await scrollTreeToItem(page, 'Orders')).click();
        // Select metric
        await (await scrollTreeToItem(page, 'Total order amount')).click();

        await runQuery(page);

        // Check valid results
        await expect(page.getByText('0 - 11').first()).toBeAttached();
        await expect(page.getByText('$679.94').first()).toBeAttached();
        await expect(page.getByText('11 - 22').first()).toBeAttached();
        await expect(page.getByText('$1,331.02').first()).toBeAttached();

        // Show SQL
        await showSql(page);

        await expectSqlToInclude(page, [
            `WITH amount_amount_range_cte AS (`,
            `FLOOR( (MAX("payments".amount) - MIN("payments".amount)) / 5 ) AS bin_width`,
            `WHEN "payments".amount >= amount_amount_range_cte.min_id + amount_amount_range_cte.bin_width * 0`,
            `ELSE ( amount_amount_range_cte.min_id + amount_amount_range_cte.bin_width * 4 || ' - ' || amount_amount_range_cte.max_id )`,
            `CROSS JOIN amount_amount_range_cte`,
            `GROUP BY 1`,
        ]);
    });

    test('I can create a custom SQL dimension number', async ({ page }) => {
        await page.goto(
            `/projects/${SEED_PROJECT.project_uuid}/tables/payments`,
        );
        await page.getByText('Add').first().click();

        await page
            .getByPlaceholder('Enter custom dimension label')
            .fill('random number');
        await typeInAceEditor(page, `random() + 1`);
        await page.locator(`.mantine-Select-input[value='String']`).click();
        await page.getByText('Number').first().click();
        await page.getByText('Create', { exact: true }).click();

        // Select metric
        await (await scrollTreeToItem(page, 'Total revenue')).click();

        await runQuery(page);

        // Show SQL
        await showSql(page);

        await expectSqlToInclude(page, [
            `(random() + 1) AS "random_number",`,
            `SUM("payments".amount) AS "payments_total_revenue"`,
            `GROUP BY 1`,
            `ORDER BY "payments_total_revenue" DESC`,
        ]);
    });

    test('I can create a custom SQL dimension string', async ({ page }) => {
        await page.goto(
            `/projects/${SEED_PROJECT.project_uuid}/tables/payments`,
        );
        await page.getByText('Add').first().click();

        await page
            .getByPlaceholder('Enter custom dimension label')
            .fill('payment method');
        // eslint-disable-next-line no-template-curly-in-string
        await typeInAceEditor(
            page,
            `'payment_' || \${payments.payment_method}`,
        );
        // Defaults to string
        await page.getByText('Create', { exact: true }).click();
        await expect(page.locator('#ace-editor')).toHaveCount(0);

        // Select metric
        await (await scrollTreeToItem(page, 'Total revenue')).click();

        await runQuery(page);

        // Check results
        await expect(
            page.getByText('payment_credit_card').first(),
        ).toBeAttached();
        await expect(page.getByText('1,452.16').first()).toBeAttached();
        // Show SQL
        await showSql(page);

        await expectSqlToInclude(page, [
            `('payment_' || ("payments".payment_method)) AS "payment_method",`,
            `SUM("payments".amount) AS "payments_total_revenue"`,
            `GROUP BY 1`,
            `ORDER BY "payments_total_revenue" DESC`,
        ]);
    });

    test('I can create a custom metric from a custom dimension', async ({
        page,
    }) => {
        await page.goto(
            `/projects/${SEED_PROJECT.project_uuid}/tables/payments`,
        );
        await page.getByText('Add').first().click();

        await page
            .getByPlaceholder('Enter custom dimension label')
            .fill('discounted amount');
        // eslint-disable-next-line no-template-curly-in-string
        await typeInAceEditor(page, `(\${orders.amount}) / 10`);
        await page.locator(`.mantine-Select-input[value='String']`).click();
        await page.getByText('Number').first().click();
        await page.getByText('Create', { exact: true }).click();

        // Create custom metric
        await page.locator('.tabler-icon-dots').click();
        await page.getByRole('menuitem', { name: 'Max' }).click();
        await page.getByRole('button', { name: 'Create' }).click();

        // Select dimension
        await (await scrollTreeToItem(page, 'Payment method')).click();
        // Select metric
        await (await scrollTreeToItem(page, 'Total revenue')).click();
        // Deselect custom dimension
        await (await scrollTreeToItem(page, 'discounted amount')).click();

        await runQuery(page);

        // Check results
        await expect(page.getByText('bank_transfer').first()).toBeAttached();
        await expect(page.getByText('6.9').first()).toBeAttached();
        // Show SQL
        await showSql(page);

        await expectSqlToInclude(page, [
            `"payments".payment_method AS "payments_payment_method",`,
            `MAX((("orders".amount)) / 10) AS "payments_discounted_amount_max_of_discounted_amount",`,
            `GROUP BY 1`,
            `ORDER BY "payments_payment_method"`,
        ]);

        // We deselected the custom dimension, it should not appear in the SQL
        expect(await getMonacoEditorText(page)).not.toContain(
            '"discounted_amount"',
        );
    });
});
