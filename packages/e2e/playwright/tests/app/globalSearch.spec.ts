import { SEED_PROJECT } from '@lightdash/common';
import { test, expect } from '../../fixtures';

test.describe('Global search', () => {
    test('Should search all result types', async ({ adminPage: page }) => {
        // Search requests are debounced, so take that into account when waiting for the search request to complete
        const SEARCHED_QUERIES = new Set<string>();

        async function search(query: string) {
            const hasPerformedSearch = SEARCHED_QUERIES.has(query);
            await page.getByRole('search').click();

            let searchResponsePromise: ReturnType<
                typeof page.waitForResponse
            > | null = null;
            if (!hasPerformedSearch) {
                SEARCHED_QUERIES.add(query);
                searchResponsePromise = page.waitForResponse(
                    (resp) => resp.url().includes('/search/'),
                );
            }

            await page
                .getByPlaceholder(/Search Jaffle shop/i)
                .clear();
            await page
                .getByPlaceholder(/Search Jaffle shop/i)
                .fill(query);

            if (searchResponsePromise) {
                await searchResponsePromise;
            }
        }

        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/home`);

        await expect(page.getByText('Search Jaffle shop')).toBeVisible();

        // search and select space
        await search('jaffle');
        await page
            .getByRole('dialog')
            .getByRole('menuitem', { name: 'Jaffle shop' })
            .scrollIntoViewIfNeeded();
        await page
            .getByRole('dialog')
            .getByRole('menuitem', { name: 'Jaffle shop' })
            .click();
        await expect(page).toHaveURL(
            new RegExp(
                `/projects/${SEED_PROJECT.project_uuid}/spaces/`,
            ),
        );
        await expect(page.getByText('Spaces')).toBeVisible();

        // search and select dashboard
        await search('jaffle');
        await page
            .getByRole('dialog')
            .getByRole('menuitem', { name: /Jaffle dashboard/ })
            .first()
            .scrollIntoViewIfNeeded();
        await page
            .getByRole('dialog')
            .getByRole('menuitem', { name: /Jaffle dashboard/ })
            .first()
            .click();
        await expect(page).toHaveURL(
            new RegExp(
                `/projects/${SEED_PROJECT.project_uuid}/dashboards/`,
            ),
        );
        await expect(page.getByText('Jaffle dashboard')).toBeVisible();

        // search and select saved chart
        await search('Which');
        await page
            .getByRole('dialog')
            .getByRole('menuitem', {
                name: /Which customers have not recently ordered an item/,
            })
            .scrollIntoViewIfNeeded();
        await page
            .getByRole('dialog')
            .getByRole('menuitem', {
                name: /Which customers have not recently ordered an item/,
            })
            .click();
        await expect(page).toHaveURL(
            new RegExp(
                `/projects/${SEED_PROJECT.project_uuid}/saved/`,
            ),
        );

        //  wait for table to render
        await expect(page.getByText('Customer id')).toHaveCount(1);

        // search and select table
        await search('Customers');
        await page
            .getByRole('dialog')
            .getByRole('menuitem', {
                name: /^Customers Table · # Customers/,
            })
            .scrollIntoViewIfNeeded();
        await page
            .getByRole('dialog')
            .getByRole('menuitem', {
                name: /^Customers Table · # Customers/,
            })
            .click();
        await expect(page).toHaveURL(
            new RegExp(
                `/projects/${SEED_PROJECT.project_uuid}/tables/customers`,
            ),
        );
        await expect(page.getByText('Customer id')).toBeVisible();

        // search and select field
        await search('Date of first order');
        await page
            .getByRole('dialog')
            .getByRole('menuitem', {
                name: 'Orders - Date of first order Metric · Min of Order date',
            })
            .scrollIntoViewIfNeeded();
        await page
            .getByRole('dialog')
            .getByRole('menuitem', {
                name: 'Orders - Date of first order Metric · Min of Order date',
            })
            .click();
        await expect(page).toHaveURL(
            new RegExp(
                `/projects/${SEED_PROJECT.project_uuid}/tables/orders\\?create_saved_chart_version`,
            ),
        );
    });
});
