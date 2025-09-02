import { test, expect } from '@playwright/test';
import { SEED_PROJECT } from '@lightdash/common';
import { login } from '../support/auth';

const apiUrl = '/api/v1';

test.describe('Lightdash pinning endpoints', () => {
    test.beforeEach(async ({ request }) => {
        await login(request);
    });
    
    test('Should pin/unpin chart', async ({ request }) => {
        const projectUuid = SEED_PROJECT.project_uuid;
        
        // Get charts
        const projectResponse = await request.get(`${apiUrl}/projects/${projectUuid}/charts`);
        const projectBody = await projectResponse.json();
        const savedChart = projectBody.results[0];

        expect(savedChart.pinnedListUuid).toBe(null);

        // Pin Chart
        const pinResponse = await request.patch(`${apiUrl}/saved/${savedChart.uuid}/pinning`);
        const pinBody = await pinResponse.json();

        // Verify chart is pinned
        const res1Response = await request.get(`${apiUrl}/projects/${projectUuid}/charts`);
        const res1Body = await res1Response.json();
        expect(res1Body.results[0].pinnedListUuid).toBe(pinBody.results.pinnedListUuid);

        // Unpin chart
        await request.patch(`${apiUrl}/saved/${savedChart.uuid}/pinning`);

        // Verify chart is unpinned
        const res2Response = await request.get(`${apiUrl}/projects/${projectUuid}/charts`);
        const res2Body = await res2Response.json();
        expect(res2Body.results[0].pinnedListUuid).toBe(null);
    });
    
    test('Should pin/unpin dashboard', async ({ request }) => {
        const projectUuid = SEED_PROJECT.project_uuid;
        
        // Get dashboards
        const projectResponse = await request.get(`${apiUrl}/projects/${projectUuid}/dashboards`);
        const projectBody = await projectResponse.json();
        const dashboard = projectBody.results[0];

        // Pin dashboard
        const pinResponse = await request.patch(`${apiUrl}/dashboards/${dashboard.uuid}/pinning`);
        const pinBody = await pinResponse.json();

        // Verify dashboard is pinned
        const res1Response = await request.get(`${apiUrl}/projects/${projectUuid}/dashboards`);
        const res1Body = await res1Response.json();
        expect(res1Body.results[0].pinnedListUuid).toBe(pinBody.results.pinnedListUuid);

        // Unpin dashboard
        await request.patch(`${apiUrl}/dashboards/${dashboard.uuid}/pinning`);

        // Verify dashboard is unpinned
        const res2Response = await request.get(`${apiUrl}/projects/${projectUuid}/dashboards`);
        const res2Body = await res2Response.json();
        expect(res2Body.results[0].pinnedListUuid).toBe(null);
    });
});