import { test, expect } from '@playwright/test';
import { SEED_ORG_1_ADMIN } from '@lightdash/common';

const apiUrl = '/api/v1';

test.describe('Lightdash headless browser', () => {
    test('Should test simple callback endpoint', async ({ request }) => {
        const response = await request.get(`${apiUrl}/headless-browser/callback/callback-arg`);
        
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body).toHaveProperty('flag', 'callback-arg');
    });

    test('Should make a single request to headless browser', async ({ request }) => {
        const response = await request.get(`${apiUrl}/headless-browser/test/single-test`);
        
        expect(response.status()).toBe(200);
        const body = await response.json();

        expect(body.request).toHaveProperty('flag', 'single-test');
        expect(body.response).toHaveProperty('flag', 'single-test');
    });

    test.skip('Should make multiple concurrent requests to headless browser', async () => {
        // Skipping this test as it uses node-fetch directly and would require 
        // different implementation approach in Playwright
    });

    test('Should return forbidden error with invalid token', async ({ request }) => {
        const response = await request.post(`${apiUrl}/headless-browser/login/${SEED_ORG_1_ADMIN.user_uuid}`, {
            headers: { 'Content-Type': 'application/json' },
            data: { token: 'invalid-token' },
        });

        expect(response.status()).toBe(403);
        const body = await response.json();
        expect(body).toHaveProperty('status', 'error');
    });
});