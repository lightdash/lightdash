import {
    MetricQuery,
    ProjectMemberProfile,
    SEED_ORG_1_ADMIN,
    SEED_PROJECT,
} from '@lightdash/common';
import { ApiClient, Body } from '../helpers/api-client';
import { login, loginWithPermissions } from '../helpers/auth';

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

describe('Lightdash API tests for member user with admin project permissions', () => {
    let client: ApiClient;
    let email: string;

    beforeAll(async () => {
        const perm = await loginWithPermissions('member', [
            {
                role: 'admin',
                projectUuid: SEED_PROJECT.project_uuid,
            },
        ]);
        client = perm.client;
        email = perm.email;
    });

    it('Should identify user', async () => {
        const resp = await client.get<Body<{ email: string; role: string }>>(
            `${apiUrl}/user`,
        );
        expect(resp.status).toBe(200);
        expect(resp.body.results).toHaveProperty('email', email);
        expect(resp.body.results).toHaveProperty('role', 'member');
    });

    it('Should get success response (200) from GET public endpoints', async () => {
        const endpoints = ['/livez', '/health', '/flash'];
        // eslint-disable-next-line no-restricted-syntax
        for (const endpoint of endpoints) {
            // eslint-disable-next-line no-await-in-loop
            const resp = await client.get(`${apiUrl}${endpoint}`);
            expect(resp.status).toBe(200);
            expect(resp.body).toHaveProperty('status', 'ok');
        }
    });

    it('Should get success response (200) from GET projectRouter endpoints', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoints = [
            `/projects/${projectUuid}`,
            `/projects/${projectUuid}/explores`,
            `/projects/${projectUuid}/spaces`,
            `/projects/${projectUuid}/charts`,
            `/projects/${projectUuid}/dashboards`,
            `/projects/${projectUuid}/catalog`,
            `/projects/${projectUuid}/tablesConfiguration`,
            `/projects/${projectUuid}/hasSavedCharts`,
        ];
        for (const endpoint of endpoints) {
            // eslint-disable-next-line no-await-in-loop
            const resp = await client.get(`${apiUrl}${endpoint}`);
            expect(resp.status).toBe(200);
            expect(resp.body).toHaveProperty('status', 'ok');
        }
    });

    it('Should get success response (200) from GET scheduler logs', async () => {
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.get(
            `${apiUrl}/schedulers/${SEED_PROJECT.project_uuid}/logs`,
        );
        expect(resp.status).toBe(200);
        expect(resp.body).toHaveProperty('status', 'ok');
    });

    it('Should get list of dashboards from projects', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.get<
            Body<Array<{ uuid: string; name: string }>>
        >(`${apiUrl}/projects/${projectUuid}/dashboards`);
        expect(resp.status).toBe(200);
        expect(resp.body).toHaveProperty('status', 'ok');
        expect(resp.body.results[0]).toHaveProperty('name', 'Jaffle dashboard');
    });

    it('Should get success response (200) from POST runQuery', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoint = `/projects/${projectUuid}/explores/customers/runQuery`;
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.post(`${apiUrl}${endpoint}`, runqueryBody);
        expect(resp.status).toBe(200);
        expect(resp.body).toHaveProperty('status', 'ok');
    });

    it('Should get success response (200) from GET validation', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoint = `/projects/${projectUuid}/validate`;
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.get(`${apiUrl}${endpoint}`);
        expect(resp.status).toBe(200);
        expect(resp.body).toHaveProperty('status', 'ok');
    });

    it('Should get success response (200) from POST validation', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoint = `/projects/${projectUuid}/validate`;
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.post(`${apiUrl}${endpoint}`, {});
        expect(resp.status).toBe(200);
        expect(resp.body).toHaveProperty('status', 'ok');
    });

    it('Should get success response (200) from POST validation with explores', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoint = `/projects/${projectUuid}/validate`;
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.post(`${apiUrl}${endpoint}`, {
            explores: [],
        });
        expect(resp.status).toBe(200);
        expect(resp.body).toHaveProperty('status', 'ok');
    });

    it('Should get success response (200) from POST chart results', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        // eslint-disable-next-line no-await-in-loop
        const spacesResponse = await client.get<Body<Array<{ uuid: string }>>>(
            `${apiUrl}/projects/${projectUuid}/charts`,
        );
        const savedChartUuid = spacesResponse.body.results[0].uuid;
        const endpoint = `/saved/${savedChartUuid}/results`;
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.post(`${apiUrl}${endpoint}`, undefined);
        expect(resp.status).toBe(200);
        expect(resp.body).toHaveProperty('status', 'ok');
    });

    it('Should get success response (200) from POST chart-and-results with filters', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        // eslint-disable-next-line no-await-in-loop
        const spacesResponse = await client.get<Body<Array<{ uuid: string }>>>(
            `${apiUrl}/projects/${projectUuid}/charts`,
        );
        const savedChartUuid = spacesResponse.body.results[0].uuid;
        const endpoint = `/saved/${savedChartUuid}/chart-and-results`;
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.post(`${apiUrl}${endpoint}`, {
            dashboardUuid: 'example',
            dashboardFilters: {
                metrics: [],
                dimensions: [],
                tableCalculations: [],
            },
            dashboardSorts: [],
        });
        expect(resp.status).toBe(200);
        expect(resp.body).toHaveProperty('status', 'ok');
    });

    it('Should get success response (200) from POST runUnderlyingDataQuery', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoint = `/projects/${projectUuid}/explores/customers/runUnderlyingDataQuery`;
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.post(`${apiUrl}${endpoint}`, runqueryBody);
        expect(resp.status).toBe(200);
        expect(resp.body).toHaveProperty('status', 'ok');
    });

    it('Should get success response (200) from POST sqlQuery', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoint = `/projects/${projectUuid}/sqlQuery`;
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.post(`${apiUrl}${endpoint}`, sqlQueryBody);
        expect(resp.status).toBe(200);
        expect(resp.body).toHaveProperty('status', 'ok');
    });

    it('Should get success response (200) from PATCH project', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoint = `${apiUrl}/projects/${projectUuid}`;
        // eslint-disable-next-line no-await-in-loop
        const projectResponse = await client.get<Body<unknown>>(endpoint);
        expect(projectResponse.status).toBe(200);

        // eslint-disable-next-line no-await-in-loop
        const resp = await client.patch<Body<unknown>>(
            endpoint,
            projectResponse.body.results,
        );
        expect(resp.status).toBe(200);
        expect(resp.body).toHaveProperty('status', 'ok');
    });

    it('Should get success response (200) from PATCH dashboard', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        // eslint-disable-next-line no-await-in-loop
        const projectResponse = await client.get<
            Body<Array<{ uuid: string; name: string }>>
        >(`${apiUrl}/projects/${projectUuid}/dashboards`);
        expect(projectResponse.status).toBe(200);

        const dashboardUuid = projectResponse.body.results[0].uuid;
        const endpoint = `${apiUrl}/dashboards/${dashboardUuid}`;
        // eslint-disable-next-line no-await-in-loop
        const dashboardResponse = await client.get<
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
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.patch<Body<unknown>>(endpoint, {
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
        // eslint-disable-next-line no-await-in-loop
        const projectResponse = await client.get<Body<Array<{ uuid: string }>>>(
            `${apiUrl}/projects/${projectUuid}/charts`,
        );
        expect(projectResponse.status).toBe(200);

        const savedChartUuid = projectResponse.body.results[0].uuid;
        const endpoints = [
            `/saved/${savedChartUuid}`,
            `/saved/${savedChartUuid}/availableFilters`,
        ];
        for (const endpoint of endpoints) {
            // eslint-disable-next-line no-await-in-loop
            const resp = await client.get(`${apiUrl}${endpoint}`);
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
        ];
        for (const endpoint of endpoints) {
            // eslint-disable-next-line no-await-in-loop
            const resp = await client.get(`${apiUrl}${endpoint}`);
            expect(resp.status).toBe(200);
            expect(resp.body).toHaveProperty('status', 'ok');
        }
    });

    it('Should get success response (200) from GET userRouter endpoints', async () => {
        const endpoints = [`/user`, `/user/identities`];
        for (const endpoint of endpoints) {
            // eslint-disable-next-line no-await-in-loop
            const resp = await client.get(`${apiUrl}${endpoint}`);
            expect(resp.status).toBe(200);
            expect(resp.body).toHaveProperty('status', 'ok');
        }
    });

    it('Should get success response (200) from GET dashboardRouter endpoints', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        // eslint-disable-next-line no-await-in-loop
        const projectResponse = await client.get<
            Body<Array<{ uuid: string; name: string }>>
        >(`${apiUrl}/projects/${projectUuid}/dashboards`);
        expect(projectResponse.status).toBe(200);

        const dashboardUuid = projectResponse.body.results[0].uuid;
        const endpoints = [`/dashboards/${dashboardUuid}`];
        for (const endpoint of endpoints) {
            // eslint-disable-next-line no-await-in-loop
            const resp = await client.get(`${apiUrl}${endpoint}`);
            expect(resp.status).toBe(200);
            expect(resp.body).toHaveProperty('status', 'ok');
        }
    });
});

describe('Lightdash API tests for member user with editor project permissions', () => {
    let client: ApiClient;
    let email: string;

    beforeAll(async () => {
        // eslint-disable-next-line no-await-in-loop
        const perm = await loginWithPermissions('member', [
            {
                role: 'editor',
                projectUuid: SEED_PROJECT.project_uuid,
            },
        ]);
        client = perm.client;
        email = perm.email;
    });

    it('Should identify user', async () => {
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.get<Body<{ email: string; role: string }>>(
            `${apiUrl}/user`,
        );
        expect(resp.status).toBe(200);
        expect(resp.body.results).toHaveProperty('email', email);
        expect(resp.body.results).toHaveProperty('role', 'member');
    });

    it('Should get success response (200) from GET public endpoints', async () => {
        const endpoints = ['/livez', '/health', '/flash'];
        for (const endpoint of endpoints) {
            // eslint-disable-next-line no-await-in-loop
            const resp = await client.get(`${apiUrl}${endpoint}`);
            expect(resp.status).toBe(200);
            expect(resp.body).toHaveProperty('status', 'ok');
        }
    });

    it('Should get success response (200) from GET projectRouter endpoints', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoints = [
            `/projects/${projectUuid}`,
            `/projects/${projectUuid}/explores`,
            `/projects/${projectUuid}/spaces`,
            `/projects/${projectUuid}/charts`,
            `/projects/${projectUuid}/dashboards`,
            `/projects/${projectUuid}/catalog`,
            `/projects/${projectUuid}/tablesConfiguration`,
            `/projects/${projectUuid}/hasSavedCharts`,
        ];
        for (const endpoint of endpoints) {
            // eslint-disable-next-line no-await-in-loop
            const resp = await client.get(`${apiUrl}${endpoint}`);
            expect(resp.status).toBe(200);
            expect(resp.body).toHaveProperty('status', 'ok');
        }
    });

    it('Should get success response (200) from POST runQuery', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoint = `/projects/${projectUuid}/explores/customers/runQuery`;
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.post(`${apiUrl}${endpoint}`, runqueryBody);
        expect(resp.status).toBe(200);
        expect(resp.body).toHaveProperty('status', 'ok');
    });

    it('Should get success response (200) from GET savedChartRouter endpoints', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        // eslint-disable-next-line no-await-in-loop
        const projectResponse = await client.get<Body<Array<{ uuid: string }>>>(
            `${apiUrl}/projects/${projectUuid}/charts`,
        );
        expect(projectResponse.status).toBe(200);

        const savedChartUuid = projectResponse.body.results[0].uuid;
        const endpoints = [
            `/saved/${savedChartUuid}`,
            `/saved/${savedChartUuid}/availableFilters`,
        ];
        for (const endpoint of endpoints) {
            // eslint-disable-next-line no-await-in-loop
            const resp = await client.get(`${apiUrl}${endpoint}`);
            expect(resp.status).toBe(200);
            expect(resp.body).toHaveProperty('status', 'ok');
        }
    });

    it('Should forbidden (403) from PUT explores', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoint = `/projects/${projectUuid}/explores`;
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.put(`${apiUrl}${endpoint}`, [], {
            failOnStatusCode: false,
        });
        expect(resp.status).toBe(403);
    });

    it('Should get forbidden (403) from GET scheduler logs', async () => {
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.get(
            `${apiUrl}/schedulers/${SEED_PROJECT.project_uuid}/logs`,
            { failOnStatusCode: false },
        );
        expect(resp.status).toBe(403);
    });

    it('Should get list of dashboards from projects', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.get<
            Body<Array<{ uuid: string; name: string }>>
        >(`${apiUrl}/projects/${projectUuid}/dashboards`);
        expect(resp.status).toBe(200);
        expect(resp.body).toHaveProperty('status', 'ok');
        expect(resp.body.results[0]).toHaveProperty('name', 'Jaffle dashboard');
    });

    it('Should get success response (200) from POST downloadCsv', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoint = `/projects/${projectUuid}/explores/customers/downloadCsv`;
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.post(`${apiUrl}${endpoint}`, {
            ...runqueryBody,
            onlyRaw: false,
            columnOrder: [],
            showTableNames: false,
        });
        expect(resp.status).toBe(200);
        expect(resp.body).toHaveProperty('status', 'ok');
    });

    it('Should get forbidden (403) from POST sqlQuery', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoint = `/projects/${projectUuid}/sqlQuery`;
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.post(`${apiUrl}${endpoint}`, sqlQueryBody, {
            failOnStatusCode: false,
        });
        expect(resp.status).toBe(403);
    });

    it('Should get forbidden (403) from GET validation', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoint = `/projects/${projectUuid}/validate`;
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.get(`${apiUrl}${endpoint}`, {
            failOnStatusCode: false,
        });
        expect(resp.status).toBe(403);
    });

    it('Should get forbidden (403) from POST validation', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoint = `/projects/${projectUuid}/validate`;
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.post(
            `${apiUrl}${endpoint}`,
            {},
            {
                failOnStatusCode: false,
            },
        );
        expect(resp.status).toBe(403);
    });

    it('Should get forbidden (403) from PATCH project', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoint = `${apiUrl}/projects/${projectUuid}`;
        // eslint-disable-next-line no-await-in-loop
        const projectResponse = await client.get<Body<unknown>>(endpoint);
        expect(projectResponse.status).toBe(200);

        // eslint-disable-next-line no-await-in-loop
        const resp = await client.patch<Body<unknown>>(
            endpoint,
            projectResponse.body.results,
            { failOnStatusCode: false },
        );
        expect(resp.status).toBe(403);
    });

    it('Should get success response (200) from PATCH dashboard', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        // eslint-disable-next-line no-await-in-loop
        const projectResponse = await client.get<
            Body<Array<{ uuid: string; name: string }>>
        >(`${apiUrl}/projects/${projectUuid}/dashboards`);
        expect(projectResponse.status).toBe(200);

        const dashboardUuid = projectResponse.body.results[0].uuid;
        const endpoint = `${apiUrl}/dashboards/${dashboardUuid}`;
        // eslint-disable-next-line no-await-in-loop
        const dashboardResponse = await client.get<
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
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.patch<Body<unknown>>(endpoint, {
            name: dashboard.name,
            tiles: dashboard.tiles,
            filters: dashboard.filters,
            tabs: dashboard.tabs,
        });
        expect(resp.status).toBe(200);
        expect(resp.body).toHaveProperty('status', 'ok');
    });

    it('Should get success response (200) from GET organizationRouter endpoints', async () => {
        const endpoints = [
            `/org`,
            `/org/projects`,
            `/org/users`,
            `/org/onboardingStatus`,
        ];
        for (const endpoint of endpoints) {
            // eslint-disable-next-line no-await-in-loop
            const resp = await client.get(`${apiUrl}${endpoint}`);
            expect(resp.status).toBe(200);
            expect(resp.body).toHaveProperty('status', 'ok');
        }
    });

    it('Should get success response (200) from GET userRouter endpoints', async () => {
        const endpoints = [`/user`, `/user/identities`];
        for (const endpoint of endpoints) {
            // eslint-disable-next-line no-await-in-loop
            const resp = await client.get(`${apiUrl}${endpoint}`);
            expect(resp.status).toBe(200);
            expect(resp.body).toHaveProperty('status', 'ok');
        }
    });

    it('Should get success response (200) from GET dashboardRouter endpoints', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        // eslint-disable-next-line no-await-in-loop
        const projectResponse = await client.get<
            Body<Array<{ uuid: string; name: string }>>
        >(`${apiUrl}/projects/${projectUuid}/dashboards`);
        expect(projectResponse.status).toBe(200);

        const dashboardUuid = projectResponse.body.results[0].uuid;
        const endpoints = [`/dashboards/${dashboardUuid}`];
        for (const endpoint of endpoints) {
            // eslint-disable-next-line no-await-in-loop
            const resp = await client.get(`${apiUrl}${endpoint}`);
            expect(resp.status).toBe(200);
            expect(resp.body).toHaveProperty('status', 'ok');
        }
    });
});

describe('Lightdash API tests for member user with developer project permissions', () => {
    let client: ApiClient;
    let email: string;

    beforeAll(async () => {
        // eslint-disable-next-line no-await-in-loop
        const perm = await loginWithPermissions('member', [
            {
                role: 'developer',
                projectUuid: SEED_PROJECT.project_uuid,
            },
        ]);
        client = perm.client;
        email = perm.email;
    });

    it('Should get success response (200) from GET scheduler logs', async () => {
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.get(
            `${apiUrl}/schedulers/${SEED_PROJECT.project_uuid}/logs`,
        );
        expect(resp.status).toBe(200);
        expect(resp.body).toHaveProperty('status', 'ok');
    });

    it('Should get success response (200) from POST sqlQuery', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoint = `/projects/${projectUuid}/sqlQuery`;
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.post(`${apiUrl}${endpoint}`, sqlQueryBody);
        expect(resp.status).toBe(200);
        expect(resp.body).toHaveProperty('status', 'ok');
    });

    it('Should get success response (200) from GET validation', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoint = `/projects/${projectUuid}/validate`;
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.get(`${apiUrl}${endpoint}`);
        expect(resp.status).toBe(200);
        expect(resp.body).toHaveProperty('status', 'ok');
    });

    it('Should get success response (200) from POST validation', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoint = `/projects/${projectUuid}/validate`;
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.post(`${apiUrl}${endpoint}`, {});
        expect(resp.status).toBe(200);
        expect(resp.body).toHaveProperty('status', 'ok');
    });
});

describe('Lightdash API tests for member user with interactive_viewer project permissions', () => {
    let client: ApiClient;
    let email: string;

    beforeAll(async () => {
        // eslint-disable-next-line no-await-in-loop
        const perm = await loginWithPermissions('member', [
            {
                role: 'interactive_viewer',
                projectUuid: SEED_PROJECT.project_uuid,
            },
        ]);
        client = perm.client;
        email = perm.email;
    });

    it('Should identify user', async () => {
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.get<Body<{ email: string; role: string }>>(
            `${apiUrl}/user`,
        );
        expect(resp.status).toBe(200);
        expect(resp.body.results).toHaveProperty('email', email);
        expect(resp.body.results).toHaveProperty('role', 'member');
    });

    it('Should get forbidden (403) from PUT explores', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoint = `/projects/${projectUuid}/explores`;
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.put(`${apiUrl}${endpoint}`, [], {
            failOnStatusCode: false,
        });
        expect(resp.status).toBe(403);
    });

    it('Should get success response (200) from POST runQuery', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoint = `/projects/${projectUuid}/explores/customers/runQuery`;
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.post(`${apiUrl}${endpoint}`, runqueryBody);
        expect(resp.status).toBe(200);
        expect(resp.body).toHaveProperty('status', 'ok');
    });

    it('Should get forbidden error (403) from GET Scheduler logs', async () => {
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.get(
            `${apiUrl}/schedulers/${SEED_PROJECT.project_uuid}/logs`,
            { failOnStatusCode: false },
        );
        expect(resp.status).toBe(403);
    });

    it('Should get success response (200) from POST downloadCsv', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoint = `/projects/${projectUuid}/explores/customers/downloadCsv`;
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.post(`${apiUrl}${endpoint}`, {
            ...runqueryBody,
            onlyRaw: false,
            columnOrder: [],
            showTableNames: false,
        });
        expect(resp.status).toBe(200);
        expect(resp.body).toHaveProperty('status', 'ok');
    });

    it('Should get success response (200) from POST runUnderlyingDataQuery', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoint = `/projects/${projectUuid}/explores/customers/runUnderlyingDataQuery`;
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.post(`${apiUrl}${endpoint}`, runqueryBody);
        expect(resp.status).toBe(200);
        expect(resp.body).toHaveProperty('status', 'ok');
    });

    it('Should get success response (200) from POST chart results', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        // eslint-disable-next-line no-await-in-loop
        const spacesResponse = await client.get<Body<Array<{ uuid: string }>>>(
            `${apiUrl}/projects/${projectUuid}/charts`,
        );
        const savedChartUuid = spacesResponse.body.results[0].uuid;
        const endpoint = `/saved/${savedChartUuid}/results`;
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.post(`${apiUrl}${endpoint}`, undefined);
        expect(resp.status).toBe(200);
        expect(resp.body).toHaveProperty('status', 'ok');
    });

    it('Should get success response (200) from POST chart-and-results with filters', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        // eslint-disable-next-line no-await-in-loop
        const spacesResponse = await client.get<Body<Array<{ uuid: string }>>>(
            `${apiUrl}/projects/${projectUuid}/charts`,
        );
        const savedChartUuid = spacesResponse.body.results[0].uuid;
        const endpoint = `/saved/${savedChartUuid}/chart-and-results`;
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.post(`${apiUrl}${endpoint}`, {
            dashboardUuid: 'example',
            dashboardFilters: {
                metrics: [],
                dimensions: [],
                tableCalculations: [],
            },
            dashboardSorts: [],
        });
        expect(resp.status).toBe(200);
        expect(resp.body).toHaveProperty('status', 'ok');
    });

    it('Should get forbidden (403) from POST sqlQuery', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoint = `/projects/${projectUuid}/sqlQuery`;
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.post(`${apiUrl}${endpoint}`, sqlQueryBody, {
            failOnStatusCode: false,
        });
        expect(resp.status).toBe(403);
    });

    it('Should get a forbidden (403) from PATCH project', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoint = `${apiUrl}/projects/${projectUuid}`;
        // eslint-disable-next-line no-await-in-loop
        const projectResponse = await client.get<Body<unknown>>(endpoint);
        expect(projectResponse.status).toBe(200);

        // eslint-disable-next-line no-await-in-loop
        const resp = await client.patch<Body<unknown>>(
            endpoint,
            projectResponse.body.results,
            { failOnStatusCode: false },
        );
        expect(resp.status).toBe(403);
    });

    it('Should get a forbidden (403) from PATCH dashboard', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        // eslint-disable-next-line no-await-in-loop
        const projectResponse = await client.get<
            Body<Array<{ uuid: string; name: string }>>
        >(`${apiUrl}/projects/${projectUuid}/dashboards`);
        expect(projectResponse.status).toBe(200);

        const dashboardUuid = projectResponse.body.results[0].uuid;
        const endpoint = `${apiUrl}/dashboards/${dashboardUuid}`;
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.patch(
            endpoint,
            {
                name: 'test',
                tiles: [],
                filters: {
                    dimensions: [],
                    metrics: [],
                    tableCalculations: [],
                },
                tabs: [],
            },
            { failOnStatusCode: false },
        );
        expect(resp.status).toBe(403);
    });
});

describe('Lightdash API tests for member user with viewer project permissions', () => {
    let client: ApiClient;
    let email: string;

    beforeAll(async () => {
        // eslint-disable-next-line no-await-in-loop
        const perm = await loginWithPermissions('member', [
            {
                role: 'viewer',
                projectUuid: SEED_PROJECT.project_uuid,
            },
        ]);
        client = perm.client;
        email = perm.email;
    });

    it('Should identify user', async () => {
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.get<Body<{ email: string; role: string }>>(
            `${apiUrl}/user`,
        );
        expect(resp.status).toBe(200);
        expect(resp.body.results).toHaveProperty('email', email);
        expect(resp.body.results).toHaveProperty('role', 'member');
    });

    it('Should get success response (200) from GET public endpoints', async () => {
        const endpoints = ['/livez', '/health', '/flash'];
        for (const endpoint of endpoints) {
            // eslint-disable-next-line no-await-in-loop
            const resp = await client.get(`${apiUrl}${endpoint}`);
            expect(resp.status).toBe(200);
            expect(resp.body).toHaveProperty('status', 'ok');
        }
    });

    it('Should get success response (200) from GET projectRouter endpoints', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoints = [
            `/projects/${projectUuid}`,
            `/projects/${projectUuid}/explores`,
            `/projects/${projectUuid}/spaces`,
            `/projects/${projectUuid}/charts`,
            `/projects/${projectUuid}/dashboards`,
            `/projects/${projectUuid}/catalog`,
            `/projects/${projectUuid}/tablesConfiguration`,
            `/projects/${projectUuid}/hasSavedCharts`,
        ];
        for (const endpoint of endpoints) {
            // eslint-disable-next-line no-await-in-loop
            const resp = await client.get(`${apiUrl}${endpoint}`);
            expect(resp.status).toBe(200);
            expect(resp.body).toHaveProperty('status', 'ok');
        }
    });

    it('Should get forbidden error (403) from GET Scheduler logs', async () => {
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.get(
            `${apiUrl}/schedulers/${SEED_PROJECT.project_uuid}/logs`,
            { failOnStatusCode: false },
        );
        expect(resp.status).toBe(403);
    });

    it('Should get list of dashboards from projects', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.get<
            Body<Array<{ uuid: string; name: string }>>
        >(`${apiUrl}/projects/${projectUuid}/dashboards`);
        expect(resp.status).toBe(200);
        expect(resp.body).toHaveProperty('status', 'ok');
        expect(resp.body.results[0]).toHaveProperty('name', 'Jaffle dashboard');
    });

    it('Should get forbidden (403) from PUT explores', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoint = `/projects/${projectUuid}/explores`;
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.put(`${apiUrl}${endpoint}`, [], {
            failOnStatusCode: false,
        });
        expect(resp.status).toBe(403);
    });

    it('Should get forbidden (403) from POST runQuery', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoint = `/projects/${projectUuid}/explores/customers/runQuery`;
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.post(`${apiUrl}${endpoint}`, runqueryBody, {
            failOnStatusCode: false,
        });
        expect(resp.status).toBe(403);
    });

    it('Should get csv (200) from POST downloadCsv', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoint = `/projects/${projectUuid}/explores/customers/downloadCsv`;
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.post(
            `${apiUrl}${endpoint}`,
            {
                ...runqueryBody,
                onlyRaw: false,
                columnOrder: [],
                showTableNames: false,
            },
            { failOnStatusCode: false },
        );
        expect(resp.status).toBe(200);
    });

    it('Should get forbidden (403) from POST runUnderlyingDataQuery', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoint = `/projects/${projectUuid}/explores/customers/runUnderlyingDataQuery`;
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.post(`${apiUrl}${endpoint}`, runqueryBody, {
            failOnStatusCode: false,
        });
        expect(resp.status).toBe(403);
    });

    it('Should get success response (200) from POST chart results', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        // eslint-disable-next-line no-await-in-loop
        const spacesResponse = await client.get<Body<Array<{ uuid: string }>>>(
            `${apiUrl}/projects/${projectUuid}/charts`,
        );
        const savedChartUuid = spacesResponse.body.results[0].uuid;
        const endpoint = `/saved/${savedChartUuid}/results`;
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.post(`${apiUrl}${endpoint}`, undefined);
        expect(resp.status).toBe(200);
        expect(resp.body).toHaveProperty('status', 'ok');
    });

    it('Should get success response (200) from POST chart-and-results with filters', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        // eslint-disable-next-line no-await-in-loop
        const spacesResponse = await client.get<Body<Array<{ uuid: string }>>>(
            `${apiUrl}/projects/${projectUuid}/charts`,
        );
        const savedChartUuid = spacesResponse.body.results[0].uuid;
        const endpoint = `/saved/${savedChartUuid}/chart-and-results`;
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.post(`${apiUrl}${endpoint}`, {
            dashboardUuid: 'example',
            dashboardFilters: {
                metrics: [],
                dimensions: [],
                tableCalculations: [],
            },
            dashboardSorts: [],
        });
        expect(resp.status).toBe(200);
        expect(resp.body).toHaveProperty('status', 'ok');
    });

    it('Should get forbidden (403) from POST sqlQuery', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoint = `/projects/${projectUuid}/sqlQuery`;
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.post(`${apiUrl}${endpoint}`, sqlQueryBody, {
            failOnStatusCode: false,
        });
        expect(resp.status).toBe(403);
    });

    it('Should get a forbidden (403) from PATCH project', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoint = `${apiUrl}/projects/${projectUuid}`;
        // eslint-disable-next-line no-await-in-loop
        const projectResponse = await client.get<Body<unknown>>(endpoint);
        expect(projectResponse.status).toBe(200);

        // eslint-disable-next-line no-await-in-loop
        const resp = await client.patch<Body<unknown>>(
            endpoint,
            projectResponse.body.results,
            { failOnStatusCode: false },
        );
        expect(resp.status).toBe(403);
    });

    it('Should get a forbidden (403) from PATCH dashboard', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        // eslint-disable-next-line no-await-in-loop
        const projectResponse = await client.get<
            Body<Array<{ uuid: string; name: string }>>
        >(`${apiUrl}/projects/${projectUuid}/dashboards`);
        expect(projectResponse.status).toBe(200);

        const dashboardUuid = projectResponse.body.results[0].uuid;
        const endpoint = `${apiUrl}/dashboards/${dashboardUuid}`;
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.patch(
            endpoint,
            {
                name: 'test',
                tiles: [],
                filters: {
                    dimensions: [],
                    metrics: [],
                    tableCalculations: [],
                },
                tabs: [],
            },
            { failOnStatusCode: false },
        );
        expect(resp.status).toBe(403);
    });

    it('Should get success response (200) from GET savedChartRouter endpoints', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        // eslint-disable-next-line no-await-in-loop
        const projectResponse = await client.get<Body<Array<{ uuid: string }>>>(
            `${apiUrl}/projects/${projectUuid}/charts`,
        );
        expect(projectResponse.status).toBe(200);

        const savedChartUuid = projectResponse.body.results[0].uuid;
        const endpoints = [
            `/saved/${savedChartUuid}`,
            `/saved/${savedChartUuid}/availableFilters`,
        ];
        for (const endpoint of endpoints) {
            // eslint-disable-next-line no-await-in-loop
            const resp = await client.get(`${apiUrl}${endpoint}`);
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
        ];
        for (const endpoint of endpoints) {
            // eslint-disable-next-line no-await-in-loop
            const resp = await client.get(`${apiUrl}${endpoint}`);
            expect(resp.status).toBe(200);
            expect(resp.body).toHaveProperty('status', 'ok');
        }
    });

    it('Should get success response (200) from GET userRouter endpoints', async () => {
        const endpoints = [`/user`, `/user/identities`];
        for (const endpoint of endpoints) {
            // eslint-disable-next-line no-await-in-loop
            const resp = await client.get(`${apiUrl}${endpoint}`);
            expect(resp.status).toBe(200);
            expect(resp.body).toHaveProperty('status', 'ok');
        }
    });

    it('Should get success response (200) from GET dashboardRouter endpoints', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        // eslint-disable-next-line no-await-in-loop
        const projectResponse = await client.get<
            Body<Array<{ uuid: string; name: string }>>
        >(`${apiUrl}/projects/${projectUuid}/dashboards`);
        expect(projectResponse.status).toBe(200);

        const dashboardUuid = projectResponse.body.results[0].uuid;
        const endpoints = [`/dashboards/${dashboardUuid}`];
        for (const endpoint of endpoints) {
            // eslint-disable-next-line no-await-in-loop
            const resp = await client.get(`${apiUrl}${endpoint}`);
            expect(resp.status).toBe(200);
            expect(resp.body).toHaveProperty('status', 'ok');
        }
    });
});

describe('Lightdash API tests for member user with NO project permissions', () => {
    let client: ApiClient;
    let email: string;

    beforeAll(async () => {
        // eslint-disable-next-line no-await-in-loop
        const perm = await loginWithPermissions('member', []);
        client = perm.client;
        email = perm.email;
    });

    it('Should identify user', async () => {
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.get<Body<{ email: string; role: string }>>(
            `${apiUrl}/user`,
        );
        expect(resp.status).toBe(200);
        expect(resp.body.results).toHaveProperty('email', email);
        expect(resp.body.results).toHaveProperty('role', 'member');
    });

    it('Should get success response (200) from GET public endpoints', async () => {
        const endpoints = ['/livez', '/health', '/flash'];
        for (const endpoint of endpoints) {
            // eslint-disable-next-line no-await-in-loop
            const resp = await client.get(`${apiUrl}${endpoint}`);
            expect(resp.status).toBe(200);
            expect(resp.body).toHaveProperty('status', 'ok');
        }
    });

    it('Should get forbidden error (403) from project endpoints', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoints = [
            `/projects/${projectUuid}`,
            `/projects/${projectUuid}/explores`,
            `/projects/${projectUuid}/spaces`,
            `/projects/${projectUuid}/catalog`,
            `/projects/${projectUuid}/tablesConfiguration`,
            `/projects/${projectUuid}/hasSavedCharts`,
            `/schedulers/${projectUuid}/logs`,
        ];
        for (const endpoint of endpoints) {
            // eslint-disable-next-line no-await-in-loop
            const resp = await client.get(`${apiUrl}${endpoint}`, {
                failOnStatusCode: false,
            });
            expect(resp.status).toBe(403);
        }
    });

    it('Should get an empty list of dashboards from projects', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.get<
            Body<Array<{ uuid: string; name: string }>>
        >(`${apiUrl}/projects/${projectUuid}/dashboards`);
        expect(resp.status).toBe(200);
        expect(resp.body).toHaveProperty('status', 'ok');
        expect(resp.body.results).toHaveLength(0);
    });

    it('Should get forbidden (403) from PUT explores', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoint = `/projects/${projectUuid}/explores`;
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.put(`${apiUrl}${endpoint}`, [], {
            failOnStatusCode: false,
        });
        expect(resp.status).toBe(403);
    });

    it('Should get forbidden error (403) from POST runQuery', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoint = `/projects/${projectUuid}/explores/customers/runQuery`;
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.post(`${apiUrl}${endpoint}`, runqueryBody, {
            failOnStatusCode: false,
        });
        expect(resp.status).toBe(403);
    });

    it('Should get forbidden error (403) from POST sqlQuery', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoint = `/projects/${projectUuid}/sqlQuery`;
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.post(`${apiUrl}${endpoint}`, sqlQueryBody, {
            failOnStatusCode: false,
        });
        expect(resp.status).toBe(403);
    });

    it('Should get a forbidden (403) from PATCH project', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const endpoint = `${apiUrl}/projects/${projectUuid}`;
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.patch(
            endpoint,
            { name: 'test' },
            {
                failOnStatusCode: false,
            },
        );
        expect(resp.status).toBe(403);
    });

    it('Should get an empty project list (200) from GET /org/projects', async () => {
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.get<Body<unknown[]>>(
            `${apiUrl}/org/projects`,
            {
                failOnStatusCode: false,
            },
        );
        expect(resp.status).toBe(200);
        expect(resp.body).toHaveProperty('status', 'ok');
        expect(resp.body.results).toHaveLength(0);
    });

    it('Should get success response (200) from GET userRouter endpoints', async () => {
        const endpoints = [`/user`, `/user/identities`];
        for (const endpoint of endpoints) {
            // eslint-disable-next-line no-await-in-loop
            const resp = await client.get(`${apiUrl}${endpoint}`);
            expect(resp.status).toBe(200);
            expect(resp.body).toHaveProperty('status', 'ok');
        }
    });
});

describe('Lightdash API tests for project members access', () => {
    let admin: ApiClient;

    beforeAll(async () => {
        // eslint-disable-next-line no-await-in-loop
        admin = await login();
    });

    it('Should get project members access', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        // eslint-disable-next-line no-await-in-loop
        const resp = await admin.get<Body<ProjectMemberProfile[]>>(
            `${apiUrl}/projects/${projectUuid}/access`,
        );
        expect(resp.status).toBe(200);
        expect(resp.body.results.length).toBeGreaterThan(0);

        for (const member of resp.body.results) {
            // eslint-disable-next-line no-await-in-loop
            const resp2 = await admin.get<
                Body<{ userUuid: string; projectUuid: string; role: string }>
            >(`${apiUrl}/projects/${projectUuid}/user/${member.userUuid}`);
            expect(resp2.status).toBe(200);
            expect(resp2.body.results.userUuid).toBe(member.userUuid);
            expect(resp2.body.results.projectUuid).toBe(member.projectUuid);
            expect(resp2.body.results.role).toBe(member.role);
        }
    });

    it('Should not get project member access for user that gets access via the org role', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        // eslint-disable-next-line no-await-in-loop
        const resp = await admin.get(
            `${apiUrl}/projects/${projectUuid}/user/${SEED_ORG_1_ADMIN.user_uuid}`,
            { failOnStatusCode: false },
        );
        expect(resp.status).toBe(404);
    });
});
