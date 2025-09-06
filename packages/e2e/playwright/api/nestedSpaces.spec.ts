import { SEED_PROJECT } from '@lightdash/common';
import { expect, test } from '@playwright/test';
import { login } from '../support/auth';

const apiUrl = '/api/v1';

test.describe('Lightdash API tests for my own private spaces as admin', () => {
    test.beforeEach(async ({ request }) => {
        await login(request);
    });

    test('Should not create duplicate slugs in the same project', async ({
        request,
    }) => {
        const spaceName = `📈 Space Namè ${Date.now()}`;

        const res1 = await request.post(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
            {
                headers: { 'Content-type': 'application/json' },
                data: { name: spaceName },
            },
        );

        expect(res1.status()).toBe(200);
        const body1 = await res1.json();

        const res2 = await request.post(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
            {
                headers: { 'Content-type': 'application/json' },
                data: { name: spaceName },
            },
        );

        expect(res2.status()).toBe(200);
        const body2 = await res2.json();
        expect(body2.results.slug).not.toBe(body1.results.slug);
    });

    test('Should not create duplicate slugs in the same project for nested spaces', async ({
        request,
    }) => {
        const spaceName = `📈 Space Namè ${Date.now()}`;

        const res1 = await request.post(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
            {
                headers: { 'Content-type': 'application/json' },
                data: { name: spaceName },
            },
        );

        expect(res1.status()).toBe(200);
        const body1 = await res1.json();

        const res2 = await request.post(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
            {
                headers: { 'Content-type': 'application/json' },
                data: {
                    name: spaceName,
                    parentSpaceUuid: body1.results.uuid,
                },
            },
        );

        expect(res2.status()).toBe(200);
        const body2 = await res2.json();
        expect(body2.results.slug).not.toBe(body1.results.slug);
    });
});
