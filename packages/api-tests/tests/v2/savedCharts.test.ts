import {
    CreateChartInSpace,
    SavedChart,
    SEED_PROJECT,
} from '@lightdash/common';
import { ApiClient } from '../../helpers/api-client';
import { login } from '../../helpers/auth';
import { chartMock } from '../../helpers/mocks';
import { TestResourceTracker, uniqueName } from '../../helpers/test-isolation';

const v1 = '/api/v1';
const v2 = '/api/v2';

async function createChartV1(
    client: ApiClient,
    projectUuid: string,
    name: string,
): Promise<SavedChart> {
    const body: CreateChartInSpace = {
        ...chartMock,
        name,
        spaceUuid: undefined,
        dashboardUuid: null,
    };
    const resp = await client.post<{ results: SavedChart }>(
        `${v1}/projects/${projectUuid}/saved`,
        body,
    );
    expect(resp.status).toBe(200);
    return resp.body.results;
}

describe('V2 Project Saved Chart endpoints', () => {
    let admin: ApiClient;
    const tracker = new TestResourceTracker();
    const projectUuid = SEED_PROJECT.project_uuid;

    beforeAll(async () => {
        admin = await login();
    });

    afterAll(async () => {
        await tracker.cleanup(admin);
    });

    describe('GET /api/v2/projects/:projectUuid/saved/:chartUuidOrSlug', () => {
        it('should get a chart by UUID', async () => {
            const created = await createChartV1(
                admin,
                projectUuid,
                uniqueName('V2 get chart by uuid'),
            );
            tracker.trackChart(created.uuid);

            const resp = await admin.get<{
                status: string;
                results: SavedChart;
            }>(`${v2}/projects/${projectUuid}/saved/${created.uuid}`);

            expect(resp.status).toBe(200);
            expect(resp.body.status).toBe('ok');
            expect(resp.body.results.uuid).toBe(created.uuid);
            expect(resp.body.results.name).toBe(created.name);
            expect(resp.body.results.projectUuid).toBe(projectUuid);
        });

        it('should get a chart by slug', async () => {
            const created = await createChartV1(
                admin,
                projectUuid,
                uniqueName('V2 get chart by slug'),
            );
            tracker.trackChart(created.uuid);

            const resp = await admin.get<{
                status: string;
                results: SavedChart;
            }>(`${v2}/projects/${projectUuid}/saved/${created.slug}`);

            expect(resp.status).toBe(200);
            expect(resp.body.results.uuid).toBe(created.uuid);
            expect(resp.body.results.slug).toBe(created.slug);
        });

        it('should return 404 for a non-existent chart', async () => {
            const resp = await admin.get(
                `${v2}/projects/${projectUuid}/saved/non-existent-uuid`,
                { failOnStatusCode: false },
            );

            expect(resp.ok).toBe(false);
        });
    });

    describe('DELETE /api/v2/projects/:projectUuid/saved/:chartUuidOrSlug', () => {
        it('should delete a chart by UUID', async () => {
            const created = await createChartV1(
                admin,
                projectUuid,
                uniqueName('V2 delete chart'),
            );

            const resp = await admin.delete<{
                status: string;
                results: undefined;
            }>(`${v2}/projects/${projectUuid}/saved/${created.uuid}`);

            expect(resp.status).toBe(200);
            expect(resp.body.status).toBe('ok');

            // Verify it's deleted
            const getResp = await admin.get(
                `${v2}/projects/${projectUuid}/saved/${created.uuid}`,
                { failOnStatusCode: false },
            );
            expect(getResp.ok).toBe(false);
        });

        it('should delete a chart by slug', async () => {
            const created = await createChartV1(
                admin,
                projectUuid,
                uniqueName('V2 delete chart by slug'),
            );

            const resp = await admin.delete<{
                status: string;
                results: undefined;
            }>(`${v2}/projects/${projectUuid}/saved/${created.slug}`);

            expect(resp.status).toBe(200);

            // Verify it's deleted
            const getResp = await admin.get(
                `${v2}/projects/${projectUuid}/saved/${created.uuid}`,
                { failOnStatusCode: false },
            );
            expect(getResp.ok).toBe(false);
        });
    });

    describe('V1 and V2 parity', () => {
        it('should return the same chart data from V1 and V2', async () => {
            const created = await createChartV1(
                admin,
                projectUuid,
                uniqueName('V2 chart parity'),
            );
            tracker.trackChart(created.uuid);

            const v1Resp = await admin.get<{ results: SavedChart }>(
                `${v1}/saved/${created.uuid}`,
            );
            const v2Resp = await admin.get<{ results: SavedChart }>(
                `${v2}/projects/${projectUuid}/saved/${created.uuid}`,
            );

            expect(v1Resp.status).toBe(200);
            expect(v2Resp.status).toBe(200);
            expect(v1Resp.body.results.uuid).toBe(v2Resp.body.results.uuid);
            expect(v1Resp.body.results.name).toBe(v2Resp.body.results.name);
            expect(v1Resp.body.results.metricQuery).toEqual(
                v2Resp.body.results.metricQuery,
            );
            expect(v1Resp.body.results.chartConfig).toEqual(
                v2Resp.body.results.chartConfig,
            );
        });
    });
});
