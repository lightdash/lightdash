import { MetricFilterRule, MetricQuery, SEED_PROJECT } from '@lightdash/common';
import type { Body } from '../helpers/api-client';
import { anotherLogin, login } from '../helpers/auth';

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

describe('Lightdash API', () => {
    let admin: Awaited<ReturnType<typeof login>>;

    beforeAll(async () => {
        admin = await login();
    });

    it('Should identify user', async () => {
        const resp = await admin.get<Body<{ email: string }>>(`${apiUrl}/user`);
        expect(resp.status).toBe(200);
        expect(resp.body.results).toHaveProperty('email', 'demo@lightdash.com');
    });

    it('Should get success response (200) from GET public endpoints', async () => {
        const endpoints = ['/livez', '/health', '/flash'];
        for (const endpoint of endpoints) {
            const resp = await admin.get(`${apiUrl}${endpoint}`);
            expect(resp.status).toBe(200);
            expect(resp.body).toHaveProperty('status', 'ok');
        }
    });

    it('Should get success response (200) from GET projectRouter endpoints', async () => {
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
        for (const endpoint of endpoints) {
            const resp = await admin.get(`${apiUrl}${endpoint}`);
            expect(resp.status).toBe(200);
            expect(resp.body).toHaveProperty('status', 'ok');
        }
    });

    it('Should get list of dashboards from projects', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const resp = await admin.get<Body<Array<{ name: string }>>>(
            `${apiUrl}/projects/${projectUuid}/dashboards`,
        );
        expect(resp.status).toBe(200);
        expect(resp.body).toHaveProperty('status', 'ok');
        expect(resp.body.results[0]).toHaveProperty('name', 'Jaffle dashboard');
    });

    it('Should get success response (200) from POST runQuery', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoint = `/projects/${projectUuid}/explores/customers/runQuery`;
        const resp = await admin.post(`${apiUrl}${endpoint}`, runqueryBody);
        expect(resp.status).toBe(200);
        expect(resp.body).toHaveProperty('status', 'ok');
    });

    it('Should get success response (200) from POST sqlQuery', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoint = `/projects/${projectUuid}/sqlQuery`;
        const resp = await admin.post(`${apiUrl}${endpoint}`, sqlQueryBody);
        expect(resp.status).toBe(200);
        expect(resp.body).toHaveProperty('status', 'ok');
    });

    it('Should get success response (200) from PATCH project', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoint = `${apiUrl}/projects/${projectUuid}`;

        const projectResponse = await admin.get<Body<unknown>>(endpoint);
        expect(projectResponse.status).toBe(200);

        const resp = await admin.patch(endpoint, projectResponse.body.results);
        expect(resp.status).toBe(200);
        expect(resp.body).toHaveProperty('status', 'ok');
    });

    it('Should get success response (200) from PATCH dashboard', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const projectResponse = await admin.get<Body<Array<{ uuid: string }>>>(
            `${apiUrl}/projects/${projectUuid}/dashboards`,
        );
        expect(projectResponse.status).toBe(200);

        const dashboardUuid = projectResponse.body.results[0].uuid;
        const endpoint = `${apiUrl}/dashboards/${dashboardUuid}`;

        const dashboardResponse = await admin.get<
            Body<{
                name: string;
                tiles: unknown;
                filters: unknown;
                tabs: unknown;
            }>
        >(endpoint);
        expect(dashboardResponse.status).toBe(200);
        expect(dashboardResponse.body.results).toHaveProperty(
            'name',
            'Jaffle dashboard',
        );

        const dashboard = dashboardResponse.body.results;
        const resp = await admin.patch(endpoint, {
            name: dashboard.name,
            tiles: dashboard.tiles,
            filters: dashboard.filters,
            tabs: dashboard.tabs,
        });
        expect(resp.status).toBe(200);
        expect(resp.body).toHaveProperty('status', 'ok');
    });

    it('Should get success response (200) from GET savedChartRouter endpoints', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const projectResponse = await admin.get<Body<Array<{ uuid: string }>>>(
            `${apiUrl}/projects/${projectUuid}/charts`,
        );
        expect(projectResponse.status).toBe(200);

        const savedChartUuid = projectResponse.body.results[0].uuid;
        const endpoints = [
            `/saved/${savedChartUuid}`,
            `/saved/${savedChartUuid}/availableFilters`,
        ];
        for (const endpoint of endpoints) {
            const resp = await admin.get(`${apiUrl}${endpoint}`);
            expect(resp.status).toBe(200);
            expect(resp.body).toHaveProperty('status', 'ok');
        }
    });

    it('Should get success response (200) from GET organizationRouter endpoints', async () => {
        const endpoints = [
            `/org`,
            `/org/projects`,
            `/org/users`,
            `/org/onboardingStatus`,
            `/org/users/email/demo@lightdash.com`,
        ];
        for (const endpoint of endpoints) {
            const resp = await admin.get(`${apiUrl}${endpoint}`);
            expect(resp.status).toBe(200);
            expect(resp.body).toHaveProperty('status', 'ok');
        }
    });

    it('Should get not found response (404) from GET organizationRouter endpoints', async () => {
        const endpoints = [`/org/users/email/another@lightdash.com`];
        for (const endpoint of endpoints) {
            const resp = await admin.get(`${apiUrl}${endpoint}`, {
                failOnStatusCode: false,
            });
            expect(resp.status).toBe(404);
            expect(resp.body).toHaveProperty('status', 'error');
        }
    });

    it('Should get success response (200) from GET userRouter endpoints', async () => {
        const endpoints = [`/user`, `/user/identities`];
        for (const endpoint of endpoints) {
            const resp = await admin.get(`${apiUrl}${endpoint}`);
            expect(resp.status).toBe(200);
            expect(resp.body).toHaveProperty('status', 'ok');
        }
    });

    it('Should get success response (200) from GET dashboardRouter endpoints', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const projectResponse = await admin.get<Body<Array<{ uuid: string }>>>(
            `${apiUrl}/projects/${projectUuid}/dashboards`,
        );
        expect(projectResponse.status).toBe(200);

        const dashboardUuid = projectResponse.body.results[0].uuid;
        const endpoints = [`/dashboards/${dashboardUuid}`];
        for (const endpoint of endpoints) {
            const resp = await admin.get(`${apiUrl}${endpoint}`);
            expect(resp.status).toBe(200);
            expect(resp.body).toHaveProperty('status', 'ok');
        }
    });

    it('Should get metric filters from events', async () => {
        const resp = await admin.get<
            Body<{
                tables: {
                    events: {
                        metrics: {
                            with_filters: { filters: MetricFilterRule[] };
                        };
                    };
                };
            }>
        >(`${apiUrl}/projects/${SEED_PROJECT.project_uuid}/explores/events`, {
            failOnStatusCode: false,
        });
        expect(resp.status).toBe(200);
        expect(resp.body).toHaveProperty('status', 'ok');

        const removeIds = (filters: MetricFilterRule[]) =>
            filters.map((filter) => ({ ...filter, id: undefined }));
        const metricFilters = removeIds(
            resp.body.results.tables.events.metrics.with_filters
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

describe('Lightdash API forbidden tests', () => {
    let other: Awaited<ReturnType<typeof anotherLogin>>;

    beforeAll(async () => {
        other = await anotherLogin();
    });

    it('Test login from another user', async () => {
        const resp = await other.get<Body<{ email: string }>>(`${apiUrl}/user`);
        expect(resp.status).toBe(200);
        expect(resp.body.results).toHaveProperty(
            'email',
            'another@lightdash.com',
        );
    });

    it('Should get forbidden error (403) from GET project endpoints from another organization', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoints = [
            `/projects/${projectUuid}`,
            `/projects/${projectUuid}/explores`,
            `/projects/${projectUuid}/spaces`,
            `/projects/${projectUuid}/catalog`,
            `/projects/${projectUuid}/tablesConfiguration`,
            `/projects/${projectUuid}/hasSavedCharts`,
        ];
        for (const endpoint of endpoints) {
            const resp = await other.get(`${apiUrl}${endpoint}`, {
                failOnStatusCode: false,
            });
            expect(resp.status).toBe(403);
        }
    });

    it('Should get an empty list of dashboards from projects', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const resp = await other.get<Body<unknown[]>>(
            `${apiUrl}/projects/${projectUuid}/dashboards`,
            { failOnStatusCode: false },
        );
        expect(resp.status).toBe(200);
        expect(resp.body).toHaveProperty('status', 'ok');
        expect(resp.body.results).toHaveLength(0);
    });

    it('Should get forbidden error (403) from POST runQuery', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoint = `/projects/${projectUuid}/explores/customers/runQuery`;
        const resp = await other.post(`${apiUrl}${endpoint}`, runqueryBody, {
            failOnStatusCode: false,
        });
        expect(resp.status).toBe(403);
    });

    it('Should get forbidden error (403) from POST sqlQuery', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoint = `/projects/${projectUuid}/sqlQuery`;
        const resp = await other.post(`${apiUrl}${endpoint}`, sqlQueryBody, {
            failOnStatusCode: false,
        });
        expect(resp.status).toBe(403);
    });

    it('Should get forbidden error (403) from PATCH project', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoint = `${apiUrl}/projects/${projectUuid}`;
        const resp = await other.patch(
            endpoint,
            {},
            {
                failOnStatusCode: false,
            },
        );
        expect(resp.status).toBe(403);
    });

    it('Should get forbidden error (403) from GET savedChart endpoints from another organization', async () => {
        const adminClient = await login();
        const projectUuid = SEED_PROJECT.project_uuid;
        const projectResponse = await adminClient.get<
            Body<Array<{ uuid: string }>>
        >(`${apiUrl}/projects/${projectUuid}/charts`);
        expect(projectResponse.status).toBe(200);
        const savedChartUuid = projectResponse.body.results[0].uuid;

        const endpoints = [
            `/saved/${savedChartUuid}`,
            `/saved/${savedChartUuid}/availableFilters`,
        ];
        for (const endpoint of endpoints) {
            const resp = await other.get(`${apiUrl}${endpoint}`, {
                failOnStatusCode: false,
            });
            expect(resp.status).toBe(403);
        }
    });

    it('Should get an empty project list (200) from GET /org/projects', async () => {
        const resp = await other.get<Body<unknown[]>>(
            `${apiUrl}/org/projects`,
            {
                failOnStatusCode: false,
            },
        );
        expect(resp.status).toBe(200);
        expect(resp.body).toHaveProperty('status', 'ok');
        expect(resp.body.results).toHaveLength(0);
    });

    it('Should get forbidden error (403) from GET dashboardRouter endpoints', async () => {
        const adminClient = await login();
        const projectUuid = SEED_PROJECT.project_uuid;
        const projectResponse = await adminClient.get<
            Body<Array<{ uuid: string }>>
        >(`${apiUrl}/projects/${projectUuid}/dashboards`);
        expect(projectResponse.status).toBe(200);

        const dashboardUuid = projectResponse.body.results[0].uuid;
        const endpoints = [`/dashboards/${dashboardUuid}`];
        for (const endpoint of endpoints) {
            const resp = await other.get(`${apiUrl}${endpoint}`, {
                failOnStatusCode: false,
            });
            expect(resp.status).toBe(403);
        }
    });

    it('Should get forbidden error (403) from PATCH dashboard', async () => {
        const adminClient = await login();
        const projectUuid = SEED_PROJECT.project_uuid;
        const projectResponse = await adminClient.get<
            Body<Array<{ uuid: string }>>
        >(`${apiUrl}/projects/${projectUuid}/dashboards`);
        expect(projectResponse.status).toBe(200);

        const dashboardUuid = projectResponse.body.results[0].uuid;
        const endpoint = `${apiUrl}/dashboards/${dashboardUuid}`;

        const resp = await other.patch(
            endpoint,
            {
                name: '',
                filters: { metrics: [], dimensions: [] },
                tiles: [],
            },
            { failOnStatusCode: false },
        );
        expect(resp.status).toBe(403);
    });
});
