import {
    SEED_ORG_1_ADMIN_EMAIL,
    SEED_ORG_1_ADMIN_PASSWORD,
} from '@lightdash/common';
import { expect, test } from '../../fixtures';
import { logout } from '../../helpers';

test.describe('Login', () => {
    test('Should login successfully', async ({ adminPage: page }) => {
        await logout(page);
        await page.goto('/login');
        await page
            .getByPlaceholder('Your email address')
            .fill(SEED_ORG_1_ADMIN_EMAIL.email);
        await page.getByText('Continue').click();
        await page
            .getByPlaceholder('Your password')
            .fill(SEED_ORG_1_ADMIN_PASSWORD.password);
        await page.locator('[data-cy="signin-button"]').click();
        await expect(page).toHaveURL(/\/home/);
    });

    // todo: move to unit test
    test.skip('Should display error message when credentials are invalid or not recognised', async ({
        adminPage: page,
    }) => {
        await logout(page);
        await page.goto('/login');
        await page.getByPlaceholder('Your email address').fill('test-email');
        await page.getByText('Continue').click();
        await expect(
            page.getByText('Email address is not valid'),
        ).toBeVisible();
        await page.getByPlaceholder('Your email address').clear();
        await page
            .getByPlaceholder('Your email address')
            .fill('test@email.com ');
        await page.getByText('Continue').click();
        await expect(
            page.getByText('Email address must not contain whitespaces'),
        ).toBeVisible();
        await page.getByPlaceholder('Your email address').clear();
        await page
            .getByPlaceholder('Your email address')
            .fill('test@emaill.com');
        await page.getByText('Continue').click();
        await page.getByPlaceholder('Your password').clear();
        await page.getByPlaceholder('Your password').fill('test-password');
        await page.locator('[data-cy="signin-button"]').click();
        await expect(
            page.getByText('Email and password not recognized'),
        ).toBeVisible();
    });
});
