import { SEED_PROJECT } from '@lightdash/common';
import type { Body } from '../helpers/api-client';
import { login } from '../helpers/auth';

const chartSummariesEndpointPath = `/api/v1/projects/${SEED_PROJECT.project_uuid}/chart-summaries`;

describe('Lightdash chart summaries endpoints', () => {
    let admin: Awaited<ReturnType<typeof login>>;

    beforeAll(async () => {
        admin = await login();
    });

    it('List should include charts saved in dashboards', async () => {
        const resp = await admin.get<Body<Array<{ name: string }>>>(
            chartSummariesEndpointPath,
        );
        expect(resp.status).toBe(200);
        expect(
            resp.body.results.map((chart: { name: string }) => chart.name),
        ).toContain(
            '[Saved in dashboard] How much revenue do we have per payment method?',
        );
    });

    it('List should exclude charts saved in dashboards', async () => {
        const resp = await admin.get<Body<Array<{ name: string }>>>(
            `${chartSummariesEndpointPath}?excludeChartsSavedInDashboard=true`,
        );
        expect(resp.status).toBe(200);
        expect(
            resp.body.results.map((chart: { name: string }) => chart.name),
        ).not.toContain(
            '[Saved in dashboard] How much revenue do we have per payment method?',
        );
    });
});
