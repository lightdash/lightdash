import { test, expect } from '@playwright/test';
import { CreateEmbedJwt, DecodedEmbed, SEED_PROJECT } from '@lightdash/common';
import { login, anotherLogin } from '../support/auth';

const EMBED_API_PREFIX = `/api/v1/embed/${SEED_PROJECT.project_uuid}`;

test.describe('Embed Management API', () => {
    let embedConfig: DecodedEmbed;

    test.beforeAll(async ({ request }) => {
        await login(request);
        // Get initial data
        const response = await request.get(`${EMBED_API_PREFIX}/config`);
        expect(response.status()).toBe(200);
        const body = await response.json();
        embedConfig = body.results;
    });

    test.beforeEach(async ({ request }) => {
        await login(request);
    });

    test('should get project embed configuration', async ({ request }) => {
        expect(embedConfig).toBeTruthy();
        expect(embedConfig.projectUuid).toBe(SEED_PROJECT.project_uuid);
        expect(embedConfig.dashboardUuids.length).toBeGreaterThan(0);
        expect(embedConfig.createdAt).toBeTruthy();
        expect(embedConfig.user).toBeTruthy();
        expect(embedConfig.secret).toBeTruthy();
        expect(embedConfig.encodedSecret).toBeUndefined();
    });

    test('should replace project embed configuration', async ({ request }) => {
        const updateResponse = await request.post(`${EMBED_API_PREFIX}/config`, {
            headers: { 'Content-type': 'application/json' },
            data: {
                dashboardUuids: embedConfig.dashboardUuids,
            },
        });

        expect(updateResponse.status()).toBe(201);
        const updateBody = await updateResponse.json();
        // should have new secret
        expect(updateBody.results.secret).not.toBe(embedConfig.secret);
        expect(updateBody.results.dashboardUuids).toEqual(expect.arrayContaining(embedConfig.dashboardUuids));
    });

    test('should update project embed allowed dashboards', async ({ request }) => {
        const contentResponse = await request.get('/api/v2/content?pageSize=999&contentTypes=dashboard');
        expect(contentResponse.status()).toBe(200);
        const contentBody = await contentResponse.json();
        
        const dashboardsUuids = contentBody.results.data.map((d: { uuid: string }) => d.uuid);
        expect(dashboardsUuids.length).toBeGreaterThan(1);

        const updateResponse = await request.patch(`${EMBED_API_PREFIX}/config/dashboards`, {
            headers: { 'Content-type': 'application/json' },
            data: {
                dashboardUuids: dashboardsUuids,
                allowAllDashboards: false,
            },
        });

        expect(updateResponse.status()).toBe(200);

        const newConfigResponse = await request.get(`${EMBED_API_PREFIX}/config`);
        expect(newConfigResponse.status()).toBe(200);
        const newConfigBody = await newConfigResponse.json();
        expect(newConfigBody.results.dashboardUuids).toEqual(expect.arrayContaining(dashboardsUuids));
    });

    test('should create embed url', async ({ request }) => {
        const response = await request.post(`${EMBED_API_PREFIX}/get-embed-url`, {
            headers: { 'Content-type': 'application/json' },
            data: {
                content: {
                    type: 'dashboard',
                    dashboardUuid: embedConfig.dashboardUuids[0],
                },
            },
        });

        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.results.url).toBeTruthy();
    });
});

test.describe('Embed Management API - invalid permissions', () => {
    test.beforeEach(async ({ request }) => {
        await anotherLogin(request);
    });
    
    test('should not get embed configuration', async ({ request }) => {
        const response = await request.get(`${EMBED_API_PREFIX}/config`);
        expect(response.status()).toBe(403);
    });
    
    test('should not get embed url', async ({ request }) => {
        const response = await request.post(`${EMBED_API_PREFIX}/get-embed-url`, {
            headers: { 'Content-type': 'application/json' },
            data: {
                content: {
                    type: 'dashboard',
                    dashboardUuid: 'uuid',
                },
            },
        });
        expect(response.status()).toBe(403);
    });
    
    test('should not replace embed configuration', async ({ request }) => {
        const response = await request.post(`${EMBED_API_PREFIX}/config`, {
            headers: { 'Content-type': 'application/json' },
            data: {
                dashboardUuids: ['uuid'],
            },
        });
        expect(response.status()).toBe(403);
    });
    
    test('should not update embed configuration', async ({ request }) => {
        const response = await request.patch(`${EMBED_API_PREFIX}/config/dashboards`, {
            headers: { 'Content-type': 'application/json' },
            data: {
                dashboardUuids: ['uuid'],
                allowAllDashboards: false,
            },
        });
        expect(response.status()).toBe(403);
    });
});