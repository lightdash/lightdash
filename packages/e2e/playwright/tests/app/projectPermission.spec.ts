import { SEED_PROJECT } from '@lightdash/common';
import { test, expect } from '../../fixtures';
import { loginWithPermissions } from '../../helpers';

// todo: move to api tests (or remove if already addressed in api tests)
test.describe.skip('Project Permissions', () => {
    test('Organization admin can see projects', async ({ adminPage: page }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/home`);
        await expect(page.getByTestId('settings-menu')).toBeVisible();
        await expect(page.getByText('Browse')).toBeVisible();
        await expect(page.getByText('Welcome, David')).toBeVisible();
    });

    test('Organization members without project permission cannot see projects', async ({
        adminPage: page,
    }) => {
        const email = await loginWithPermissions(page.request, 'member', []);

        // Create a new context logged in as the new user
        const context = await page.context().browser()!.newContext();
        const newPage = await context.newPage();
        const loginResp = await newPage.request.post('api/v1/login', {
            data: { email, password: 'test1234' },
        });
        expect(loginResp.status()).toBe(200);

        await newPage.goto(`/projects/${SEED_PROJECT.project_uuid}/home`);
        await expect(newPage.getByText("You don't have access")).toBeVisible();
        await context.close();
    });

    test('Organization members with project permission can see project', async ({
        adminPage: page,
    }) => {
        const email = await loginWithPermissions(page.request, 'member', [
            {
                role: 'editor',
                projectUuid: SEED_PROJECT.project_uuid,
            },
        ]);

        // Create a new context logged in as the new user
        const context = await page.context().browser()!.newContext();
        const newPage = await context.newPage();
        const loginResp = await newPage.request.post('api/v1/login', {
            data: { email, password: 'test1234' },
        });
        expect(loginResp.status()).toBe(200);

        await newPage.goto(`/projects/${SEED_PROJECT.project_uuid}/home`);
        await expect(newPage.getByTestId('settings-menu')).toHaveCount(0);
        await expect(newPage.getByText('Browse')).toBeVisible();
        await expect(newPage.getByText('Welcome, test')).toBeVisible();
        await context.close();
    });

    test('Organization editors without project permission can still see projects', async ({
        adminPage: page,
    }) => {
        const email = await loginWithPermissions(page.request, 'editor', []);

        // Create a new context logged in as the new user
        const context = await page.context().browser()!.newContext();
        const newPage = await context.newPage();
        const loginResp = await newPage.request.post('api/v1/login', {
            data: { email, password: 'test1234' },
        });
        expect(loginResp.status()).toBe(200);

        await newPage.goto(`/projects/${SEED_PROJECT.project_uuid}/home`);
        await expect(newPage.getByTestId('settings-menu')).toHaveCount(0);
        await expect(newPage.getByText('Browse')).toBeVisible();
        await expect(newPage.getByText('Welcome, test')).toBeVisible();
        await context.close();
    });

    test('Organization admins without project permission can still see projects', async ({
        adminPage: page,
    }) => {
        const email = await loginWithPermissions(page.request, 'admin', []);

        // Create a new context logged in as the new user
        const context = await page.context().browser()!.newContext();
        const newPage = await context.newPage();
        const loginResp = await newPage.request.post('api/v1/login', {
            data: { email, password: 'test1234' },
        });
        expect(loginResp.status()).toBe(200);

        await newPage.goto(`/projects/${SEED_PROJECT.project_uuid}/home`);
        await expect(newPage.getByTestId('settings-menu')).toBeVisible();
        await expect(newPage.getByText('Browse')).toBeVisible();
        await expect(newPage.getByText('Welcome, test')).toBeVisible();
        await context.close();
    });
});
