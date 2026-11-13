import { SCREENSHOT_READY_INDICATOR_ID } from '@lightdash/common';
import {
    createComposerDashboard,
    deleteComposerDashboard,
    expect,
    loginAs,
    SEED_USERS,
    test,
    type ComposerDashboard,
} from '../../support/test';

test.describe('Composer charts on dashboards', () => {
    let composer: ComposerDashboard | null = null;

    test.beforeEach(async ({ api }) => {
        await loginAs(api.raw, SEED_USERS.admin);
        composer = await createComposerDashboard(api);
    });

    test.afterEach(async ({ api }) => {
        if (composer)
            await deleteComposerDashboard(api, composer.dashboard.uuid);
        composer = null;
    });

    test('shows the composer tile on the dashboard', async ({ page }) => {
        const { dashboard } = composer!;
        await page.goto(
            `/projects/${dashboard.projectUuid}/dashboards/${dashboard.uuid}/view`,
        );

        await expect(page.getByText('Orders', { exact: true })).toBeVisible();
        await expect(
            page.getByTestId('composer-chart-not-available'),
        ).toBeVisible();
    });

    test('shows the composer tile on the minimal page', async ({ page }) => {
        const { dashboard } = composer!;
        await page.goto(
            `/minimal/projects/${dashboard.projectUuid}/dashboards/${dashboard.uuid}`,
        );

        await expect(
            page.locator(`#${SCREENSHOT_READY_INDICATOR_ID}`),
        ).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
        await expect(
            page.getByTestId('composer-chart-not-available'),
        ).toBeVisible();
    });
});
