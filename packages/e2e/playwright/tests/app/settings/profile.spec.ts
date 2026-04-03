import { SEED_ORG_1_ADMIN, SEED_ORG_1_ADMIN_EMAIL } from '@lightdash/common';
import { test, expect } from '../../../fixtures';
import type { APIRequestContext } from '@playwright/test';

async function resetUserName(request: APIRequestContext) {
    await request.patch('api/v1/user/me', {
        data: {
            firstName: SEED_ORG_1_ADMIN.first_name,
            lastName: SEED_ORG_1_ADMIN.last_name,
            email: SEED_ORG_1_ADMIN_EMAIL.email,
        },
    });
}

test.describe('Settings - Profile', () => {
    test.beforeEach(async ({ adminPage: page }) => {
        await resetUserName(page.request);
    });

    test.afterEach(async ({ adminPage: page }) => {
        await resetUserName(page.request);
    });

    test('should update user names', async ({ adminPage: page }) => {
        await page.goto('/');
        await page.getByTestId('user-avatar').click();
        await page.getByRole('menuitem', { name: 'User settings' }).click();

        await expect(page.getByPlaceholder('Email')).not.toBeDisabled();
        await expect(page.getByPlaceholder('Email')).toHaveValue(
            SEED_ORG_1_ADMIN_EMAIL.email,
        );

        await page.waitForTimeout(500);
        const firstNameInput = page.getByPlaceholder('First name');
        await expect(firstNameInput).not.toBeDisabled();
        await expect(firstNameInput).toHaveValue(SEED_ORG_1_ADMIN.first_name);
        await firstNameInput.click();
        await firstNameInput.clear();
        await firstNameInput.fill('Kevin');
        await firstNameInput.blur();

        await page.waitForTimeout(500);
        const lastNameInput = page.getByPlaceholder('Last name');
        await expect(lastNameInput).not.toBeDisabled();
        await expect(lastNameInput).toHaveValue(SEED_ORG_1_ADMIN.last_name);
        await lastNameInput.click();
        await lastNameInput.clear();
        await lastNameInput.fill('Space');
        await lastNameInput.blur();

        await page.waitForTimeout(500);

        await page.getByRole('button', { name: 'Update' }).click();

        await expect(
            page.getByText('Success! User details were updated.'),
        ).toBeVisible();

        await page.goto('/');
        await expect(page.getByTestId('user-avatar')).toContainText('KS');
    });
});
