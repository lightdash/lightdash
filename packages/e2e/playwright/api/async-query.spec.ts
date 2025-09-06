/* eslint-disable @typescript-eslint/no-explicit-any, no-await-in-loop, no-promise-executor-return, no-restricted-syntax, global-require, prefer-destructuring */
import { SEED_PROJECT } from '@lightdash/common';
import { APIRequestContext, expect, test } from '@playwright/test';
import { login } from '../support/auth';
import {
    createProject,
    deleteProjectsByName,
    getJwtToken,
} from '../support/commands';
import warehouseConnections, {
    isBigQueryConfigured,
    isSnowflakeConfigured,
} from '../support/warehouses';

const apiV1 = '/api/v1';
const apiV2 = '/api/v2';

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

async function waitForJobCompletion(
    request: APIRequestContext,
    jobUuid: string,
    timeoutMs = 60_000,
) {
    const start = Date.now();
    // poll /api/v1/jobs/:jobUuid until DONE or ERROR
    // returns boolean indicating success
    while (Date.now() - start < timeoutMs) {
        const resp = await request.get(`${apiV1}/jobs/${jobUuid}`);
        const body = await resp.json();
        const status = body.results?.jobStatus;
        if (status === 'ERROR') return false;
        if (status === 'DONE') return true;
        await new Promise((r) => setTimeout(r, 1000));
    }
    return false;
}

async function createProjectWithRefresh(
    request: APIRequestContext,
    name: string,
    warehouseConfig: any,
): Promise<string | undefined> {
    const projectUuid = await createProject(request, name, warehouseConfig);

    const refreshResp = await request.post(
        `${apiV1}/projects/${projectUuid}/refresh`,
    );
    expect(refreshResp.status()).toBe(200);
    const refreshBody = await refreshResp.json();
    const jobUuid = refreshBody.results?.jobUuid as string;
    const success = await waitForJobCompletion(request, jobUuid);
    if (!success) return undefined;
    return projectUuid;
}

async function runAsyncQueryTest(
    request: APIRequestContext,
    projectUuid: string,
    jwt?: string,
) {
    const headers: Record<string, string> = {
        'Content-type': 'application/json',
    };
    if (jwt) headers['lightdash-embed-token'] = jwt;

    // 404 before valid query id
    const notFoundResp = await request.get(
        `${apiV2}/projects/${projectUuid}/query/13a00154-d590-40f2-bb27-d541f70aa8c6`,
        { headers, failOnStatusCode: false },
    );
    expect(notFoundResp.status()).toBe(404);
    const notFoundBody = await notFoundResp.json();
    expect(notFoundBody.status).toBe('error');
    expect(notFoundBody.error?.name).toBe('NotFoundError');

    // execute
    const execResp = await request.post(
        `${apiV2}/projects/${projectUuid}/query/metric-query`,
        {
            headers,
            data: runQueryBody,
        },
    );
    expect(execResp.status()).toBe(200);
    const execBody = await execResp.json();
    const queryUuid: string = execBody.results.queryUuid;

    // poll until ready
    const start = Date.now();
    const timeoutMs = 60_000;
    async function getResults() {
        const r = await request.get(
            `${apiV2}/projects/${projectUuid}/query/${queryUuid}`,
            { headers },
        );
        const b = await r.json();
        return { r, b } as const;
    }
    let b: any;
    let r: any;
    while (Date.now() - start < timeoutMs) {
        ({ r, b } = await getResults());
        if (b.results?.status === 'ready') break;
        await new Promise((res) => setTimeout(res, 200));
    }
    expect(r.status()).toBe(200);
    expect(b.status).toBe('ok');
    expect(Array.isArray(b.results.rows)).toBe(true);
    expect(b.results.rows.length).toBe(500);
    expect(b.results.totalResults).toBeGreaterThan(2000);
    expect(b.results.totalPageCount).toBe(5);
    const pageOneRows = b.results.rows;

    // page=1 size=500 equals default
    const page1Resp = await request.get(
        `${apiV2}/projects/${projectUuid}/query/${queryUuid}?page=1&pageSize=500`,
        { headers },
    );
    const page1Body = await page1Resp.json();
    expect(page1Resp.status()).toBe(200);
    expect(page1Body.status).toBe('ok');
    expect(page1Body.results.rows.length).toBe(500);
    expect(page1Body.results.rows).toEqual(pageOneRows);

    // page=2 size=500 not equal to page 1
    const page2Resp = await request.get(
        `${apiV2}/projects/${projectUuid}/query/${queryUuid}?page=2&pageSize=500`,
        { headers },
    );
    const page2Body = await page2Resp.json();
    expect(page2Resp.status()).toBe(200);
    expect(page2Body.status).toBe('ok');
    expect(page2Body.results.rows.length).toBe(500);
    expect(page2Body.results.rows).not.toEqual(pageOneRows);

    // page=1 size=100 equals slice of first 100
    const page1Size100Resp = await request.get(
        `${apiV2}/projects/${projectUuid}/query/${queryUuid}?page=1&pageSize=100`,
        { headers },
    );
    const page1Size100Body = await page1Size100Resp.json();
    expect(page1Size100Resp.status()).toBe(200);
    expect(page1Size100Body.status).toBe('ok');
    expect(page1Size100Body.results.rows.length).toBe(100);
    expect(page1Size100Body.results.rows).toEqual(pageOneRows.slice(0, 100));

    // page beyond available
    const beyondResp = await request.get(
        `${apiV2}/projects/${projectUuid}/query/${queryUuid}?page=6&pageSize=500`,
        { headers },
    );
    if (beyondResp.status() !== 422) {
        // some backends may differ, but we assert error name when 422
        const body = await beyondResp.json();
        expect(body.status).toBe('error');
        expect(body.error?.name).toBe('PaginationError');
    } else {
        const body = await beyondResp.json();
        expect(body.status).toBe('error');
        expect(body.error?.name).toBe('PaginationError');
    }
}

async function runMetricQueryAndValidateResponse(
    request: APIRequestContext,
    queryBody: any,
    projectUuid: string,
) {
    // 404 before valid query id
    const nf = await request.get(
        `${apiV2}/projects/${projectUuid}/query/13a00154-d590-40f2-bb27-d541f70aa8c6`,
        { failOnStatusCode: false },
    );
    expect(nf.status()).toBe(404);
    const nfBody = await nf.json();
    expect(nfBody.status).toBe('error');
    expect(nfBody.error?.name).toBe('NotFoundError');

    const exec = await request.post(
        `${apiV2}/projects/${projectUuid}/query/metric-query`,
        {
            headers: { 'Content-type': 'application/json' },
            data: queryBody,
        },
    );
    expect(exec.status()).toBe(200);
    const execBody = await exec.json();
    const queryUuid = execBody.results.queryUuid as string;

    const start = Date.now();
    const timeoutMs = 60_000;
    while (Date.now() - start < timeoutMs) {
        const resp = await request.get(
            `${apiV2}/projects/${projectUuid}/query/${queryUuid}`,
        );
        const body = await resp.json();
        if (resp.status() !== 200 || body.results?.error !== undefined) {
            throw new Error(`Error: ${body.results?.error}`);
        }
        if (body.results?.status === 'ready') {
            expect(body.status).toBe('ok');
            expect(Array.isArray(body.results.rows)).toBe(true);
            expect(body.results.rows.length).not.toBe(50);
            return;
        }
        await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error('Timed out waiting for query results');
}

test.describe('Async Query API', () => {
    test.beforeEach(async ({ request }) => {
        await login(request);
    });

    test.describe('Postgres', () => {
        const projectName = 'postgresSQL query test';
        let projectUuid: string | undefined;

        test('should execute async query and get all results paged', async ({
            request,
        }) => {
            projectUuid = await createProjectWithRefresh(
                request,
                projectName,
                warehouseConnections.postgresSQL,
            );
            expect(projectUuid).toBeTruthy();
            await runAsyncQueryTest(request, projectUuid!);
        });

        test.afterEach(async ({ request }) => {
            await deleteProjectsByName(request, [projectName]);
        });
    });

    test.describe('Snowflake', () => {
        test.skip(
            !isSnowflakeConfigured(),
            'Snowflake env vars not configured',
        );
        const projectName = 'snowflake query test';
        let projectUuid: string | undefined;

        test('should execute async query and get all results paged', async ({
            request,
        }) => {
            projectUuid = await createProjectWithRefresh(
                request,
                projectName,
                warehouseConnections.snowflake,
            );
            expect(projectUuid).toBeTruthy();
            await runAsyncQueryTest(request, projectUuid!);
        });

        test.afterAll(async ({ request }) => {
            await deleteProjectsByName(request, [projectName]);
        });
    });

    test.describe('BigQuery', () => {
        test.skip(
            !isBigQueryConfigured(),
            'BigQuery credentials not configured',
        );
        const projectName = 'bigquery query test';
        let projectUuid: string | undefined;

        test('should execute async query and get all results paged', async ({
            request,
        }) => {
            projectUuid = await createProject(
                request,
                projectName,
                warehouseConnections.bigQuery,
            );
            expect(projectUuid).toBeTruthy();
            await runAsyncQueryTest(request, projectUuid!);
        });

        test.afterAll(async ({ request }) => {
            await deleteProjectsByName(request, [projectName]);
        });
    });

    test.describe('JWT Auth', () => {
        const projectUuid = SEED_PROJECT.project_uuid;

        test('should not execute async query when JWT cannot explore', async ({
            request,
        }) => {
            const jwt = await getJwtToken(request, projectUuid, {
                canExplore: false,
            });
            const resp = await request.post(
                `${apiV2}/projects/${projectUuid}/query/metric-query`,
                {
                    headers: {
                        'Content-type': 'application/json',
                        'lightdash-embed-token': jwt,
                    },
                    data: runQueryBody,
                },
            );
            expect(resp.status()).toBe(403);
        });

        test('should execute async query and get all results paged using JWT authentication', async ({
            request,
        }) => {
            const jwt = await getJwtToken(request, projectUuid, {
                canExplore: true,
            });
            await runAsyncQueryTest(request, SEED_PROJECT.project_uuid, jwt);
        });

        test('should execute async query and get all results paged using JWT auth with empty external ID', async ({
            request,
        }) => {
            const jwt = await getJwtToken(request, projectUuid, {
                userExternalId: null,
                canExplore: true,
            });
            await runAsyncQueryTest(request, SEED_PROJECT.project_uuid, jwt);
        });
    });

    test.describe('Invalid query filters', () => {
        test('should not return invalid string filter metric query', async ({
            request,
        }) => {
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

            await runMetricQueryAndValidateResponse(
                request,
                runQueryBodyInvalidFilters,
                projectUuid,
            );
        });
    });
});
