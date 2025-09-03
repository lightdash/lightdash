import { SEED_PROJECT } from '@lightdash/common';
import { expect, test } from '@playwright/test';
import { login } from '../support/auth';

const apiUrl = '/api/v1';

const chartBody = {
    tableName: 'customers',
    metricQuery: {
        dimensions: ['customers_customer_id'],
        metrics: [],
        filters: {},
        limit: 500,
        sorts: [
            {
                fieldId: 'customers_customer_id',
                descending: false,
            },
        ],
        tableCalculations: [],
        additionalMetrics: [],
    },
    tableConfig: { columnOrder: ['customers_customer_id'] },
    chartConfig: {
        type: 'cartesian',
        config: { layout: {}, eChartsConfig: {} },
    },
    name: 'private chart',
};

const dashboardBody = {
    name: 'private dashboard',
    description: '',
    tiles: [],
    tabs: [],
};

test.describe('Space permissions (admin basic flows)', () => {
    test.beforeEach(async ({ request }) => {
        await login(request);
    });

    test('create private space and content then cleanup', async ({
        request,
    }) => {
        const createSpaceResp = await request.post(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
            {
                data: { name: 'private space' },
            },
        );
        expect(createSpaceResp.status()).toBe(200);
        const spaceUuid = (await createSpaceResp.json()).results.uuid as string;

        const createChartResp = await request.post(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/saved`,
            {
                data: { ...chartBody, spaceUuid },
            },
        );
        expect(createChartResp.status()).toBe(200);

        const createDashResp = await request.post(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/dashboards`,
            {
                data: { ...dashboardBody, spaceUuid },
            },
        );
        expect(createDashResp.status()).toBe(201);

        const delSpace = await request.delete(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${spaceUuid}`,
        );
        expect(delSpace.status()).toBe(200);
    });
});
