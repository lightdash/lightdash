import { SEED_ORG_1 } from '@lightdash/common';
import {
    expect,
    json,
    loginAs,
    SEED_USERS,
    test,
    verifyEmail,
    type Page,
} from '../../../support/test';

test.describe('Settings - User search', () => {
    const suffix = Date.now();
    const roleName = `Search Analyst ${suffix}`;
    const email = `demo+user-search-${suffix}@lightdash.com`;
    const rolesUrl = `/api/v2/orgs/${SEED_ORG_1.organization_uuid}/roles`;
    let roleUuid: string | undefined;
    let userUuid: string | undefined;

    test.beforeAll(async ({ request }) => {
        await loginAs(request, SEED_USERS.admin);
        const roleResponse = await request.post(rolesUrl, {
            data: {
                name: roleName,
                level: 'organization',
                scopes: ['view:Organization'],
            },
        });
        expect(roleResponse.ok()).toBe(true);
        roleUuid = (await json<{ roleUuid: string }>(roleResponse)).roleUuid;
        const inviteResponse = await request.post('/api/v1/invite-links', {
            data: {
                role: 'viewer',
                email,
                expiresAt: new Date(Date.now() + 86400000).toISOString(),
            },
        });
        expect(inviteResponse.ok()).toBe(true);
        const registerResponse = await request.post('/api/v1/user', {
            data: {
                inviteCode: (await json<{ inviteCode: string }>(inviteResponse))
                    .inviteCode,
                firstName: 'Search',
                lastName: `Tester${suffix}`,
                password: 'TestPassword123!',
            },
        });
        expect(registerResponse.ok()).toBe(true);
        await verifyEmail(request);
        await loginAs(request, SEED_USERS.admin);
        const usersResponse = await request.get('/api/v1/org/users', {
            params: { searchQuery: email },
        });
        expect(usersResponse.ok()).toBe(true);
        userUuid = (await json<{ data: { userUuid: string }[] }>(usersResponse))
            .data[0].userUuid;
        const assignResponse = await request.post(
            `${rolesUrl}/assignments/user/${userUuid}`,
            { data: { roleId: roleUuid } },
        );
        expect(assignResponse.ok()).toBe(true);
    });

    test.afterAll(async ({ request }) => {
        await loginAs(request, SEED_USERS.admin);
        if (userUuid) await request.delete(`/api/v1/org/user/${userUuid}`);
        if (roleUuid) await request.delete(`${rolesUrl}/${roleUuid}`);
    });

    test.beforeEach(async ({ page, api }) => {
        await loginAs(api.raw, SEED_USERS.admin);
        await page.goto('/generalSettings/userManagement');
    });

    const search = async (page: Page, query: string) => {
        const searchResults = page.waitForResponse((response) => {
            const url = new URL(response.url());
            return (
                response.request().method() === 'GET' &&
                url.pathname === '/api/v1/org/users' &&
                url.searchParams.get('searchQuery') === query
            );
        });
        await page.getByTestId('org-users-search-input').fill(query);
        await searchResults;
    };

    test('finds users by a multi-word custom role and excludes single-word matches', async ({
        page,
    }) => {
        const rows = page.locator('table tbody tr');
        await search(page, `  ${roleName.toUpperCase()}  `);
        await expect(rows).toHaveCount(1);
        await expect(rows).toContainText(email);

        await search(page, `Search Nonexistent${suffix}`);
        await expect(page.locator('table')).not.toContainText(email);
        await expect(page.locator('table tbody')).not.toContainText(
            '@lightdash.com',
        );
    });

    test('preserves full-name, email, partial-role, and system-role searches', async ({
        page,
    }) => {
        const rows = page.locator('table tbody tr');
        await search(page, `Search Tester${suffix}`);
        await expect(rows).toHaveCount(1);
        await expect(rows).toContainText(email);
        await search(page, email);
        await expect(rows).toHaveCount(1);
        await expect(rows).toContainText(email);
        await search(page, `Analyst ${suffix}`);
        await expect(rows).toHaveCount(1);
        await expect(rows).toContainText(email);
        await search(page, 'admin');
        await expect(rows.first()).toBeVisible();
        await expect(page.locator('table')).not.toContainText(email);
    });
});
