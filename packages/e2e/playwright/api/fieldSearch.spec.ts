import { test, expect } from '@playwright/test';
import { SEED_PROJECT } from '@lightdash/common';
import { login } from '../support/auth';

const apiUrl = '/api/v1';

test.describe('Field value search', () => {
    test.beforeEach(async ({ request }) => {
        await login(request);
    });

    test('Should test filtering values on orders', async ({ request }) => {
        const response = await request.post(`${apiUrl}/projects/${SEED_PROJECT.project_uuid}/field/orders_status/search`, {
            data: {
                forceRefresh: false,
                search: '',
                limit: 100,
                table: 'orders',
            },
        });

        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body).toHaveProperty('results');
        
        const expectedStatuses = ['completed', 'shipped'];
        const actualStatuses = body.results.results;
        expectedStatuses.forEach((status) => {
            expect(actualStatuses).toContain(status);
        });
    });

    test('Should test filtering "completed" value', async ({ request }) => {
        const response = await request.post(`${apiUrl}/projects/${SEED_PROJECT.project_uuid}/field/orders_status/search`, {
            data: {
                search: 'completed',
                limit: 100,
                table: 'orders',
            },
        });

        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body).toHaveProperty('results');
        expect(body.results.results).toHaveLength(1);
        
        const actualStatuses = body.results.results;
        expect(actualStatuses).toContain('completed');
        expect(actualStatuses).not.toContain('shipped');
    });

    test('Should return empty results for non existing field search', async ({ request }) => {
        const response = await request.post(`${apiUrl}/projects/${SEED_PROJECT.project_uuid}/field/orders_status/search`, {
            data: {
                search: 'invalid',
                limit: 100,
                table: 'orders',
            },
        });

        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body).toHaveProperty('results');
        expect(body.results.results).toHaveLength(0);
    });

    test('Should return empty results for invalid numeric search', async ({ request }) => {
        const response = await request.post(`${apiUrl}/projects/${SEED_PROJECT.project_uuid}/field/orders_order_id/search`, {
            data: {
                search: '99',
                limit: 100,
                table: 'orders',
            },
        });

        // This number field filter is not supported
        expect(response.status()).toBe(400);
    });

    test('Should return empty results for invalid string search', async ({ request }) => {
        const response = await request.post(`${apiUrl}/projects/${SEED_PROJECT.project_uuid}/field/orders_status/search`, {
            data: {
                search: "\\') OR TRUE --",
                limit: 100,
                table: 'orders',
            },
        });

        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body).toHaveProperty('results');
        expect(body.results.results).toHaveLength(0);
    });
});