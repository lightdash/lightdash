import { RenameType, SEED_PROJECT } from '@lightdash/common';
import { type Body } from '../helpers/api-client';
import { login } from '../helpers/auth';
import { chartMock } from '../helpers/mocks';

const apiUrl = '/api/v1';

describe('Rename Chart API', () => {
    let admin: Awaited<ReturnType<typeof login>>;

    beforeAll(async () => {
        admin = await login();
    });

    async function createSpaceAndChart(
        suffix: string,
        metricQuery: typeof chartMock.metricQuery,
    ) {
        const now = Date.now();
        const spaceResp = await admin.post<Body<{ uuid: string }>>(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/`,
            { name: `Public space to promote ${now}`, isPrivate: false },
        );
        expect(spaceResp.status).toBe(200);
        const spaceUuid = spaceResp.body.results.uuid;

        const chartResp = await admin.post<Body<{ uuid: string }>>(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/saved`,
            {
                ...chartMock,
                name: `Chart to rename ${now} ${suffix}`,
                metricQuery,
                spaceUuid,
                dashboardUuid: null,
            },
        );
        expect(chartResp.status).toBe(200);
        return chartResp.body.results.uuid;
    }

    it('Should rename a chart field and check the response', async () => {
        const chartUuid = await createSpaceAndChart('field', {
            exploreName: 'orders',
            dimensions: ['orders_type'],
            metrics: [],
            filters: {},
            sorts: [{ fieldId: 'orders_type', descending: false }],
            limit: 500,
            tableCalculations: [],
            additionalMetrics: [],
        });

        const renameResp = await admin.post(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/rename/chart/${chartUuid}`,
            {
                from: 'orders_type',
                to: 'orders_status',
                type: RenameType.FIELD,
            },
        );
        expect(renameResp.status).toBe(200);
        expect(renameResp.body).toHaveProperty('status', 'ok');

        const getResp = await admin.get<
            Body<{
                metricQuery: {
                    exploreName: string;
                    dimensions: string[];
                    sorts: Array<{ fieldId: string }>;
                };
            }>
        >(`${apiUrl}/saved/${chartUuid}`);
        expect(getResp.status).toBe(200);
        const updatedChart = getResp.body.results;
        expect(updatedChart.metricQuery.exploreName).toBe('orders');
        expect(updatedChart.metricQuery.dimensions).toContain('orders_status');
        expect(updatedChart.metricQuery.sorts[0].fieldId).toBe('orders_status');

        const delResp = await admin.delete(`${apiUrl}/saved/${chartUuid}`);
        expect(delResp.status).toBe(200);
    });

    it('Should rename a chart model and check the response', async () => {
        const chartUuid = await createSpaceAndChart('model', {
            exploreName: 'purchases',
            dimensions: ['purchases_type'],
            metrics: [],
            filters: {},
            sorts: [{ fieldId: 'purchases_type', descending: false }],
            limit: 500,
            tableCalculations: [],
            additionalMetrics: [],
        });

        const renameResp = await admin.post(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/rename/chart/${chartUuid}`,
            { from: 'purchases', to: 'orders', type: RenameType.MODEL },
        );
        expect(renameResp.status).toBe(200);
        expect(renameResp.body).toHaveProperty('status', 'ok');

        const getResp = await admin.get<
            Body<{
                metricQuery: {
                    exploreName: string;
                    dimensions: string[];
                    sorts: Array<{ fieldId: string }>;
                };
            }>
        >(`${apiUrl}/saved/${chartUuid}`);
        expect(getResp.status).toBe(200);
        const updatedChart = getResp.body.results;
        expect(updatedChart.metricQuery.exploreName).toBe('orders');
        expect(updatedChart.metricQuery.dimensions).toContain('orders_type');
        expect(updatedChart.metricQuery.sorts[0].fieldId).toBe('orders_type');

        const delResp = await admin.delete(`${apiUrl}/saved/${chartUuid}`);
        expect(delResp.status).toBe(200);
    });
});
