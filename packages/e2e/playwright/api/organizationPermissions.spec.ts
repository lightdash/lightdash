import { MetricQuery, SEED_PROJECT } from '@lightdash/common';
import { expect, test } from '@playwright/test';
import { anotherLogin } from '../support/auth';

const apiUrl = '/api/v1';

const runqueryBody: MetricQuery = {
    exploreName: 'customers',
    dimensions: ['customers_customer_id'],
    metrics: [],
    filters: {},
    sorts: [
        {
            fieldId: 'customers_customer_id',
            descending: false,
        },
    ],
    limit: 500,
    tableCalculations: [],
    additionalMetrics: [],
};

const sqlQueryBody = { sql: 'select 1' };

test.describe('Lightdash API organization permission tests', () => {
    test.beforeEach(async ({ request }) => {
        await anotherLogin(request);
    });

    test('Test login from another user', async ({ request }) => {
        // Test new user registered
        const response = await request.get(`${apiUrl}/user`);
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.results).toHaveProperty('email', 'another@lightdash.com');
    });

    test('Should get forbidden error (403) from GET project endpoints from another organization', async ({
        request,
    }) => {
        const projectUuid = SEED_PROJECT.project_uuid; // Same project_uuid that belongs to another organization
        const endpoints = [
            `/projects/${projectUuid}`,
            `/projects/${projectUuid}/explores`,
            `/projects/${projectUuid}/spaces`,
            // `/projects/${projectUuid}/dashboards`, // This will return 200 but an empty list, check test below
            `/projects/${projectUuid}/catalog`,
            `/projects/${projectUuid}/tablesConfiguration`,
            `/projects/${projectUuid}/hasSavedCharts`,
        ];

        const responses = await Promise.all(
            endpoints.map((endpoint) => request.get(`${apiUrl}${endpoint}`)),
        );

        responses.forEach((response) => {
            expect(response.status()).toBe(403);
        });
    });

    test('Should get a forbidden error (403) from PATCH project', async ({
        request,
    }) => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoint = `${apiUrl}/projects/${projectUuid}`;

        const response = await request.patch(endpoint, {
            headers: { 'Content-type': 'application/json' },
            data: {},
        });

        expect(response.status()).toBe(403);
    });

    test('Should get an empty list of dashboards from projects', async ({
        request,
    }) => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const response = await request.get(
            `${apiUrl}/projects/${projectUuid}/dashboards`,
        );

        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body).toHaveProperty('status', 'ok');
        expect(body.results).toHaveLength(0);
    });

    test('Should get forbidden error (403) from POST runQuery', async ({
        request,
    }) => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoint = `/projects/${projectUuid}/explores/customers/runQuery`;

        const response = await request.post(`${apiUrl}${endpoint}`, {
            headers: { 'Content-type': 'application/json' },
            data: runqueryBody,
        });

        expect(response.status()).toBe(403);
    });

    test('Should get forbidden error (403) from POST sqlQuery', async ({
        request,
    }) => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoint = `/projects/${projectUuid}/sqlQuery`;

        const response = await request.post(`${apiUrl}${endpoint}`, {
            headers: { 'Content-type': 'application/json' },
            data: sqlQueryBody,
        });

        expect(response.status()).toBe(403);
    });

    test('Should get forbidden error (403) from GET savedChart endpoints from another organization', async ({
        request,
    }) => {
        // First login as original user to get chart UUID
        await request.get('/api/v1/logout'); // logout current user
        await request.post('/api/v1/login', {
            data: {
                email: 'demo@lightdash.com',
                password: 'demo_password!',
            },
        });

        const projectUuid = SEED_PROJECT.project_uuid;
        const projectResponse = await request.get(
            `${apiUrl}/projects/${projectUuid}/charts`,
        );
        expect(projectResponse.status()).toBe(200);
        const projectBody = await projectResponse.json();
        const savedChartUuid = projectBody.results[0].uuid;

        // Switch back to other org user
        await anotherLogin(request);

        const endpoints = [
            `/saved/${savedChartUuid}`,
            `/saved/${savedChartUuid}/availableFilters`,
        ];

        const responses = await Promise.all(
            endpoints.map((endpoint) => request.get(`${apiUrl}${endpoint}`)),
        );

        responses.forEach((response) => {
            expect(response.status()).toBe(403);
        });
    });

    test('Should get an empty project list (200) from GET /org/projects', async ({
        request,
    }) => {
        const response = await request.get(`${apiUrl}/org/projects`, {
            headers: { 'Content-type': 'application/json' },
        });

        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body).toHaveProperty('status', 'ok');
        expect(body.results).toHaveLength(0);
    });

    test('Should get forbidden error (403) from GET dashboardRouter endpoints', async ({
        request,
    }) => {
        // First login as original user to get dashboard UUID
        await request.get('/api/v1/logout'); // logout current user
        await request.post('/api/v1/login', {
            data: {
                email: 'demo@lightdash.com',
                password: 'demo_password!',
            },
        });

        const projectUuid = SEED_PROJECT.project_uuid;
        const projectResponse = await request.get(
            `${apiUrl}/projects/${projectUuid}/dashboards`,
        );
        expect(projectResponse.status()).toBe(200);
        const projectBody = await projectResponse.json();
        const dashboardUuid = projectBody.results[0].uuid;

        // Switch back to other org user
        await anotherLogin(request);

        const endpoints = [`/dashboards/${dashboardUuid}`];
        const responses = await Promise.all(
            endpoints.map((endpoint) => request.get(`${apiUrl}${endpoint}`)),
        );

        responses.forEach((response) => {
            expect(response.status()).toBe(403);
        });
    });

    test('Should get forbidden error (403) from PATCH dashboard', async ({
        request,
    }) => {
        // First login as original user to get dashboard UUID
        await request.get('/api/v1/logout'); // logout current user
        await request.post('/api/v1/login', {
            data: {
                email: 'demo@lightdash.com',
                password: 'demo_password!',
            },
        });

        const projectUuid = SEED_PROJECT.project_uuid;
        const projectResponse = await request.get(
            `${apiUrl}/projects/${projectUuid}/dashboards`,
        );
        expect(projectResponse.status()).toBe(200);
        const projectBody = await projectResponse.json();
        const dashboardUuid = projectBody.results[0].uuid;

        // Switch back to other org user
        await anotherLogin(request);

        const response = await request.patch(
            `${apiUrl}/dashboards/${dashboardUuid}`,
            {
                headers: { 'Content-type': 'application/json' },
                data: {
                    name: '',
                    filters: {
                        metrics: [],
                        dimensions: [],
                    },
                    tiles: [],
                },
            },
        );

        expect(response.status()).toBe(403);
    });
});
