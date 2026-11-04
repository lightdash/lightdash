import {
    expect,
    json,
    loginAs,
    loginWithEmail,
    registerWithCode,
    SEED_USERS,
    test,
    verifyEmail,
} from '../../../support/test';

test.describe('Settings - Profile', () => {
    const email = `profile-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@lightdash.com`;
    let userUuid: string | null = null;

    test.beforeAll(async ({ request }) => {
        await loginAs(request, SEED_USERS.admin);
        const response = await request.post('/api/v1/invite-links', {
            data: {
                email,
                role: 'member',
                expiresAt: new Date(
                    Date.now() + 24 * 60 * 60 * 1000,
                ).toISOString(),
            },
        });
        expect(response.status()).toBe(201);
        const results = await json<{ userUuid: string; inviteCode: string }>(
            response,
        );
        userUuid = results.userUuid;
        await registerWithCode(request, results.inviteCode);
        await verifyEmail(request);
        await loginWithEmail(request, email);
        const completeResponse = await request.patch(
            '/api/v1/user/me/complete',
            {
                data: {
                    jobTitle: 'Engineering',
                    enableEmailDomainAccess: false,
                    isMarketingOptedIn: false,
                    isTrackingAnonymized: false,
                },
            },
        );
        expect(completeResponse.status()).toBe(200);
    });

    test.beforeEach(async ({ api }) => {
        await loginWithEmail(api.raw, email);
        const response = await api.patch('/api/v1/user/me', {
            data: { firstName: 'test', lastName: 'test' },
        });
        expect(response.status()).toBe(200);
    });

    test.afterAll(async ({ request }) => {
        if (!userUuid) return;
        await loginAs(request, SEED_USERS.admin);
        const response = await request.delete(`/api/v1/org/user/${userUuid}`);
        expect(response.status()).toBe(200);
    });

    test('should update user names', async ({ page }) => {
        await page.goto('/');
        await page.getByTestId('user-avatar').click();
        await page.getByRole('menuitem', { name: 'User settings' }).click();

        const emailInput = page.getByPlaceholder('Email');
        await expect(emailInput).toBeEnabled();
        await expect(emailInput).toHaveValue(email);

        const firstNameInput = page.getByPlaceholder('First name');
        await expect(firstNameInput).toBeEnabled();
        await expect(firstNameInput).toHaveValue('test');
        await firstNameInput.click();
        await firstNameInput.fill('Kevin');
        await firstNameInput.blur();
        // Assert each value sticks to prevent flakiness when typing in different inputs.
        await expect(firstNameInput).toHaveValue('Kevin');
        const lastNameInput = page.getByPlaceholder('Last name');
        await expect(lastNameInput).toBeEnabled();
        await expect(lastNameInput).toHaveValue('test');
        await lastNameInput.click();
        await lastNameInput.fill('Space');
        await lastNameInput.blur();
        await expect(lastNameInput).toHaveValue('Space');
        await expect(firstNameInput).toHaveValue('Kevin');

        await page.getByRole('button', { name: 'Update' }).click();

        await expect(
            page.getByText('Success! User details were updated.'),
        ).toBeVisible();

        await page.goto('/');
        await expect(page.getByTestId('user-avatar')).toContainText('KS');
    });
});
