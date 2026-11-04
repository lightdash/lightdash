import { SEED_PROJECT } from '@lightdash/common';
import {
    expect,
    loginAs,
    loginWithPermissions,
    SEED_USERS,
    test,
} from '../../support/test';

// todo: move to api tests (or remove if already addressed in api tests)
test.describe.skip('Project Permissions', () => {
    test('Organization admin can see projects', async ({ page, api }) => {
        await loginAs(api.raw, SEED_USERS.admin);

        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/home`);
        await expect(page.getByTestId('settings-menu')).toBeAttached();
        await expect(page.getByText('Browse').first()).toBeVisible();
        await expect(page.getByText('Welcome, David')).toBeVisible();
    });

    test('Organization members without project permission cannot see projects', async ({
        page,
        api,
    }) => {
        await loginWithPermissions(api.raw, 'member', []);

        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/home`);
        await expect(page.getByText("You don't have access")).toBeVisible();
    });

    test('Organization members with project permission can see project', async ({
        page,
        api,
    }) => {
        await loginWithPermissions(api.raw, 'member', [
            {
                role: 'editor',
                projectUuid: SEED_PROJECT.project_uuid,
            },
        ]);

        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/home`);
        await expect(page.getByTestId('settings-menu')).toHaveCount(0);
        await expect(page.getByText('Browse').first()).toBeVisible();
        await expect(page.getByText('Welcome, test')).toBeVisible();
    });

    test('Organization editors without project permission can still see projects', async ({
        page,
        api,
    }) => {
        await loginWithPermissions(api.raw, 'editor', []);

        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/home`);
        await expect(page.getByTestId('settings-menu')).toHaveCount(0);
        await expect(page.getByText('Browse').first()).toBeVisible();
        await expect(page.getByText('Welcome, test')).toBeVisible();
    });

    test('Organization admins without project permission can still see projects', async ({
        page,
        api,
    }) => {
        await loginWithPermissions(api.raw, 'admin', []);

        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/home`);
        await expect(page.getByTestId('settings-menu')).toBeAttached();
        await expect(page.getByText('Browse').first()).toBeVisible();
        await expect(page.getByText('Welcome, test')).toBeVisible();
    });
});
