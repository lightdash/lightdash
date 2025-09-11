import { SEED_PROJECT } from '@lightdash/common';
import { expect, test } from '@playwright/test';
import { login } from '../support/auth';

const apiUrl = '/api/v1';

test.describe('Content as Code API', () => {
    test.beforeEach(async ({ request }) => {
        await login(request);
    });

    test('download charts as code', async ({ request }) => {
        const resp = await request.get(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/charts/code`,
        );
        expect(resp.status()).toBe(200);
        const body = await resp.json();
        expect(body.results).toBeDefined();
        expect(Array.isArray(body.results.charts)).toBe(true);
        expect(typeof body.results.total).toBe('number');
    });

    test('download charts as code with offset', async ({ request }) => {
        const resp = await request.get(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/charts/code?offset=1`,
        );
        expect(resp.status()).toBe(200);
        const body = await resp.json();
        expect(body.results).toBeDefined();
        expect(body.results.total - body.results.charts.length).toBe(1);
    });

    test('download dashboards as code', async ({ request }) => {
        const resp = await request.get(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/dashboards/code`,
        );
        expect(resp.status()).toBe(200);
        const body = await resp.json();
        expect(body.results).toBeDefined();
        expect(Array.isArray(body.results.dashboards)).toBe(true);
    });

    test('download dashboards as code with offset', async ({ request }) => {
        const resp = await request.get(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/dashboards/code?offset=1`,
        );
        expect(resp.status()).toBe(200);
        const body = await resp.json();
        expect(body.results).toBeDefined();
        expect(body.results.total - body.results.dashboards.length).toBe(1);
    });
});
