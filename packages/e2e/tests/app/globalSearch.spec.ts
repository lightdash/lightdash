import { SEED_PROJECT } from '@lightdash/common';
import { expect, loginAs, SEED_USERS, test } from '../../support/test';

test.describe('Global search', () => {
    test.beforeEach(async ({ api }) => {
        await loginAs(api.raw, SEED_USERS.admin);
    });

    test('Should search all result types', async ({ page }) => {
        // Search requests are debounced, so take that into account when waiting for the search request to complete
        const SEARCHED_QUERIES = new Set<string>();

        const search = async (query: string) => {
            const hasPerformedSearch = SEARCHED_QUERIES.has(query);
            await page.getByRole('search').click();

            const searchResponse = hasPerformedSearch
                ? null
                : page.waitForResponse('**/search/**');
            SEARCHED_QUERIES.add(query);

            await page.getByPlaceholder(/Search Jaffle shop/i).fill(query);

            if (searchResponse) await searchResponse;
        };
        const menuItem = (name: string | RegExp) =>
            page.getByRole('dialog').getByRole('menuitem', {
                name,
                exact: typeof name === 'string',
            });

        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/home`);

        await expect(page.getByRole('search')).toBeVisible();
        await expect(page.getByRole('search')).toContainText('Search');
        // search and select space
        await search('jaffle');
        await menuItem('Jaffle shop').click();
        await expect(page).toHaveURL(/\/projects\/[^/]+\/spaces\//);
        await expect(page.getByText('Spaces').first()).toBeVisible();

        // search and select dashboard
        await search('jaffle');
        await menuItem(/Jaffle dashboard/)
            .first()
            .click();
        await expect(page).toHaveURL(/\/projects\/[^/]+\/dashboards\//);
        await expect(page.getByText('Jaffle dashboard').first()).toBeVisible();

        // search and select saved chart
        await search('Which');
        await menuItem(
            /Which customers have not recently ordered an item/,
        ).click();
        await expect(page).toHaveURL(/\/projects\/[^/]+\/saved\//);

        //  wait for table to render
        await expect(
            page.getByText('Customer id', { exact: true }),
        ).toHaveCount(1);

        // search and select table
        await search('Customers');
        await menuItem(/^Customers Table · # Customers/).click();
        await expect(page).toHaveURL(
            new RegExp(
                `/projects/${SEED_PROJECT.project_uuid}/tables/customers`,
            ),
        );
        await expect(page.getByText('Customer id').first()).toBeVisible();

        // search and select field
        await search('Date of first order');
        await menuItem(
            'Orders - Date of first order Metric · Min of Order date',
        ).click();
        await expect(page).toHaveURL(
            new RegExp(
                `/projects/${SEED_PROJECT.project_uuid}/tables/orders\\?create_saved_chart_version`,
            ),
        );
    });
});
