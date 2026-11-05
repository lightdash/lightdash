import { SEED_PROJECT } from '@lightdash/common';
import { expect, loginAs, SEED_USERS, test } from '../../support/test';

test.describe('Dashboard List', () => {
    test.beforeEach(async ({ api }) => {
        await loginAs(api.raw, SEED_USERS.admin);
    });

    test('creates, renames, and deletes a dashboard', async ({ page }) => {
        const dashboardName = `e2e dashboard ${Date.now()}`;
        const renamedDashboardName = `${dashboardName} renamed`;

        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/dashboards`);
        await page.getByRole('button', { name: 'Create dashboard' }).click();
        await page.getByLabel('Name your dashboard *').fill(dashboardName);
        await page.getByLabel('Dashboard description').fill('Description');
        await page.getByRole('button', { name: 'Next' }).click();
        const createButton = page.getByRole('button', {
            name: 'Create',
            exact: true,
        });
        await expect(createButton).toBeEnabled();
        const createDashboard = page.waitForResponse(
            (response) =>
                response.request().method() === 'POST' &&
                /\/api\/v1\/projects\/[^/]+\/dashboards$/.test(
                    new URL(response.url()).pathname,
                ),
        );
        await createButton.click();
        expect((await createDashboard).status()).toBe(201);
        await expect(page).toHaveURL(
            /\/projects\/[^/]+\/dashboards\/[^/]+\/edit$/,
        );
        await expect(
            page.getByText(dashboardName, { exact: true }).first(),
        ).toBeAttached({ timeout: 30_000 });

        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/dashboards`);
        await page
            .locator('tr', { hasText: dashboardName })
            .getByRole('button')
            .click();
        await page.getByRole('menuitem', { name: 'Rename' }).click();
        await page.getByLabel('Name *').clear();
        await page.getByLabel('Name *').fill(renamedDashboardName);
        await page.getByRole('button', { name: 'Save' }).click();
        await expect(
            page.locator('tr', { hasText: renamedDashboardName }),
        ).toBeAttached();

        await page
            .locator('tr', { hasText: renamedDashboardName })
            .getByRole('button')
            .click();
        await page.getByRole('menuitem', { name: 'Delete dashboard' }).click();
        await page.getByRole('button', { name: 'Delete' }).click();
        await expect(
            page.locator('tr', { hasText: renamedDashboardName }),
        ).toHaveCount(0);
    });
});
