import { test, expect } from '@playwright/test';
import { SEED_PROJECT } from '@lightdash/common';
import { login } from '../support/auth';

const chartSummariesEndpointPath = `/api/v1/projects/${SEED_PROJECT.project_uuid}/chart-summaries`;

test.describe('Lightdash chart summaries endpoints', () => {
    test.beforeEach(async ({ request }) => {
        await login(request);
    });

    test('List should include charts saved in dashboards', async ({ request }) => {
        const response = await request.get(chartSummariesEndpointPath);
        expect(response.status()).toBe(200);
        
        const body = await response.json();
        const chartNames = body.results.map((chart: { name: string }) => chart.name);
        expect(chartNames).toContain(
            '[Saved in dashboard] How much revenue do we have per payment method?',
        );
    });

    test('List should exclude charts saved in dashboards', async ({ request }) => {
        const response = await request.get(
            `${chartSummariesEndpointPath}?excludeChartsSavedInDashboard=true`,
        );
        expect(response.status()).toBe(200);
        
        const body = await response.json();
        const chartNames = body.results.map((chart: { name: string }) => chart.name);
        expect(chartNames).not.toContain(
            '[Saved in dashboard] How much revenue do we have per payment method?',
        );
    });
});