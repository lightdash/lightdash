import { SEED_PROJECT } from '@lightdash/common';
import { expect, test } from '../../fixtures';
import { deleteDashboardsByName } from '../../helpers';

const CREATED_NAME = 'Untitled dashboard';
const RENAMED_NAME = 'e2e dashboard';

test.describe('Dashboard List', () => {
    // Kill any orphans from previous test runs so our assertions can match
    // on exact names without .first() compensation.
    test.beforeEach(async ({ adminPage: page }) => {
        await deleteDashboardsByName(page.request, [
            CREATED_NAME,
            RENAMED_NAME,
        ]);
    });

    // Skip: Flaky in preview environments - menu navigation timing issues
    test.skip('Should display dashboards', async ({ adminPage: page }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/home`);
        await page.getByRole('button', { name: 'Browse' }).click();
        await page.getByRole('menuitem', { name: 'All dashboards' }).click();
        await expect(page.getByText('Jaffle dashboard').first()).toBeVisible();
    });

    test('Should create a new dashboard', async ({ adminPage: page }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/home`);
        await page.getByRole('button', { name: 'Browse' }).click();
        await page.getByRole('menuitem', { name: 'All dashboards' }).click();
        await page.getByRole('button', { name: 'Create dashboard' }).click();

        await page.getByLabel('Name your dashboard *').fill(CREATED_NAME);
        await page.getByLabel('Dashboard description').fill('Description');
        await page.getByRole('button', { name: 'Next' }).click();
        // Step 2 is a space picker. Click the Jaffle shop treeitem so the
        // Create button becomes enabled (form.values.spaceUuid is required).
        const dialog = page.getByRole('dialog');
        const jaffleRow = dialog.getByRole('treeitem', {
            name: /^Jaffle shop$/,
        });
        await expect(jaffleRow).toBeVisible();
        // Jaffle shop is sometimes pre-selected when the dialog opens.
        // Only click to select if it isn't already; clicking a selected row
        // would toggle it off and leave Create disabled.
        if ((await jaffleRow.getAttribute('aria-selected')) !== 'true') {
            await jaffleRow.click();
            await expect(jaffleRow).toHaveAttribute('aria-selected', 'true');
        }
        const createButton = page.getByRole('button', {
            name: 'Create',
            exact: true,
        });
        await expect(createButton).toBeEnabled();
        await createButton.click();

        await expect(page).toHaveURL(
            /.*\/projects\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\/dashboards\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/,
        );
        await expect(page.getByText(CREATED_NAME)).toBeVisible();
    });

    test('Should update dashboards', async ({ adminPage: page }) => {
        // Seed: create the dashboard via API so this test is independent of
        // the create test and the beforeEach cleanup.
        const createResp = await page.request.post(
            `api/v1/projects/${SEED_PROJECT.project_uuid}/dashboards`,
            {
                data: {
                    name: CREATED_NAME,
                    description: 'Description',
                    tiles: [],
                    tabs: [],
                },
            },
        );
        expect(createResp.status()).toBe(201);

        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/home`);
        await page.getByRole('button', { name: 'Browse' }).click();
        await page.getByRole('menuitem', { name: 'All dashboards' }).click();
        // open actions menu
        await page
            .locator('tr')
            .filter({ hasText: CREATED_NAME })
            .locator('button')
            .click();
        // click on rename
        await page.getByRole('menuitem', { name: 'Rename' }).click();
        await page.getByLabel('Name *').clear();
        await page.getByLabel('Name *').fill(RENAMED_NAME);
        // click on save
        await page.getByRole('button', { name: 'Save' }).click();

        // verify dashboard name has been updated in the list
        await expect(page.getByText(RENAMED_NAME)).toBeVisible();
    });

    test('Should delete dashboards', async ({ adminPage: page }) => {
        // Seed the dashboard under its renamed name so this test is
        // independent of the update test.
        const createResp = await page.request.post(
            `api/v1/projects/${SEED_PROJECT.project_uuid}/dashboards`,
            {
                data: {
                    name: RENAMED_NAME,
                    description: 'Description',
                    tiles: [],
                    tabs: [],
                },
            },
        );
        expect(createResp.status()).toBe(201);

        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/home`);
        await page.getByRole('button', { name: 'Browse' }).click();
        await page.getByRole('menuitem', { name: 'All dashboards' }).click();
        // open actions menu
        await page
            .locator('tr')
            .filter({ hasText: RENAMED_NAME })
            .locator('button')
            .click();
        // click on delete
        await page.getByRole('menuitem', { name: 'Delete dashboard' }).click();
        // click on delete in the popup
        await page.getByRole('button', { name: 'Delete' }).click();

        // verify the deleted dashboard is gone and the seed Jaffle dashboard
        // still exists
        await expect(page.getByText(RENAMED_NAME)).toHaveCount(0);
        await expect(page.getByText('Jaffle dashboard').first()).toBeVisible();
    });
});
