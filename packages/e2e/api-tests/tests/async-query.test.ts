import {
    CreateEmbedJwt,
    SEED_PROJECT,
    WarehouseTypes,
} from '@lightdash/common';
import fs from 'fs';
import path from 'path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ApiClient, Body } from '../helpers/api-client';
import { login } from '../helpers/auth';

const apiUrl = '/api/v2';

const runQueryBody = {
    context: 'exploreView',
    query: {
        exploreName: 'events',
        dimensions: ['events_event_tier', 'events_event_id'],
        metrics: ['events_count', 'events_in_dkk'],
        filters: {},
        sorts: [
            {
                fieldId: 'events_count',
                descending: true,
            },
        ],
        limit: 2500,
        tableCalculations: [],
        additionalMetrics: [],
        metricOverrides: {},
    },
};

// Postgres warehouse config
const postgresConfig = {
    host: process.env.PGHOST || 'db-dev',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'password',
    dbname: 'postgres',
    schema: 'jaffle',
    port: 5432,
    sslmode: 'disable',
    type: WarehouseTypes.POSTGRES,
};

/**
 * Create a project via the API and return its UUID.
 */
async function createProject(
    client: ApiClient,
    projectName: string,
    warehouseConfig: Record<string, unknown>,
): Promise<string> {
    const resp = await client.post<{
        results: { project: { projectUuid: string } };
    }>('/api/v1/org/projects', {
        name: projectName,
        type: 'DEFAULT',
        dbtConnection: {
            target: '',
            environment: [],
            type: 'dbt',
            project_dir: process.env.DBT_PROJECT_DIR || '/usr/app/dbt',
        },
        dbtVersion: 'v1.7',
        warehouseConnection: warehouseConfig,
    });
    expect(resp.status).toBe(200);
    return resp.body.results.project.projectUuid;
}

/**
 * Wait for a v1 job to complete (used for project refresh).
 */
async function waitForV1JobCompletion(
    client: ApiClient,
    jobUuid: string,
    maxRetries = 60,
): Promise<boolean> {
    for (let i = 0; i < maxRetries; i++) {
        const resp = await client.get<any>(`/api/v1/jobs/${jobUuid}`);
        const { jobStatus } = resp.body.results;
        if (jobStatus === 'ERROR') {
            return false;
        }
        if (jobStatus === 'DONE') {
            return true;
        }
        await new Promise((r) => setTimeout(r, 1000));
    }
    return false;
}

/**
 * Create a project and refresh it, returning the UUID or undefined on failure.
 */
async function createAndRefreshProject(
    client: ApiClient,
    name: string,
    config: Record<string, unknown>,
): Promise<string | undefined> {
    const projectUuid = await createProject(client, name, config);

    const refreshResp = await client.post(
        `/api/v1/projects/${projectUuid}/refresh`,
    );
    expect(refreshResp.status).toBe(200);
    const { jobUuid } = (refreshResp.body as { results: { jobUuid: string } })
        .results;

    const success = await waitForV1JobCompletion(client, jobUuid);
    if (!success) {
        return undefined;
    }
    return projectUuid;
}

/**
 * Delete projects by name.
 */
async function deleteProjectsByName(
    client: ApiClient,
    names: string[],
): Promise<void> {
    const resp = await client.get<{
        results: { projectUuid: string; name: string }[];
    }>('/api/v1/org/projects');
    expect(resp.status).toBe(200);
    for (const project of resp.body.results) {
        if (names.includes(project.name)) {
            await client.delete(`/api/v1/org/projects/${project.projectUuid}`);
        }
    }
}

/**
 * Poll for async query results until ready.
 */
type QueryResultsBody = Body<{
    status: string;
    rows: unknown[];
    totalResults: number;
    totalPageCount: number;
}>;

async function pollQueryResults(
    client: ApiClient,
    projectUuid: string,
    queryUuid: string,
    headers?: Record<string, string>,
    maxRetries = 30,
): Promise<{ ok: boolean; status: number; body: QueryResultsBody }> {
    // eslint-disable-next-line no-plusplus
    for (let i = 0; i < maxRetries; i++) {
        const resp = await client.get<QueryResultsBody>(
            `${apiUrl}/projects/${projectUuid}/query/${queryUuid}`,
            { headers },
        );
        if (resp.body.results.status === 'ready') {
            return resp;
        }
        await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error('Query did not complete in time');
}

/**
 * Get a JWT token for embed testing.
 */
async function getJwtToken(
    client: ApiClient,
    projectUuid: string,
    options: {
        userEmail?: string;
        userExternalId?: string | null;
        canExportCsv?: boolean;
        canExportImages?: boolean;
        canExportPagePdf?: boolean;
        canDateZoom?: boolean;
        canExplore?: boolean;
    } = {},
): Promise<string> {
    const {
        userEmail = 'test@example.com',
        userExternalId = 'test-user-123',
        canExportCsv = false,
        canExportImages = false,
        canExportPagePdf = false,
        canDateZoom = false,
        canExplore = false,
    } = options;

    // Get a dashboard UUID from the project
    const dashboardsResp = await client.get<Body<Array<{ uuid: string }>>>(
        `/api/v1/projects/${projectUuid}/dashboards`,
    );
    expect(dashboardsResp.status).toBe(200);
    const dashboards = dashboardsResp.body.results;
    expect(dashboards.length).toBeGreaterThan(0);
    const dashboardUuid = dashboards[0].uuid;

    // Get embed configuration
    const configResp = await client.get<Body<unknown>>(
        `/api/v1/embed/${projectUuid}/config`,
    );
    expect(configResp.status).toBe(200);

    // Create JWT data
    const jwtData: CreateEmbedJwt = {
        content: {
            type: 'dashboard',
            projectUuid,
            dashboardUuid,
            canExportCsv,
            canExportImages,
            canExportPagePdf,
            canDateZoom,
            canExplore,
        },
        userAttributes: {
            email: userEmail,
            externalId: userExternalId || '',
        },
        user: {
            email: userEmail,
            externalId: userExternalId || undefined,
        },
        expiresIn: '1h',
    };

    // Create embed URL to get the JWT token
    const embedUrlResp = await client.post<Body<{ url: string }>>(
        `/api/v1/embed/${projectUuid}/get-embed-url`,
        jwtData,
    );
    expect(embedUrlResp.status).toBe(200);

    // Extract JWT token from the URL (it's in the hash fragment)
    const { url } = embedUrlResp.body.results;
    const jwtToken = url.split('#')[1];
    return jwtToken;
}

/**
 * Helper function for the async query test logic.
 */
async function runAsyncQueryTest(
    client: ApiClient,
    projectUuid: string | undefined,
    jwt?: string,
): Promise<void> {
    if (!projectUuid) {
        throw new Error('Project UUID is undefined, cannot run test');
    }

    const extraHeaders: Record<string, string> = {};
    if (jwt) {
        extraHeaders['lightdash-embed-token'] = jwt;
    }

    // Check that fetching the query before having a valid query id returns 404
    const notFoundResp = await client.get<{
        status: string;
        error: { name: string; message: string };
    }>(
        `${apiUrl}/projects/${projectUuid}/query/13a00154-d590-40f2-bb27-d541f70aa8c6`,
        { failOnStatusCode: false, headers: extraHeaders },
    );
    expect(notFoundResp.status).toBe(404);
    expect(notFoundResp.body).toHaveProperty('status', 'error');
    expect(notFoundResp.body).toHaveProperty('error');
    expect(notFoundResp.body.error.name).toBe('NotFoundError');

    // Execute the async query
    const executeResp = await client.post<Body<{ queryUuid: string }>>(
        `${apiUrl}/projects/${projectUuid}/query/metric-query`,
        runQueryBody,
        { headers: extraHeaders },
    );
    expect(executeResp.status).toBe(200);
    expect(executeResp.body).toHaveProperty('status', 'ok');
    expect(executeResp.body.results).toHaveProperty('queryUuid');

    const { queryUuid } = executeResp.body.results;

    // Poll for results until ready (default results)
    const resultsResp = await pollQueryResults(
        client,
        projectUuid,
        queryUuid,
        extraHeaders,
    );
    expect(resultsResp.status).toBe(200);
    expect(resultsResp.body).toHaveProperty('status', 'ok');
    expect(resultsResp.body.results).toHaveProperty('rows');
    expect(resultsResp.body.results.rows).toBeInstanceOf(Array);
    expect(resultsResp.body.results.rows.length).toBe(500);
    expect(resultsResp.body.results.totalResults).toBeGreaterThan(2000);
    // ~ 2007 / 500 = 5 pages
    expect(resultsResp.body.results.totalPageCount).toBe(5);
    const pageOneResults = resultsResp.body.results.rows;

    // Get the right number of results in a page, check the page content
    const page1Resp = await client.get<QueryResultsBody>(
        `${apiUrl}/projects/${projectUuid}/query/${queryUuid}?page=1&pageSize=500`,
        { headers: extraHeaders },
    );
    expect(page1Resp.status).toBe(200);
    expect(page1Resp.body).toHaveProperty('status', 'ok');
    expect(page1Resp.body.results).toHaveProperty('rows');
    expect(page1Resp.body.results.rows).toBeInstanceOf(Array);
    expect(page1Resp.body.results.rows.length).toBe(500);
    // Should be the same rows as the default
    expect(page1Resp.body.results.rows).toEqual(pageOneResults);

    // Get page 2
    const page2Resp = await client.get<QueryResultsBody>(
        `${apiUrl}/projects/${projectUuid}/query/${queryUuid}?page=2&pageSize=500`,
        { headers: extraHeaders },
    );
    expect(page2Resp.status).toBe(200);
    expect(page2Resp.body).toHaveProperty('status', 'ok');
    expect(page2Resp.body.results).toHaveProperty('rows');
    expect(page2Resp.body.results.rows).toBeInstanceOf(Array);
    expect(page2Resp.body.results.rows.length).toBe(500);
    // Should NOT be the same rows as the default
    expect(page2Resp.body.results.rows).not.toEqual(pageOneResults);

    // Get the first 100 results and check the content against the saved 1st 100
    const first100Resp = await client.get<QueryResultsBody>(
        `${apiUrl}/projects/${projectUuid}/query/${queryUuid}?page=1&pageSize=100`,
        { headers: extraHeaders },
    );
    expect(first100Resp.status).toBe(200);
    expect(first100Resp.body).toHaveProperty('status', 'ok');
    expect(first100Resp.body.results).toHaveProperty('rows');
    expect(first100Resp.body.results.rows).toBeInstanceOf(Array);
    expect(first100Resp.body.results.rows.length).toBe(100);
    // Should be the same as the first 100 rows from pageOneResults
    expect(first100Resp.body.results.rows).toEqual(
        pageOneResults.slice(0, 100),
    );

    // Request page beyond available results
    const beyondResp = await client.get<{
        status: string;
        error: { name: string; message: string };
    }>(
        `${apiUrl}/projects/${projectUuid}/query/${queryUuid}?page=6&pageSize=500`,
        { failOnStatusCode: false, headers: extraHeaders },
    );
    expect(beyondResp.status).toBe(422);
    expect(beyondResp.body).toHaveProperty('status', 'error');
    expect(beyondResp.body).toHaveProperty('error');
    expect(beyondResp.body.error.name).toBe('PaginationError');
}

describe('Async Query API', () => {
    let admin: ApiClient;

    beforeAll(async () => {
        admin = await login();
    });

    describe('Postgres', () => {
        let projectUuid: string | undefined;
        const projectName = 'postgresSQL query test';

        afterAll(async () => {
            if (projectUuid) {
                await deleteProjectsByName(admin, [projectName]);
            }
        });

        it('should execute async query and get all results paged', async () => {
            projectUuid = await createAndRefreshProject(
                admin,
                projectName,
                postgresConfig,
            );
            await runAsyncQueryTest(admin, projectUuid);
        }, 120_000);
    });

    describe.skipIf(!process.env.SNOWFLAKE_ACCOUNT)('Snowflake', () => {
        let projectUuid: string | undefined;
        const projectName = 'snowflakeSQL query test';

        afterAll(async () => {
            if (projectUuid) {
                await deleteProjectsByName(admin, [projectName]);
            }
        });

        it('should execute async query and get all results paged', async () => {
            projectUuid = await createAndRefreshProject(admin, projectName, {
                account: process.env.SNOWFLAKE_ACCOUNT,
                user: process.env.SNOWFLAKE_USER,
                password: process.env.SNOWFLAKE_PASSWORD,
                role: 'SYSADMIN',
                database: 'SNOWFLAKE_DATABASE_STAGING',
                warehouse: 'TESTING',
                schema: 'JAFFLE',
                type: WarehouseTypes.SNOWFLAKE,
            });
            await runAsyncQueryTest(admin, projectUuid);
        }, 120_000);
    });

    describe.skipIf(
        (() => {
            const credPath = path.resolve(
                __dirname,
                '../../cypress/fixtures/credentials.json',
            );
            if (!fs.existsSync(credPath)) return true;
            const creds = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
            return !creds.private_key;
        })(),
    )('BigQuery', () => {
        let projectUuid: string | undefined;
        const projectName = 'bigQuerySQL query test';

        afterAll(async () => {
            if (projectUuid) {
                await deleteProjectsByName(admin, [projectName]);
            }
        });

        it('should execute async query and get all results paged', async () => {
            const keyfileContents = JSON.parse(
                fs.readFileSync(
                    path.resolve(
                        __dirname,
                        '../../cypress/fixtures/credentials.json',
                    ),
                    'utf-8',
                ),
            );
            projectUuid = await createAndRefreshProject(admin, projectName, {
                project: 'lightdash-database-staging',
                location: 'europe-west1',
                dataset: 'e2e_jaffle_shop',
                keyfileContents,
                type: WarehouseTypes.BIGQUERY,
            });
            await runAsyncQueryTest(admin, projectUuid);
        }, 120_000);
    });

    describe('JWT Auth', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        let embedEnabled = true;

        beforeAll(async () => {
            const configResp = await admin.get<Body<unknown>>(
                `/api/v1/embed/${projectUuid}/config`,
                { failOnStatusCode: false },
            );
            if (configResp.status === 403) {
                embedEnabled = false;
            }
        });

        beforeEach((ctx) => {
            if (!embedEnabled) ctx.skip();
        });

        it('should not execute async query when JWT cannot explore', async () => {
            const jwt = await getJwtToken(admin, projectUuid, {
                canExplore: false,
            });

            const resp = await admin.post<Body<unknown>>(
                `${apiUrl}/projects/${projectUuid}/query/metric-query`,
                runQueryBody,
                {
                    failOnStatusCode: false,
                    headers: { 'lightdash-embed-token': jwt },
                },
            );
            expect(resp.status).toBe(403);
        });

        it('should execute async query and get all results paged using JWT authentication', async () => {
            const jwt = await getJwtToken(admin, projectUuid, {
                canExplore: true,
            });
            await runAsyncQueryTest(admin, SEED_PROJECT.project_uuid, jwt);
        }, 120_000);

        it('should execute async query and get all results paged using JWT authentication empty external ID', async () => {
            const jwt = await getJwtToken(admin, projectUuid, {
                userExternalId: null,
                canExplore: true,
            });
            await runAsyncQueryTest(admin, SEED_PROJECT.project_uuid, jwt);
        }, 120_000);
    });

    describe('Invalid query filters', () => {
        it('should not return invalid string filter metric query', async () => {
            const projectUuid = SEED_PROJECT.project_uuid;

            const runQueryBodyInvalidFilters = {
                context: 'exploreView',
                query: {
                    exploreName: 'events',
                    dimensions: ['events_event_tier', 'events_event_id'],
                    metrics: ['events_count', 'events_in_dkk'],
                    filters: {
                        dimensions: {
                            id: '7e750e7c-8098-4a90-b364-4e935ad7a7e9',
                            and: [
                                {
                                    id: 'd69d3ba0-6ff5-4437-9ef3-4ed69006ea2e',
                                    target: {
                                        fieldId: 'events_event_tier',
                                    },
                                    operator: 'equals',
                                    values: ["\\') OR (1=1) --"],
                                },
                            ],
                        },
                    },
                    sorts: [
                        {
                            fieldId: 'events_count',
                            descending: true,
                        },
                    ],
                    limit: 50,
                    tableCalculations: [],
                    additionalMetrics: [],
                    metricOverrides: {},
                },
            };

            // Check that fetching the query before having a valid query id returns 404
            const notFoundResp = await admin.get<{
                status: string;
                error: { name: string; message: string };
            }>(
                `${apiUrl}/projects/${projectUuid}/query/13a00154-d590-40f2-bb27-d541f70aa8c6`,
                { failOnStatusCode: false },
            );
            expect(notFoundResp.status).toBe(404);
            expect(notFoundResp.body).toHaveProperty('status', 'error');
            expect(notFoundResp.body).toHaveProperty('error');
            expect(notFoundResp.body.error.name).toBe('NotFoundError');

            // Execute the query
            const executeResp = await admin.post<Body<{ queryUuid: string }>>(
                `${apiUrl}/projects/${projectUuid}/query/metric-query`,
                runQueryBodyInvalidFilters,
            );
            expect(executeResp.status).toBe(200);
            expect(executeResp.body).toHaveProperty('status', 'ok');
            expect(executeResp.body.results).toHaveProperty('queryUuid');

            const { queryUuid } = executeResp.body.results;

            // Poll for results until ready
            const resultsResp = await pollQueryResults(
                admin,
                projectUuid,
                queryUuid,
            );

            expect(resultsResp.status).toBe(200);
            expect(resultsResp.body).toHaveProperty('status', 'ok');
            expect(resultsResp.body.results).toHaveProperty('rows');
            expect(resultsResp.body.results.rows).toBeInstanceOf(Array);
            expect(resultsResp.body.results.rows.length).not.toBe(50);
        });
    });
});
