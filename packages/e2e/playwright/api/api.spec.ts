import { MetricFilterRule, MetricQuery, SEED_PROJECT } from '@lightdash/common';
import { expect, test } from '@playwright/test';
import { anotherLogin, login } from '../support/auth';

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

test.describe('Lightdash API', () => {
    test.beforeEach(async ({ request }) => {
        await login(request);
    });

    test('Should identify user', async ({ request }) => {
        const response = await request.get(`${apiUrl}/user`);
        expect(response.status()).toBe(200);

        const body = await response.json();
        expect(body.results).toHaveProperty('email', 'demo@lightdash.com');
    });

    test('Should get success response (200) from GET public endpoints', async ({
        request,
    }) => {
        const endpoints = ['/livez', '/health', '/flash'];

        const responses = await Promise.all(
            endpoints.map((endpoint) => request.get(`${apiUrl}${endpoint}`)),
        );

        const bodies = await Promise.all(
            responses.map((response) => response.json()),
        );

        responses.forEach((response, index) => {
            expect(response.status()).toBe(200);
            expect(bodies[index]).toHaveProperty('status', 'ok');
        });
    });

    test('Should get success response (200) from GET projectRouter endpoints', async ({
        request,
    }) => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoints = [
            `/projects/${projectUuid}`,
            `/projects/${projectUuid}/explores`,
            `/projects/${projectUuid}/most-popular-and-recently-updated`,
            `/projects/${projectUuid}/dashboards`,
            `/projects/${projectUuid}/catalog`,
            `/projects/${projectUuid}/tablesConfiguration`,
            `/projects/${projectUuid}/hasSavedCharts`,
        ];

        const responses = await Promise.all(
            endpoints.map((endpoint) => request.get(`${apiUrl}${endpoint}`)),
        );

        const bodies = await Promise.all(
            responses.map((response) => response.json()),
        );

        responses.forEach((response, index) => {
            expect(response.status()).toBe(200);
            expect(bodies[index]).toHaveProperty('status', 'ok');
        });
    });

    test('Should get list of dashboards from projects', async ({ request }) => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const response = await request.get(
            `${apiUrl}/projects/${projectUuid}/dashboards`,
        );
        const body = await response.json();

        expect(response.status()).toBe(200);
        expect(body).toHaveProperty('status', 'ok');
        expect(body.results[0]).toHaveProperty('name', 'Jaffle dashboard');
    });

    test('Should get success response (200) from POST runQuery', async ({
        request,
    }) => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoint = `/projects/${projectUuid}/explores/customers/runQuery`;

        const response = await request.post(`${apiUrl}${endpoint}`, {
            headers: { 'Content-type': 'application/json' },
            data: runqueryBody,
        });
        const body = await response.json();

        expect(response.status()).toBe(200);
        expect(body).toHaveProperty('status', 'ok');
    });

    test('Should get success response (200) from POST sqlQuery', async ({
        request,
    }) => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoint = `/projects/${projectUuid}/sqlQuery`;

        const response = await request.post(`${apiUrl}${endpoint}`, {
            headers: { 'Content-type': 'application/json' },
            data: sqlQueryBody,
        });
        const body = await response.json();

        expect(response.status()).toBe(200);
        expect(body).toHaveProperty('status', 'ok');
    });

    test('Should get success response (200) from PATCH project', async ({
        request,
    }) => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoint = `${apiUrl}/projects/${projectUuid}`;

        const projectResponse = await request.get(endpoint);
        expect(projectResponse.status()).toBe(200);

        const projectBody = await projectResponse.json();

        const patchResponse = await request.patch(endpoint, {
            headers: { 'Content-type': 'application/json' },
            data: projectBody.results,
        });
        const patchBody = await patchResponse.json();

        expect(patchResponse.status()).toBe(200);
        expect(patchBody).toHaveProperty('status', 'ok');
    });

    test('Should get success response (200) from PATCH dashboard', async ({
        request,
    }) => {
        const projectUuid = SEED_PROJECT.project_uuid;

        const projectResponse = await request.get(
            `${apiUrl}/projects/${projectUuid}/dashboards`,
        );
        expect(projectResponse.status()).toBe(200);

        const projectBody = await projectResponse.json();
        const dashboardUuid = projectBody.results[0].uuid;
        const endpoint = `${apiUrl}/dashboards/${dashboardUuid}`;

        const dashboardResponse = await request.get(endpoint);
        expect(dashboardResponse.status()).toBe(200);

        const dashboardBody = await dashboardResponse.json();
        expect(dashboardBody.results).toHaveProperty(
            'name',
            'Jaffle dashboard',
        );

        const dashboard = dashboardBody.results;
        const patchResponse = await request.patch(endpoint, {
            headers: { 'Content-type': 'application/json' },
            data: {
                name: dashboard.name,
                tiles: dashboard.tiles,
                filters: dashboard.filters,
                tabs: dashboard.tabs,
            },
        });
        const patchBody = await patchResponse.json();

        expect(patchResponse.status()).toBe(200);
        expect(patchBody).toHaveProperty('status', 'ok');
    });

    test('Should get success response (200) from GET savedChartRouter endpoints', async ({
        request,
    }) => {
        const projectUuid = SEED_PROJECT.project_uuid;

        const projectResponse = await request.get(
            `${apiUrl}/projects/${projectUuid}/charts`,
        );
        expect(projectResponse.status()).toBe(200);

        const projectBody = await projectResponse.json();
        const savedChartUuid = projectBody.results[0].uuid;

        const endpoints = [
            `/saved/${savedChartUuid}`,
            `/saved/${savedChartUuid}/availableFilters`,
        ];

        const responses = await Promise.all(
            endpoints.map((endpoint) => request.get(`${apiUrl}${endpoint}`)),
        );

        const bodies = await Promise.all(
            responses.map((response) => response.json()),
        );

        responses.forEach((response, index) => {
            expect(response.status()).toBe(200);
            expect(bodies[index]).toHaveProperty('status', 'ok');
        });
    });

    test('Should get success response (200) from GET organizationRouter endpoints', async ({
        request,
    }) => {
        const endpoints = [
            `/org`,
            `/org/projects`,
            `/org/users`,
            `/org/onboardingStatus`,
            `/org/users/email/demo@lightdash.com`,
        ];

        const responses = await Promise.all(
            endpoints.map((endpoint) =>
                request.get(`${apiUrl}${endpoint}`, {
                    headers: { 'Content-type': 'application/json' },
                }),
            ),
        );

        const bodies = await Promise.all(
            responses.map((response) => response.json()),
        );

        responses.forEach((response, index) => {
            expect(response.status()).toBe(200);
            expect(bodies[index]).toHaveProperty('status', 'ok');
        });
    });

    test('Should get not found response (404) from GET organizationRouter endpoints', async ({
        request,
    }) => {
        const endpoints = [`/org/users/email/another@lightdash.com`];

        const responses = await Promise.all(
            endpoints.map((endpoint) =>
                request.get(`${apiUrl}${endpoint}`, {
                    headers: { 'Content-type': 'application/json' },
                }),
            ),
        );

        const bodies = await Promise.all(
            responses.map((response) => response.json()),
        );

        responses.forEach((response, index) => {
            expect(response.status()).toBe(404);
            expect(bodies[index]).toHaveProperty('status', 'error');
        });
    });

    test('Should get success response (200) from GET userRouter endpoints', async ({
        request,
    }) => {
        const endpoints = [`/user`, `/user/identities`];

        const responses = await Promise.all(
            endpoints.map((endpoint) => request.get(`${apiUrl}${endpoint}`)),
        );

        const bodies = await Promise.all(
            responses.map((response) => response.json()),
        );

        responses.forEach((response, index) => {
            expect(response.status()).toBe(200);
            expect(bodies[index]).toHaveProperty('status', 'ok');
        });
    });

    test('Should get success response (200) from GET dashboardRouter endpoints', async ({
        request,
    }) => {
        const projectUuid = SEED_PROJECT.project_uuid;

        const projectResponse = await request.get(
            `${apiUrl}/projects/${projectUuid}/dashboards`,
        );
        expect(projectResponse.status()).toBe(200);

        const projectBody = await projectResponse.json();
        const dashboardUuid = projectBody.results[0].uuid;
        const endpoints = [`/dashboards/${dashboardUuid}`];

        const responses = await Promise.all(
            endpoints.map((endpoint) => request.get(`${apiUrl}${endpoint}`)),
        );

        const bodies = await Promise.all(
            responses.map((response) => response.json()),
        );

        responses.forEach((response, index) => {
            expect(response.status()).toBe(200);
            expect(bodies[index]).toHaveProperty('status', 'ok');
        });
    });

    test('Should get metric filters from events', async ({ request }) => {
        const response = await request.get(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/explores/events`,
            {
                headers: { 'Content-type': 'application/json' },
            },
        );

        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body).toHaveProperty('status', 'ok');

        const removeIds = (filters: MetricFilterRule[]) =>
            filters.map((filter) => ({ ...filter, id: undefined }));
        const metricFilters = removeIds(
            body.results.tables.events.metrics.with_filters
                .filters as MetricFilterRule[],
        );

        expect(metricFilters).toHaveLength(3);
        expect(metricFilters[0]).toEqual({
            id: undefined,
            operator: 'notNull',
            values: [1],
            target: { fieldRef: 'event_id' },
        });
        expect(metricFilters[1]).toEqual({
            id: undefined,
            operator: 'greaterThan',
            values: [5],
            target: { fieldRef: 'event_id' },
        });
        expect(metricFilters[2]).toEqual({
            id: undefined,
            operator: 'equals',
            values: ['song_played'],
            target: { fieldRef: 'event' },
        });
    });
});

test.describe('Lightdash API forbidden tests', () => {
    test.beforeEach(async ({ request }) => {
        await anotherLogin(request);
    });

    test('Test login from another user', async ({ request }) => {
        const response = await request.get(`${apiUrl}/user`);
        expect(response.status()).toBe(200);

        const body = await response.json();
        expect(body.results).toHaveProperty('email', 'another@lightdash.com');
    });

    test('Should get forbidden error (403) from GET project endpoints from another organization', async ({
        request,
    }) => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoints = [
            `/projects/${projectUuid}`,
            `/projects/${projectUuid}/explores`,
            `/projects/${projectUuid}/spaces`,
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

    test('Should get an empty list of dashboards from projects', async ({
        request,
    }) => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const response = await request.get(
            `${apiUrl}/projects/${projectUuid}/dashboards`,
        );
        const body = await response.json();

        expect(response.status()).toBe(200);
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

    test('Should get forbidden error (403) from PATCH project', async ({
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

    test('Should get forbidden error (403) from GET savedChart endpoints from another organization', async ({
        request,
    }) => {
        await login(request);

        const projectUuid = SEED_PROJECT.project_uuid;
        const projectResponse = await request.get(
            `${apiUrl}/projects/${projectUuid}/charts`,
        );
        expect(projectResponse.status()).toBe(200);

        const projectBody = await projectResponse.json();
        const savedChartUuid = projectBody.results[0].uuid;

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
        const body = await response.json();

        expect(response.status()).toBe(200);
        expect(body).toHaveProperty('status', 'ok');
        expect(body.results).toHaveLength(0);
    });

    test('Should get forbidden error (403) from GET dashboardRouter endpoints', async ({
        request,
    }) => {
        await login(request);

        const projectUuid = SEED_PROJECT.project_uuid;
        const projectResponse = await request.get(
            `${apiUrl}/projects/${projectUuid}/dashboards`,
        );
        expect(projectResponse.status()).toBe(200);

        const projectBody = await projectResponse.json();
        const dashboardUuid = projectBody.results[0].uuid;

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
        await login(request);

        const projectUuid = SEED_PROJECT.project_uuid;
        const projectResponse = await request.get(
            `${apiUrl}/projects/${projectUuid}/dashboards`,
        );
        expect(projectResponse.status()).toBe(200);

        const projectBody = await projectResponse.json();
        const dashboardUuid = projectBody.results[0].uuid;
        const endpoint = `${apiUrl}/dashboards/${dashboardUuid}`;

        await anotherLogin(request);

        const response = await request.patch(endpoint, {
            headers: { 'Content-type': 'application/json' },
            data: {
                name: '',
                filters: {
                    metrics: [],
                    dimensions: [],
                },
                tiles: [],
            },
        });

        expect(response.status()).toBe(403);
    });
});
