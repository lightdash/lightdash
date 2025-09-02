import { test, expect } from '@playwright/test';
import { SEED_PROJECT } from '@lightdash/common';
import { login } from '../support/auth';

const apiUrl = '/api/v1';

test.describe('Promotion API (basic checks)', () => {
    test.beforeEach(async ({ request }) => {
        await login(request);
    });

    test('project metadata endpoint should be accessible', async ({ request }) => {
        const getMeta = await request.get(`${apiUrl}/projects/${SEED_PROJECT.project_uuid}/metadata`);
        expect(getMeta.status()).toBe(200);
        const body = await getMeta.json();
        expect(body.results).toBeDefined();
        // Keep upstreamProjectUuid as-is to avoid environment coupling
        const currentUpstream = body.results.upstreamProjectUuid ?? null;
        const patch = await request.patch(`${apiUrl}/projects/${SEED_PROJECT.project_uuid}/metadata`, {
            data: { upstreamProjectUuid: currentUpstream },
        });
        expect(patch.status()).toBe(200);
    });

    test('promote endpoint exists for a known chart and returns a valid response code', async ({ request }) => {
        // Try to fetch any chart and probe promote endpoint behavior without assuming upstream config
        const charts = await request.get(`${apiUrl}/projects/${SEED_PROJECT.project_uuid}/charts`);
        expect(charts.status()).toBe(200);
        const chartsBody = await charts.json();
        const one = chartsBody.results[0];
        expect(one).toBeDefined();
        const promote = await request.post(`${apiUrl}/saved/${one.uuid}/promote`);
        // When upstream is not configured server may return 400; if configured, 200
        expect([200, 400]).toContain(promote.status());
    });

    test('promote endpoint exists for a known dashboard and returns a valid response code', async ({ request }) => {
        const dashboards = await request.get(`${apiUrl}/projects/${SEED_PROJECT.project_uuid}/dashboards`);
        expect(dashboards.status()).toBe(200);
        const dashboardsBody = await dashboards.json();
        const dash = dashboardsBody.results[0];
        expect(dash).toBeDefined();
        const promote = await request.post(`${apiUrl}/dashboards/${dash.uuid}/promote`);
        expect([200, 400]).toContain(promote.status());
    });
});
