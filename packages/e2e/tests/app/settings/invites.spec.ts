import {
    expect,
    loginAs,
    logout,
    SEED_USERS,
    test,
} from '../../../support/test';

test.describe('Settings - Invites', () => {
    test.beforeEach(async ({ page, api }) => {
        await loginAs(api.raw, SEED_USERS.admin);
        await page.goto('/');
    });

    test('Should invite user', async ({ page, api }) => {
        await page.getByTestId('settings-menu').click();
        await page
            .getByRole('menuitem', { name: 'Organization settings' })
            .click();

        await page.getByText('Users & groups').click();
        const addUserButton = page.getByRole('button', { name: 'Add user' });
        await addUserButton.scrollIntoViewIfNeeded();
        await addUserButton.click({ force: true });
        await page
            .getByLabel('Enter user email address')
            .fill('demo+marygreen@lightdash.com');
        await page.getByText(/(Generate|Send) invite/).click();
        const inviteLinkInput = page.locator('#invite-link-input');
        await expect(inviteLinkInput).not.toHaveValue('');
        const inviteLink = await inviteLinkInput.inputValue();
        await logout(api.raw);
        await page.goto(inviteLink);
        await expect(
            page.locator('[data-cy="one-click-invite"]'),
        ).toBeVisible();
        await page
            .getByRole('button', {
                name: 'Continue as demo+marygreen@lightdash.com',
            })
            .click();
        await expect(page).toHaveURL(/\/organization-setup/);
        await page.getByLabel('First name').fill('Mary');
        await page.getByLabel('Last name').fill('Green');
        await page.getByPlaceholder('Select your role').click();
        await page.getByText('Product', { exact: true }).click();
        await page.getByRole('button', { name: 'Continue' }).click();
        await expect(page.getByTestId('user-avatar')).toContainText('MG');
    });

    test('Should delete user', async ({ page }) => {
        await page.getByTestId('settings-menu').click();
        await page
            .getByRole('menuitem', { name: 'Organization settings' })
            .click();

        await page.getByText('Users & groups').click();
        const searchResults = page.waitForResponse(
            (response) =>
                new URL(response.url()).pathname === '/api/v1/org/users' &&
                new URL(response.url()).searchParams.get('searchQuery') ===
                    'marygreen',
        );
        await page.getByTestId('org-users-search-input').fill('marygreen');
        await searchResults;
        const userRow = page
            .locator('table tr')
            .filter({ hasText: 'demo+marygreen@lightdash.com' });
        await userRow.scrollIntoViewIfNeeded();
        await userRow.locator('.tabler-icon-dots').click({ force: true });
        await page.getByRole('menuitem', { name: /delete/i }).click();

        // Wait for modal to appear
        await expect(
            page.getByText('Are you sure you want to delete this user?'),
        ).toBeVisible();

        // Click the Delete button in the modal
        await page.getByRole('button', { name: 'Delete', exact: true }).click();

        await expect(
            page.getByText('Success! User was deleted.'),
        ).toBeVisible();
        await expect(
            page.getByText('demo+marygreen@lightdash.com'),
        ).toHaveCount(0);
    });
});
