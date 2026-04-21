import { expect, test } from '../../../fixtures';
import { logout } from '../../../helpers';

test.describe('Settings - Invites', () => {
    test('Should invite user', async ({ adminPage: page }) => {
        await page.goto('/');
        await page.getByTestId('settings-menu').first().click();
        await page
            .getByRole('menuitem', { name: 'Organization settings' })
            .click();

        await page.getByText('Users & groups').click();
        await page
            .getByRole('button', { name: 'Add user' })
            .scrollIntoViewIfNeeded();
        await page
            .getByRole('button', { name: 'Add user' })
            .click({ force: true });
        await page
            .getByLabel('Enter user email address *')
            .fill('demo+marygreen@lightdash.com');
        await page.getByText(/(Generate|Send) invite/).click();

        const inviteLinkInput = page.locator('#invite-link-input');
        const value = await inviteLinkInput.inputValue();

        await logout(page);
        await page.goto(value);

        await expect(page.locator('[data-cy="welcome-user"]')).toBeVisible();
        await page.getByRole('button', { name: 'Join your team' }).click();
        await page.getByPlaceholder('Your first name').fill('Mary');
        await page.getByPlaceholder('Your last name').fill('Green');
        await expect(
            page.locator('[data-cy="email-address-input"]'),
        ).toBeDisabled();
        await expect(
            page.locator('[data-cy="email-address-input"]'),
        ).toHaveValue('demo+marygreen@lightdash.com');
        await page.getByPlaceholder('Your password').fill('PasswordMary1');
        await page.getByPlaceholder('Your password').blur();
        await page.locator('[data-cy="signup-button"]').click();

        // Mantine PinInput doesn't respond to `fill()` — it only updates its
        // internal state via keyboard events. Focus the first slot and type
        // the OTP (PR/DEV mode accepts "000000").
        const pinInputs = page.getByTestId('pin-input').locator('input');
        await pinInputs.first().focus();
        await page.keyboard.type('000000');

        await page.getByRole('button', { name: 'Submit' }).click();
        await page.getByRole('button', { name: 'Continue' }).click();
        await expect(page.getByTestId('user-avatar')).toContainText('MG');
    });

    test('Should delete user', async ({ adminPage: page }) => {
        await page.goto('/');
        await page.getByTestId('settings-menu').first().click();
        await page
            .getByRole('menuitem', { name: 'Organization settings' })
            .click();

        await page.getByText('Users & groups').click();
        await page.getByTestId('org-users-search-input').clear();
        await page.getByTestId('org-users-search-input').fill('marygreen');
        await page.waitForTimeout(500);
        const row = page.locator('table').locator('tr', {
            hasText: 'demo+marygreen@lightdash.com',
        });
        await row.scrollIntoViewIfNeeded();
        await row.locator('.tabler-icon-dots').click({ force: true });
        await page.getByRole('menuitem', { name: /delete/i }).click();

        // Wait for modal to appear
        await expect(
            page.getByText('Are you sure you want to delete this user?'),
        ).toBeVisible();

        // Click the Delete button in the modal
        await page.getByRole('button', { name: 'Delete' }).click();

        await expect(
            page.getByText('Success! User was deleted.'),
        ).toBeVisible();
        await expect(
            page.getByText('demo+marygreen@lightdash.com'),
        ).toHaveCount(0);
    });
});
