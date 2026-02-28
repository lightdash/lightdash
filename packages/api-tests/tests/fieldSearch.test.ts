import { SEED_PROJECT } from '@lightdash/common';
import type { Body } from '../helpers/api-client';
import { login } from '../helpers/auth';

const apiUrl = '/api/v1';

describe('Field value search', () => {
    let admin: Awaited<ReturnType<typeof login>>;

    beforeAll(async () => {
        admin = await login();
    });

    it('Should test filtering values on orders', async () => {
        const response = await admin.post<Body<{ results: string[] }>>(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/field/orders_status/search`,
            {
                forceRefresh: false,
                search: '',
                limit: 100,
                table: 'orders',
            },
        );
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('results');
        const expectedStatuses = ['completed', 'shipped'];
        const actualStatuses = response.body.results.results;
        for (const status of expectedStatuses) {
            expect(actualStatuses).toContain(status);
        }
    });

    it('Should test filtering "completed" value', async () => {
        const response = await admin.post<Body<{ results: string[] }>>(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/field/orders_status/search`,
            { search: 'completed', limit: 100, table: 'orders' },
        );
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('results');
        expect(response.body.results.results).toHaveLength(1);
        expect(response.body.results.results).toContain('completed');
        expect(response.body.results.results).not.toContain('shipped');
    });

    it('Should return empty results for non existing field search', async () => {
        const response = await admin.post<Body<{ results: string[] }>>(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/field/orders_status/search`,
            { search: 'invalid', limit: 100, table: 'orders' },
        );
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('results');
        expect(response.body.results.results).toHaveLength(0);
    });

    it('Should return empty results for invalid numeric search', async () => {
        const response = await admin.post(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/field/orders_order_id/search`,
            { search: '99', limit: 100, table: 'orders' },
            { failOnStatusCode: false },
        );
        expect(response.status).toBe(400);
    });

    it('Should return empty results for invalid string search', async () => {
        const response = await admin.post<Body<{ results: string[] }>>(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/field/orders_status/search`,
            { search: "\\') OR TRUE --", limit: 100, table: 'orders' },
        );
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('results');
        expect(response.body.results.results).toHaveLength(0);
    });
});
