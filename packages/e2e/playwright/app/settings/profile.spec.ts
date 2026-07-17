import { SEED_ORG_1_ADMIN, SEED_ORG_1_ADMIN_EMAIL } from '@lightdash/common';
import { expect, test, type APIRequestContext } from '@playwright/test';

const resetUserName = async (request: APIRequestContext) => {
    const response = await request.patch('/api/v1/user/me', {
        data: {
            firstName: SEED_ORG_1_ADMIN.first_name,
            lastName: SEED_ORG_1_ADMIN.last_name,
            email: SEED_ORG_1_ADMIN_EMAIL.email,
        },
    });

    await expect(response).toBeOK();
};

test.describe('Settings - Profile', { tag: '@mutating' }, () => {
    test.beforeEach(async ({ request }) => {
        await resetUserName(request);
    });

    test.afterEach(async ({ request }) => {
        await resetUserName(request);
    });

    test('should update user names', async ({ page }) => {
        await page.goto('/');
        await page.getByTestId('user-avatar').click();
        await page
            .getByRole('menuitem', { name: 'User settings', exact: true })
            .click();

        await expect(page).toHaveURL(/\/generalSettings\/profile$/);

        const emailInput = page.getByRole('textbox', {
            name: 'Email',
            exact: true,
        });
        const firstNameInput = page.getByRole('textbox', {
            name: 'First name',
            exact: true,
        });
        const lastNameInput = page.getByRole('textbox', {
            name: 'Last name',
            exact: true,
        });

        await expect(emailInput).toBeEnabled();
        await expect(emailInput).toHaveValue(SEED_ORG_1_ADMIN_EMAIL.email);
        await expect(firstNameInput).toBeEnabled();
        await expect(firstNameInput).toHaveValue(SEED_ORG_1_ADMIN.first_name);
        await expect(lastNameInput).toBeEnabled();
        await expect(lastNameInput).toHaveValue(SEED_ORG_1_ADMIN.last_name);

        await firstNameInput.fill('Kevin');
        await lastNameInput.fill('Space');

        const updateButton = page.getByRole('button', {
            name: 'Update',
            exact: true,
        });
        await expect(updateButton).toBeEnabled();

        const updateResponsePromise = page.waitForResponse(
            (response) =>
                response.request().method() === 'PATCH' &&
                new URL(response.url()).pathname === '/api/v1/user/me',
        );
        await updateButton.click();
        expect((await updateResponsePromise).ok()).toBe(true);

        await expect(
            page.getByText('Success! User details were updated.', {
                exact: true,
            }),
        ).toBeVisible();

        await page.goto('/');
        await expect(page.getByTestId('user-avatar')).toContainText('KS');
    });
});
