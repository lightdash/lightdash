import { test, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { RenameType, SEED_PROJECT } from '@lightdash/common';
import { login } from '../support/auth';
import { chartMock } from '../support/mocks';

const apiUrl = '/api/v1';

async function createSpace(request: APIRequestContext, name: string) {
    const resp = await request.post(`${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`, {
        data: { name },
    });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    return body.results.uuid as string;
}

async function createChartInSpace(request: APIRequestContext, spaceUuid: string, overrides: Partial<typeof chartMock> = {}) {
    const payload: Record<string, unknown> = {
        ...chartMock,
        ...overrides,
        spaceUuid,
        dashboardUuid: null,
    };
    const resp = await request.post(`${apiUrl}/projects/${SEED_PROJECT.project_uuid}/saved`, { data: payload });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    return body.results;
}

test.describe('Rename API', () => {
    test.beforeEach(async ({ request }) => {
        await login(request);
    });

    test('rename chart field and validate', async ({ request }) => {
        const now = Date.now();
        const spaceUuid = await createSpace(request, `Public space to promote ${now}`);
        const chart = await createChartInSpace(request, spaceUuid, {
            name: `Chart to rename ${now} field`,
            metricQuery: {
                exploreName: 'orders',
                dimensions: ['orders_type'],
                metrics: [],
                filters: {},
                sorts: [{ fieldId: 'orders_type', descending: false }],
                limit: 500,
                tableCalculations: [],
                additionalMetrics: [],
            },
        });

        const renamePayload = { from: 'orders_type', to: 'orders_status', type: RenameType.FIELD };
        const renameResp = await request.post(`${apiUrl}/projects/${SEED_PROJECT.project_uuid}/rename/chart/${chart.uuid}`, {
            data: renamePayload,
        });
        expect(renameResp.status()).toBe(200);

        const getResp = await request.get(`${apiUrl}/saved/${chart.uuid}`);
        expect(getResp.status()).toBe(200);
        const getBody = await getResp.json();
        const updated = getBody.results;
        expect(updated.metricQuery.exploreName).toBe('orders');
        expect(updated.metricQuery.dimensions).toContain('orders_status');
        expect(updated.metricQuery.sorts[0].fieldId).toBe('orders_status');

        const del = await request.delete(`${apiUrl}/saved/${chart.uuid}`);
        expect(del.status()).toBe(200);
        // delete space
        await request.delete(`${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${spaceUuid}`);
    });

    test('rename chart model and validate', async ({ request }) => {
        const now = Date.now();
        const spaceUuid = await createSpace(request, `Public space to promote ${now}`);
        const chart = await createChartInSpace(request, spaceUuid, {
            name: `Chart to rename ${now} model`,
            metricQuery: {
                exploreName: 'purchases',
                dimensions: ['purchases_type'],
                metrics: [],
                filters: {},
                sorts: [{ fieldId: 'purchases_type', descending: false }],
                limit: 500,
                tableCalculations: [],
                additionalMetrics: [],
            },
        });

        const renamePayload = { from: 'purchases', to: 'orders', type: RenameType.MODEL };
        const renameResp = await request.post(`${apiUrl}/projects/${SEED_PROJECT.project_uuid}/rename/chart/${chart.uuid}`, {
            data: renamePayload,
        });
        expect(renameResp.status()).toBe(200);

        const getResp = await request.get(`${apiUrl}/saved/${chart.uuid}`);
        expect(getResp.status()).toBe(200);
        const getBody = await getResp.json();
        const updated = getBody.results;
        expect(updated.metricQuery.exploreName).toBe('orders');
        expect(updated.metricQuery.dimensions).toContain('orders_type');
        expect(updated.metricQuery.sorts[0].fieldId).toBe('orders_type');

        const del = await request.delete(`${apiUrl}/saved/${chart.uuid}`);
        expect(del.status()).toBe(200);
        // delete space
        await request.delete(`${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${spaceUuid}`);
    });
});
