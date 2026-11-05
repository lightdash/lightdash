import { expect, logout, SEED_USERS, test } from '../../support/test';

test.describe('Login', () => {
    test.beforeEach(async ({ api }) => {
        await logout(api.raw);
    });

    test('Should login successfully', async ({ page }) => {
        await page.goto('/login');
        await page
            .getByPlaceholder('Your email address')
            .fill(SEED_USERS.admin.email);
        await page.getByText('Continue').click();
        await page
            .getByPlaceholder('Your password')
            .fill(SEED_USERS.admin.password);
        await page.locator('[data-cy="signin-button"]').click();
        await expect(page).toHaveURL(/\/home/);
    });

    // todo: move to unit test
    test.skip('Should display error message when credentials are invalid or not recognised', async ({
        page,
    }) => {
        await page.goto('/login');
        await page.getByPlaceholder('Your email address').fill('test-email');
        await page.getByText('Continue').click();
        await expect(
            page.getByText('Email address is not valid'),
        ).toBeVisible();
        await page
            .getByPlaceholder('Your email address')
            .fill('test@email.com ');
        await page.getByText('Continue').click();
        await expect(
            page.getByText('Email address must not contain whitespaces'),
        ).toBeVisible();
        await page
            .getByPlaceholder('Your email address')
            .fill('test@emaill.com');
        await page.getByText('Continue').click();
        await page.getByPlaceholder('Your password').fill('test-password');
        await page.locator('[data-cy="signin-button"]').click();
        await expect(
            page.getByText('Email and password not recognized'),
        ).toBeVisible();
    });
});
