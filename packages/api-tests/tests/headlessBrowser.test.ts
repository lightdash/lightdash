import { SEED_ORG_1_ADMIN } from '@lightdash/common';
import { ApiClient } from '../helpers/api-client';

const apiUrl = '/api/v1';

describe('Lightdash headless browser', () => {
    // These endpoints may not be available in all environments
    it.skipIf(!process.env.HEADLESS_BROWSER_ENABLED)(
        'Should test simple callback endpoint',
        async () => {
            const client = new ApiClient();
            const resp = await client.get(
                `${apiUrl}/headless-browser/callback/callback-arg`,
            );
            expect(resp.status).toBe(200);
            expect(resp.body).toHaveProperty('flag', 'callback-arg');
        },
    );

    it.skipIf(!process.env.HEADLESS_BROWSER_ENABLED)(
        'Should make a single request to headless browser',
        async () => {
            const client = new ApiClient();
            const resp = await client.get<{
                request: { flag: string };
                response: { flag: string };
            }>(`${apiUrl}/headless-browser/test/single-test`);
            expect(resp.status).toBe(200);
            expect(resp.body.request).toHaveProperty('flag', 'single-test');
            expect(resp.body.response).toHaveProperty('flag', 'single-test');
        },
    );

    it('Should return forbidden error with invalid token', async () => {
        const client = new ApiClient();
        const resp = await client.post(
            `${apiUrl}/headless-browser/login/${SEED_ORG_1_ADMIN.user_uuid}`,
            { token: 'invalid-token' },
            { failOnStatusCode: false },
        );
        expect(resp.status).toBe(403);
        expect(resp.body).toHaveProperty('status', 'error');
    });
});
