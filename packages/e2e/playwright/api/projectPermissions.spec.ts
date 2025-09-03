import { SEED_ORG_1_ADMIN, SEED_PROJECT } from '@lightdash/common';
import { expect, test } from '@playwright/test';
import { login } from '../support/auth';

const apiUrl = '/api/v1';

test.describe('Project Permissions API (basic checks)', () => {
    test.beforeEach(async ({ request }) => {
        await login(request);
    });

    test('should list project members and include seed admin', async ({
        request,
    }) => {
        const resp = await request.get(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/members`,
        );
        expect(resp.status()).toBe(200);
        const body = await resp.json();
        const members = body.results;
        expect(Array.isArray(members)).toBe(true);
        const hasSeedAdmin = members.find(
            (m: { userUuid: string }) =>
                m.userUuid === SEED_ORG_1_ADMIN.user_uuid,
        );
        expect(Boolean(hasSeedAdmin)).toBe(true);
    });

    test('should list available project roles', async ({ request }) => {
        const resp = await request.get(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/access/roles`,
        );
        expect(resp.status()).toBe(200);
        const body = await resp.json();
        expect(Array.isArray(body.results)).toBe(true);
    });
});
