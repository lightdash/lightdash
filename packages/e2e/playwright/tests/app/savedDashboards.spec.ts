import { SEED_PROJECT } from '@lightdash/common';
import { expect, test } from '../../fixtures';

// todo: combine into 1 test
test.describe('Dashboard List', () => {
    // Skip: Flaky in preview environments - menu navigation timing issues
    test.skip('Should display dashboards', async ({ adminPage: page }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/home`);
        await page.getByRole('button', { name: 'Browse' }).click();
        await page.getByRole('menuitem', { name: 'All dashboards' }).click();
        await expect(page.getByText('Jaffle dashboard')).toBeVisible();
    });

    test('Should create a new dashboard', async ({ adminPage: page }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/home`);
        await page.getByRole('button', { name: 'Browse' }).click();
        await page.getByRole('menuitem', { name: 'All dashboards' }).click();
        await page.getByRole('button', { name: 'Create dashboard' }).click();

        await page
            .getByLabel('Name your dashboard *')
            .fill('Untitled dashboard');
        await page.getByLabel('Dashboard description').fill('Description');
        await page.getByRole('button', { name: 'Next' }).click();
        await page.getByRole('button', { name: 'Create', exact: true }).click();

        await expect(page).toHaveURL(
            /.*\/projects\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\/dashboards\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/,
        );
        await expect(page.getByText('Untitled dashboard')).toBeVisible();
    });

    test('Should update dashboards', async ({ adminPage: page }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/home`);
        await page.getByRole('button', { name: 'Browse' }).click();
        await page.getByRole('menuitem', { name: 'All dashboards' }).click();
        // open actions menu
        await page
            .locator('tr')
            .filter({ hasText: 'Untitled dashboard' })
            .locator('button')
            .click();
        // click on rename
        await page.getByRole('menuitem', { name: 'Rename' }).click();
        await page.getByLabel('Name *').clear();
        await page.getByLabel('Name *').fill('e2e dashboard');
        // click on save
        await page.getByRole('button', { name: 'Save' }).click();

        // verify dashboard name has been updated in the list
        await expect(page.getByText('e2e dashboard')).toBeVisible();
    });

    test('Should delete dashboards', async ({ adminPage: page }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/home`);
        await page.getByRole('button', { name: 'Browse' }).click();
        await page.getByRole('menuitem', { name: 'All dashboards' }).click();
        // open actions menu
        await page
            .locator('tr')
            .filter({ hasText: 'e2e dashboard' })
            .locator('button')
            .click();
        // click on delete
        await page.getByRole('menuitem', { name: 'Delete dashboard' }).click();
        // click on delete in the popup
        await page.getByRole('button', { name: 'Delete' }).click();
        // We technically should look for one, but we don't reset the DB before tests
        // It looks like we have multiple Jaffle Dashboards in CI
        await expect(page.getByText('Jaffle dashboard')).toBeVisible(); // still exists
    });
});
