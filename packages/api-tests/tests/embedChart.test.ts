import { CreateEmbedJwt, SEED_PROJECT, UpdateEmbed } from '@lightdash/common';
import { ApiClient, Body } from '../helpers/api-client';
import { anotherLogin, login } from '../helpers/auth';

const EMBED_API_PREFIX = `/api/v1/embed/${SEED_PROJECT.project_uuid}`;

// ---------------------------------------------------------------------------
// Embed helper functions (local async equivalents of Cypress embedUtils)
// ---------------------------------------------------------------------------

async function getEmbedConfig(client: ApiClient) {
    return client.get<
        Body<{
            dashboardUuids?: string[];
            allowAllDashboards?: boolean;
            chartUuids?: string[];
            allowAllCharts?: boolean;
        }>
    >(`${EMBED_API_PREFIX}/config`);
}

async function updateEmbedConfig(client: ApiClient, body: UpdateEmbed) {
    return client.patch<Body<unknown>>(`${EMBED_API_PREFIX}/config`, body);
}

async function getEmbedUrl(
    client: ApiClient,
    body: CreateEmbedJwt,
    options?: { failOnStatusCode?: boolean },
) {
    return client.post<Body<{ url: string }>>(
        `${EMBED_API_PREFIX}/get-embed-url`,
        body,
        options,
    );
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForEmbedConfigWithCharts(
    client: ApiClient,
    expectedChartUuids: string[],
    maxAttempts = 20,
    delayMs = 1000,
): Promise<void> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const resp = await getEmbedConfig(client);
        if (resp.status === 200) {
            const config = resp.body.results;
            const hasAllCharts = expectedChartUuids.every((uuid: string) =>
                config.chartUuids?.includes(uuid),
            );
            if (hasAllCharts) return;
        }
        if (attempt >= maxAttempts) {
            throw new Error(
                `Embed config did not contain expected charts after ${maxAttempts} attempts.`,
            );
        }
        await delay(delayMs);
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Embed Chart JWT API', () => {
    let admin: Awaited<ReturnType<typeof login>>;
    let testChartUuid: string;
    let testAnotherChartUuid: string;
    let testChartNotEmbeddedUuid: string;
    let embedEnabled = true;

    beforeAll(async () => {
        admin = await login();

        // Check if embed feature is available
        const configResp = await admin.get<
            Body<{
                dashboardUuids?: string[];
                allowAllDashboards?: boolean;
                chartUuids?: string[];
                allowAllCharts?: boolean;
            }>
        >(`${EMBED_API_PREFIX}/config`, {
            failOnStatusCode: false,
        });
        if (configResp.status === 403) {
            embedEnabled = false;
            return;
        }
        expect(configResp.status).toBe(200);
        const originalEmbedConfig = configResp.body.results;

        // Fetch specific charts by their known slugs from seed data
        const chartResp = await admin.get<Body<{ uuid: string }>>(
            `/api/v1/saved/how-much-revenue-do-we-have-per-payment-method?projectUuid=${SEED_PROJECT.project_uuid}`,
        );
        expect(chartResp.status).toBe(200);
        testChartUuid = chartResp.body.results.uuid;
        expect(typeof testChartUuid).toBe('string');

        const anotherChartResp = await admin.get<Body<{ uuid: string }>>(
            `/api/v1/saved/how-many-orders-we-have-over-time?projectUuid=${SEED_PROJECT.project_uuid}`,
        );
        expect(anotherChartResp.status).toBe(200);
        testAnotherChartUuid = anotherChartResp.body.results.uuid;
        expect(typeof testAnotherChartUuid).toBe('string');

        const notEmbeddedChartResp = await admin.get<Body<{ uuid: string }>>(
            `/api/v1/saved/what-s-our-total-revenue-to-date?projectUuid=${SEED_PROJECT.project_uuid}`,
        );
        expect(notEmbeddedChartResp.status).toBe(200);
        testChartNotEmbeddedUuid = notEmbeddedChartResp.body.results.uuid;
        expect(typeof testChartNotEmbeddedUuid).toBe('string');

        // Update embed config to include the charts we're testing with
        const chartsToEmbed = [testChartUuid, testAnotherChartUuid];
        const updateResp = await updateEmbedConfig(admin, {
            dashboardUuids: originalEmbedConfig.dashboardUuids || [],
            allowAllDashboards: originalEmbedConfig.allowAllDashboards || false,
            chartUuids: chartsToEmbed,
            allowAllCharts: false,
        });
        expect(updateResp.status).toBe(200);

        // Wait for the config to be updated with retry logic
        await waitForEmbedConfigWithCharts(admin, chartsToEmbed, 20, 1000);
    });

    beforeEach((ctx) => {
        if (!embedEnabled) ctx.skip();
    });

    it('should create embed URL for chart with JWT token', async () => {
        const resp = await getEmbedUrl(admin, {
            user: {
                externalId: 'chart-user@example.com',
                email: 'chart-user@example.com',
            },
            content: {
                type: 'chart',
                contentId: testChartUuid,
                scopes: ['view:Chart'],
                canExportCsv: true,
                canExportImages: false,
                canViewUnderlyingData: true,
                projectUuid: SEED_PROJECT.project_uuid,
            },
            expiresIn: '24h',
        });
        expect(resp.status).toBe(200);
        expect(resp.body.results).toHaveProperty('url');

        const { url } = resp.body.results;
        const token = url.split('#')[1];
        expect(typeof token).toBe('string');
        expect(token.length).toBeGreaterThan(0);
    });

    describe('Using Chart JWT Token', () => {
        let chartJwtToken: string;

        // Helper: creates a fresh ApiClient with no cookies (unauthenticated)
        // and adds the embed token header
        function embedClient(): ApiClient {
            return new ApiClient();
        }

        function embedHeaders(token: string) {
            return { 'Lightdash-Embed-Token': token };
        }

        // Creates a fresh JWT each time, so it always uses the current embed secret
        async function freshChartJwt(): Promise<string> {
            // Ensure embed config still includes our charts
            const configResp = await getEmbedConfig(admin);
            const config = configResp.body.results;
            const chartsToEmbed = [testChartUuid, testAnotherChartUuid];
            const needsUpdate = !chartsToEmbed.every((uuid) =>
                config.chartUuids?.includes(uuid),
            );
            if (needsUpdate) {
                await updateEmbedConfig(admin, {
                    dashboardUuids: config.dashboardUuids || [],
                    allowAllDashboards: config.allowAllDashboards || false,
                    chartUuids: chartsToEmbed,
                    allowAllCharts: false,
                });
            }

            const resp = await getEmbedUrl(admin, {
                user: {
                    externalId: 'chart-user@example.com',
                    email: 'chart-user@example.com',
                },
                content: {
                    type: 'chart',
                    contentId: testChartUuid,
                    scopes: ['view:Chart'],
                    canExportCsv: true,
                    canExportImages: false,
                    canViewUnderlyingData: true,
                    projectUuid: SEED_PROJECT.project_uuid,
                },
                expiresIn: '24h',
            });
            expect(resp.status).toBe(200);
            return resp.body.results.url.split('#')[1];
        }

        // Refresh JWT before each test so it uses the current embed secret
        beforeEach(async () => {
            chartJwtToken = await freshChartJwt();
        });

        it('should get unauthorized if not passing projectUuid argument with JWT token', async () => {
            const client = embedClient();
            const resp = await client.get(`/api/v1/saved/${testChartUuid}`, {
                headers: embedHeaders(chartJwtToken),
                failOnStatusCode: false,
            });
            expect(resp.status).toBe(401);
        });

        describe('GET chart details', () => {
            it('should get chart using JWT token (authorized)', async () => {
                const client = embedClient();
                const resp = await client.get<
                    Body<{ uuid: string; name: string; tableName: string }>
                >(
                    `/api/v1/saved/${testChartUuid}?projectUuid=${SEED_PROJECT.project_uuid}`,
                    { headers: embedHeaders(chartJwtToken) },
                );
                expect(resp.status).toBe(200);
                expect(resp.body.status).toBe('ok');
                expect(resp.body.results).toHaveProperty('uuid', testChartUuid);
                expect(resp.body.results).toHaveProperty('name');
                expect(resp.body.results).toHaveProperty('tableName');
            });

            it('should fail to get chart using another chart JWT token (unauthorized)', async () => {
                expect(testChartNotEmbeddedUuid).not.toBe(testChartUuid);

                const client = embedClient();
                const resp = await client.get<{
                    status: string;
                    error: { message: string };
                }>(
                    `/api/v1/saved/${testChartNotEmbeddedUuid}?projectUuid=${SEED_PROJECT.project_uuid}`,
                    {
                        headers: embedHeaders(chartJwtToken),
                        failOnStatusCode: false,
                    },
                );
                // Should fail with 403 Forbidden because JWT token is scoped to different chart
                expect(resp.status).toBe(403);
                expect(resp.body).toHaveProperty('error');
            });
        });

        describe('POST query chart', () => {
            // This is the method used for the explore to get results from a chart
            it.skip('should get chart query results using JWT token (authorized)', async () => {
                // FIXME this doesn't work
                // Currently throws a 403
                const client = embedClient();
                const resp = await client.post(
                    `/api/v2/projects/${SEED_PROJECT.project_uuid}/query/chart?projectUuid=${SEED_PROJECT.project_uuid}`,
                    {
                        context: 'chartView',
                        chartUuid: testChartUuid,
                        invalidateCache: false,
                        parameters: {},
                        pivotResults: false,
                    },
                    {
                        headers: embedHeaders(chartJwtToken),
                        failOnStatusCode: false,
                    },
                );
                expect(resp.status).toBe(403);
            });

            // This is the method used for the explore to get results from a chart
            it('should fail to get chart query results using another chartJWT token (unauthorized)', async () => {
                const client = embedClient();
                const resp = await client.post(
                    `/api/v2/projects/${SEED_PROJECT.project_uuid}/query/chart?projectUuid=${SEED_PROJECT.project_uuid}`,
                    {
                        context: 'chartView',
                        chartUuid: testAnotherChartUuid,
                        invalidateCache: false,
                        parameters: {},
                        pivotResults: false,
                    },
                    {
                        headers: embedHeaders(chartJwtToken),
                        failOnStatusCode: false,
                    },
                );
                expect(resp.status).toBe(403);
            });
        });

        describe('GET chart history', () => {
            it.skip('should get chart history using JWT token (authorized)', async () => {
                // FIXME this doesn't work
                // SavedChartController.getChartHistory doesn't support embed JWT accounts
                // Currently returns 403 because isAuthenticated middleware rejects embed tokens
                const client = embedClient();
                const resp = await client.get(
                    `/api/v1/saved/${testChartUuid}/history?projectUuid=${SEED_PROJECT.project_uuid}`,
                    {
                        headers: embedHeaders(chartJwtToken),
                        failOnStatusCode: false,
                    },
                );
                expect([200, 500]).toContain(resp.status);
            });

            it('should fail to chart history using another chart JWT token (unauthorized)', async () => {
                const client = embedClient();
                const resp = await client.get(
                    `/api/v1/saved/${testAnotherChartUuid}/history?projectUuid=${SEED_PROJECT.project_uuid}`,
                    {
                        headers: embedHeaders(chartJwtToken),
                        failOnStatusCode: false,
                    },
                );
                // Should fail with 403 Forbidden because chart JWT does not support this action or chart
                // Currently it fails with 500 error because accounts are not supported yet
                expect([403, 500]).toContain(resp.status);
            });
        });

        describe('GET chart views', () => {
            it.skip('should get chart views using JWT token (authorized)', async () => {
                // FIXME this doesn't work
                // > 500: Internal Server Error
                const client = embedClient();
                const resp = await client.get(
                    `/api/v1/saved/${testChartUuid}/views?projectUuid=${SEED_PROJECT.project_uuid}`,
                    {
                        headers: embedHeaders(chartJwtToken),
                        failOnStatusCode: false,
                    },
                );
                expect([200, 500]).toContain(resp.status);
            });

            it('should fail to chart views using another chart JWT token (unauthorized)', async () => {
                const client = embedClient();
                const resp = await client.get(
                    `/api/v1/saved/${testAnotherChartUuid}/views?projectUuid=${SEED_PROJECT.project_uuid}`,
                    {
                        headers: embedHeaders(chartJwtToken),
                        failOnStatusCode: false,
                    },
                );
                // Should fail with 403 Forbidden because chart JWT does not support this action or chart
                // Currently it fails with 500 error because accounts are not supported yet
                expect([403, 500]).toContain(resp.status);
            });
        });

        // This method is deprecated, but still supported for backwards compatibility
        // We still need to make sure we can get access using the JWT token if the chart matches
        describe('POST chart results deprecated', () => {
            it.skip('should get chart results using JWT token (authorized)', async () => {
                // FIXME this doesn't work currently because SavedChartController.postChartResults
                // is not supporting account, so fails to get userUuid parameter
                const client = embedClient();
                const resp = await client.post(
                    `/api/v1/saved/${testChartUuid}/results?projectUuid=${SEED_PROJECT.project_uuid}`,
                    undefined,
                    {
                        headers: embedHeaders(chartJwtToken),
                        failOnStatusCode: false,
                    },
                );
                expect([200, 500]).toContain(resp.status);
                expect(resp.body).not.toHaveProperty('status', 'ok');
            });

            it('should fail to get chart results using another chart JWT token (authorized)', async () => {
                // FIXME this doesn't work currently because SavedChartController.postChartResults
                // is not supporting account, so fails to get userUuid parameter
                const client = embedClient();
                const resp = await client.post(
                    `/api/v1/saved/${testAnotherChartUuid}/results?projectUuid=${SEED_PROJECT.project_uuid}`,
                    undefined,
                    {
                        headers: embedHeaders(chartJwtToken),
                        failOnStatusCode: false,
                    },
                );
                // Should fail with 403 Forbidden because chart JWT does not support this action or chart
                // Currently it fails with 500 error because accounts are not supported yet
                expect([403, 500]).toContain(resp.status);
                expect(resp.body).not.toHaveProperty('status', 'ok');
            });
        });

        it('should fail to get dashboard using chart JWT token (unauthorized)', async () => {
            const client = embedClient();
            const resp = await client.post(
                `/api/v1/embed/${SEED_PROJECT.project_uuid}/dashboard`,
                undefined,
                {
                    headers: embedHeaders(chartJwtToken),
                    failOnStatusCode: false,
                },
            );
            expect(resp.status).toBe(403);
        });

        it('should fail to run SQL query with chart JWT token (no permission)', async () => {
            const client = embedClient();
            const resp = await client.post(
                `/api/v1/projects/${SEED_PROJECT.project_uuid}/sqlQuery`,
                {
                    sql: 'SELECT * FROM postgres.jaffle.orders LIMIT 10',
                },
                {
                    headers: embedHeaders(chartJwtToken),
                    failOnStatusCode: false,
                },
            );
            // Should fail with 403 Forbidden because chart JWT doesn't grant SQL query permission
            // Currently it fails with 500 error because accounts are not supported yet
            expect([403, 500]).toContain(resp.status);
            expect(resp.body).toHaveProperty('error');
        });

        describe('Explore Access Restrictions (Security)', () => {
            // Chart JWTs should NOT have access to explore endpoints to prevent
            // information disclosure of the full data model. These tests verify
            // that chart JWTs are properly blocked from accessing project-wide
            // explore metadata, even for their own chart's explore.

            it('should block chart JWT from accessing getAllExploresSummary', async () => {
                const client = embedClient();
                const resp = await client.get(
                    `/api/v1/projects/${SEED_PROJECT.project_uuid}/explores?projectUuid=${SEED_PROJECT.project_uuid}&filtered=true`,
                    {
                        headers: embedHeaders(chartJwtToken),
                        failOnStatusCode: false,
                    },
                );
                // Should fail with 403 Forbidden to prevent disclosure of all table names
                expect(resp.status).toBe(403);
                expect(resp.body).toHaveProperty('error');
            });

            it('prevents chart JWT to access getExplore for explores outside the chart scope', async () => {
                const client = embedClient();
                // Try to access an explore (doesn't matter which one)
                const exploreName = 'users';
                const resp = await client.get(
                    `/api/v1/projects/${SEED_PROJECT.project_uuid}/explores/${exploreName}?projectUuid=${SEED_PROJECT.project_uuid}`,
                    {
                        headers: embedHeaders(chartJwtToken),
                        failOnStatusCode: false,
                    },
                );
                expect(resp.status).toBe(403);
                expect(resp.body).toHaveProperty('error');
            });

            it('should block chart JWT from accessing getTablesConfiguration', async () => {
                const client = embedClient();
                const resp = await client.get(
                    `/api/v1/projects/${SEED_PROJECT.project_uuid}/tablesConfiguration?projectUuid=${SEED_PROJECT.project_uuid}`,
                    {
                        headers: embedHeaders(chartJwtToken),
                        failOnStatusCode: false,
                    },
                );
                // Should fail with 403 Forbidden to prevent project config disclosure
                expect(resp.status).toBe(403);
                expect(resp.body).toHaveProperty('error');
            });
        });
    });

    describe('Chart JWT with different permissions', () => {
        it('should create chart JWT with canExportCsv enabled', async () => {
            const resp = await getEmbedUrl(admin, {
                user: {
                    externalId: 'export-user@example.com',
                },
                content: {
                    type: 'chart',
                    contentId: testChartUuid,
                    canExportCsv: true,
                    canExportImages: false,
                    canViewUnderlyingData: false,
                    projectUuid: SEED_PROJECT.project_uuid,
                },
                expiresIn: '1h',
            });
            expect(resp.status).toBe(200);
            expect(resp.body.results).toHaveProperty('url');
            const token = resp.body.results.url.split('#')[1];
            expect(typeof token).toBe('string');
            expect(token.length).toBeGreaterThan(0);
        });

        it('should create chart JWT with canViewUnderlyingData enabled', async () => {
            const resp = await getEmbedUrl(admin, {
                user: {
                    externalId: 'data-viewer@example.com',
                },
                content: {
                    type: 'chart',
                    contentId: testChartUuid,
                    canExportCsv: false,
                    canExportImages: false,
                    canViewUnderlyingData: true,
                    projectUuid: SEED_PROJECT.project_uuid,
                },
                expiresIn: '2h',
            });
            expect(resp.status).toBe(200);
            expect(resp.body.results).toHaveProperty('url');
            const token = resp.body.results.url.split('#')[1];
            expect(typeof token).toBe('string');
            expect(token.length).toBeGreaterThan(0);
        });

        it('should create chart JWT with custom scopes', async () => {
            const resp = await getEmbedUrl(admin, {
                user: {
                    externalId: 'scoped-user@example.com',
                },
                content: {
                    type: 'chart',
                    contentId: testChartUuid,
                    scopes: ['view:Chart', 'export:Chart'],
                    canExportCsv: true,
                    canExportImages: true,
                    projectUuid: SEED_PROJECT.project_uuid,
                },
                expiresIn: '12h',
            });
            expect(resp.status).toBe(200);
            expect(resp.body.results).toHaveProperty('url');
            const token = resp.body.results.url.split('#')[1];
            expect(typeof token).toBe('string');
            expect(token.length).toBeGreaterThan(0);
        });
    });
});

describe('Embed Chart JWT API - invalid permissions', () => {
    let adminClient: Awaited<ReturnType<typeof login>>;
    let otherClient: Awaited<ReturnType<typeof anotherLogin>>;
    let testUnauthorizedChartUuid: string;

    beforeAll(async () => {
        adminClient = await login();
        otherClient = await anotherLogin();

        // Get a chart to use in tests
        const resp = await adminClient.get<
            Body<{ data: Array<{ uuid: string }> }>
        >(`/api/v2/content?pageSize=1&contentTypes=chart`);
        expect(resp.status).toBe(200);
        const charts = resp.body.results.data;
        expect(charts.length).toBeGreaterThan(0);
        testUnauthorizedChartUuid = charts[0].uuid;
    });

    it('should not create embed URL for chart without permissions', async () => {
        const resp = await getEmbedUrl(
            otherClient,
            {
                user: {
                    externalId: 'unauthorized@example.com',
                },
                content: {
                    type: 'chart',
                    contentId: testUnauthorizedChartUuid,
                    scopes: ['view:Chart'],
                    projectUuid: SEED_PROJECT.project_uuid,
                },
                expiresIn: '1h',
            },
            { failOnStatusCode: false },
        );
        expect(resp.status).toBe(403);
        expect(resp.body).toHaveProperty('error');
    });
});
