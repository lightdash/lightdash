import {
    SEED_ORG_1_ADMIN_EMAIL,
    SEED_ORG_1_ADMIN_PASSWORD,
} from '@lightdash/common';
import { expect, test } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

test('admin can sign in through the login form', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email address').fill(SEED_ORG_1_ADMIN_EMAIL.email);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel('Password').fill(SEED_ORG_1_ADMIN_PASSWORD.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    await expect(page).toHaveURL(/\/home(?:[/?#]|$)/);
});
