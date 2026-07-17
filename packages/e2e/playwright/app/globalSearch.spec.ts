import { SEED_PROJECT } from '@lightdash/common';
import { expect, test } from '@playwright/test';

test('admin can search all result types', async ({ page }) => {
    const search = async (query: string) => {
        await page.getByRole('search').click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await dialog.getByPlaceholder(/Search Jaffle shop/i).fill(query);
        return dialog;
    };

    await page.goto(`/projects/${SEED_PROJECT.project_uuid}/home`);
    await expect(page.getByText('Search Jaffle shop')).toBeVisible();

    const spaceResults = await search('jaffle');
    await spaceResults
        .getByRole('menuitem', { name: 'Jaffle shop', exact: true })
        .click();
    await expect(page).toHaveURL(
        new RegExp(`/projects/${SEED_PROJECT.project_uuid}/spaces/`),
    );
    await expect(
        page.getByText('Spaces', { exact: true }).first(),
    ).toBeVisible();

    const dashboardResults = await search('jaffle');
    await dashboardResults
        .getByRole('menuitem', { name: /Jaffle dashboard/ })
        .first()
        .click();
    await expect(page).toHaveURL(
        new RegExp(`/projects/${SEED_PROJECT.project_uuid}/dashboards/`),
    );
    await expect(
        page.getByText('Jaffle dashboard', { exact: true }).first(),
    ).toBeVisible();

    const chartResults = await search('Which');
    await chartResults
        .getByRole('menuitem', {
            name: /Which customers have not recently ordered an item/,
        })
        .click();
    await expect(page).toHaveURL(
        new RegExp(`/projects/${SEED_PROJECT.project_uuid}/saved/`),
    );
    await expect(page.getByText('Customer id', { exact: true })).toHaveCount(1);

    const tableResults = await search('Customers');
    await tableResults
        .getByRole('menuitem', {
            name: /^Customers Table · # Customers/,
        })
        .click();
    await expect(page).toHaveURL(
        new RegExp(`/projects/${SEED_PROJECT.project_uuid}/tables/customers`),
    );
    await expect(
        page.getByText('Customer id', { exact: true }).first(),
    ).toBeVisible();

    const fieldResults = await search('Date of first order');
    await fieldResults
        .getByRole('menuitem', {
            name: 'Orders - Date of first order Metric · Min of Order date',
            exact: true,
        })
        .click();
    await expect(page).toHaveURL(
        (url) =>
            url.pathname ===
                `/projects/${SEED_PROJECT.project_uuid}/tables/orders` &&
            url.searchParams.has('create_saved_chart_version'),
    );
});
