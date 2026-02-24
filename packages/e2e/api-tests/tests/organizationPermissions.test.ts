import {
    CreateWarehouseCredentials,
    DbtProjectType,
    DbtVersionOptionLatest,
    MetricQuery,
    ProjectType,
    SEED_PROJECT,
    WarehouseTypes,
    type CreateProject,
} from '@lightdash/common';
import { ApiClient, Body } from '../helpers/api-client';
import { anotherLogin, login, loginWithPermissions } from '../helpers/auth';

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

const postgresCredentials: CreateWarehouseCredentials = {
    host: process.env.PGHOST || 'db-dev',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'password',
    dbname: 'postgres',
    schema: 'jaffle',
    port: 5432,
    sslmode: 'disable',
    type: WarehouseTypes.POSTGRES,
};

describe('Lightdash API organization permission tests', () => {
    let other: ApiClient;

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
        // eslint-disable-next-line no-restricted-syntax
        for (const endpoint of endpoints) {
            // eslint-disable-next-line no-await-in-loop
            const resp = await other.get(`${apiUrl}${endpoint}`, {
                failOnStatusCode: false,
            });
            expect(resp.status).toBe(403);
        }
    });

    it('Should get a forbidden error (403) from PATCH project', async () => {
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

    it('Should get forbidden error (403) from GET savedChart endpoints from another organization', async () => {
        const admin = await login();
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
        // eslint-disable-next-line no-restricted-syntax
        for (const endpoint of endpoints) {
            // eslint-disable-next-line no-await-in-loop
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
        const admin = await login();
        const projectUuid = SEED_PROJECT.project_uuid;
        const projectResponse = await admin.get<Body<Array<{ uuid: string }>>>(
            `${apiUrl}/projects/${projectUuid}/dashboards`,
        );
        expect(projectResponse.status).toBe(200);

        const dashboardUuid = projectResponse.body.results[0].uuid;
        const endpoints = [`/dashboards/${dashboardUuid}`];
        // eslint-disable-next-line no-restricted-syntax
        for (const endpoint of endpoints) {
            // eslint-disable-next-line no-await-in-loop
            const resp = await other.get(`${apiUrl}${endpoint}`, {
                failOnStatusCode: false,
            });
            expect(resp.status).toBe(403);
        }
    });

    it('Should get forbidden error (403) from PATCH dashboard', async () => {
        const admin = await login();
        const projectUuid = SEED_PROJECT.project_uuid;
        const projectResponse = await admin.get<Body<Array<{ uuid: string }>>>(
            `${apiUrl}/projects/${projectUuid}/dashboards`,
        );
        expect(projectResponse.status).toBe(200);

        const dashboardUuid = projectResponse.body.results[0].uuid;
        const endpoint = `${apiUrl}/dashboards/${dashboardUuid}`;

        const resp = await other.patch(
            endpoint,
            {
                name: '',
                filters: {
                    metrics: [],
                    dimensions: [],
                },
                tiles: [],
            },
            { failOnStatusCode: false },
        );
        expect(resp.status).toBe(403);
    });
});

describe('Lightdash API tests for organization on different roles', () => {
    const roles = [
        'admin',
        'developer',
        'editor',
        'interactive_viewer',
        'viewer',
        'member',
    ];

    // eslint-disable-next-line no-restricted-syntax
    for (const role of roles) {
        describe(`org user with '${role}' role`, () => {
            let client: ApiClient;
            let email: string;

            beforeAll(async () => {
                const perm = await loginWithPermissions(role, []);
                client = perm.client;
                email = perm.email;
            });

            it('Should identify user', async () => {
                const resp = await client.get<
                    Body<{ email: string; role: string }>
                >(`${apiUrl}/user`);
                expect(resp.status).toBe(200);
                expect(resp.body.results).toHaveProperty('email', email);
                expect(resp.body.results).toHaveProperty('role', role);
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

            it('Should get success response (200) from GET org', async () => {
                const endpoint = `${apiUrl}/org/`;
                const resp = await client.get(endpoint);
                expect(resp.status).toBe(200);
            });

            it('Should get success response (200) from GET userRouter endpoints', async () => {
                const endpoints = [`/user`, `/user/identities`];
                // eslint-disable-next-line no-restricted-syntax
                for (const endpoint of endpoints) {
                    // eslint-disable-next-line no-await-in-loop
                    const resp = await client.get(`${apiUrl}${endpoint}`);
                    expect(resp.status).toBe(200);
                    expect(resp.body).toHaveProperty('status', 'ok');
                }
            });
        });
    }
});

describe('Lightdash API tests for project creation permissions', () => {
    const rolePermissions = [
        {
            role: 'admin',
            canCreateProject: true,
            canCreatePreview: true,
        },
        {
            role: 'developer',
            canCreateProject: false,
            canCreatePreview: true,
        },
        {
            role: 'editor',
            canCreateProject: false,
            canCreatePreview: false,
        },
        {
            role: 'interactive_viewer',
            canCreateProject: false,
            canCreatePreview: false,
        },
        {
            role: 'viewer',
            canCreateProject: false,
            canCreatePreview: false,
        },
        {
            role: 'member',
            canCreateProject: false,
            canCreatePreview: false,
        },
    ];

    // eslint-disable-next-line no-restricted-syntax
    for (const {
        role,
        canCreatePreview,
        canCreateProject,
    } of rolePermissions) {
        describe(`org user with '${role}' role`, () => {
            let client: ApiClient;
            let email: string;

            beforeAll(async () => {
                const perm = await loginWithPermissions(role, []);
                client = perm.client;
                email = perm.email;
            });

            it('should get a parameter error when sending POST to project with DEFAULT and an UPSTREAM', async () => {
                const endpoint = `${apiUrl}/org/projects/`;
                const body: CreateProject = {
                    type: ProjectType.DEFAULT,
                    upstreamProjectUuid: 'uuid',
                    dbtConnection: {
                        type: DbtProjectType.NONE,
                    },
                    dbtVersion: DbtVersionOptionLatest.LATEST,
                    warehouseConnection: postgresCredentials,
                    name: 'testProject',
                };

                const resp = await client.post(endpoint, body, {
                    failOnStatusCode: false,
                });
                expect(resp.status).toBe(400);
            });

            if (!canCreateProject) {
                it('Should get a forbidden error (403) from POST project', async () => {
                    const endpoint = `${apiUrl}/org/projects/`;
                    const body: CreateProject = {
                        type: ProjectType.DEFAULT,
                        dbtConnection: {
                            type: DbtProjectType.NONE,
                        },
                        dbtVersion: DbtVersionOptionLatest.LATEST,
                        warehouseConnection: postgresCredentials,
                        name: 'testProject',
                    };

                    const resp = await client.post(endpoint, body, {
                        failOnStatusCode: false,
                    });
                    expect(resp.status).toBe(403);
                });
            }

            if (!canCreatePreview) {
                it('Should get a forbidden error (403) from POST preview project', async () => {
                    const endpoint = `${apiUrl}/org/projects/`;
                    const body: CreateProject = {
                        type: ProjectType.PREVIEW,
                        dbtConnection: {
                            type: DbtProjectType.NONE,
                        },
                        dbtVersion: DbtVersionOptionLatest.LATEST,
                        warehouseConnection: postgresCredentials,
                        name: 'testPreviewProject',
                    };

                    const resp = await client.post(endpoint, body, {
                        failOnStatusCode: false,
                    });
                    expect(resp.status).toBe(403);
                });
            }
        });
    }
});
