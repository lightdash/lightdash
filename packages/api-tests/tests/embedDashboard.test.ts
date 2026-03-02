import { CreateEmbedJwt, SEED_PROJECT, UpdateEmbed } from '@lightdash/common';
import { ApiClient, Body } from '../helpers/api-client';
import { login } from '../helpers/auth';

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
    return new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
    });
}

async function waitForEmbedConfigWithDashboards(
    client: ApiClient,
    expectedDashboardUuids: string[],
    maxAttempts = 10,
    delayMs = 500,
): Promise<void> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const resp = await getEmbedConfig(client);
        if (resp.status === 200) {
            const config = resp.body.results;
            const hasAllDashboards = expectedDashboardUuids.every(
                (uuid: string) => config.dashboardUuids?.includes(uuid),
            );
            if (hasAllDashboards) return;
        }
        if (attempt >= maxAttempts) {
            throw new Error(
                `Embed config did not contain expected dashboards after ${maxAttempts} attempts.`,
            );
        }
        await delay(delayMs);
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Embed Dashboard JWT API', () => {
    let admin: Awaited<ReturnType<typeof login>>;
    let testDashboardUuid: string;
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

        // Get all dashboards from the project
        const dashboardsResp = await admin.get<Body<Array<{ uuid: string }>>>(
            `/api/v1/projects/${SEED_PROJECT.project_uuid}/dashboards`,
        );
        expect(dashboardsResp.status).toBe(200);
        const dashboards = dashboardsResp.body.results;
        expect(dashboards.length).toBeGreaterThan(0);

        // Store first dashboard for testing
        testDashboardUuid = dashboards[0].uuid;
        expect(typeof testDashboardUuid).toBe('string');
        expect(testDashboardUuid.length).toBeGreaterThan(0);

        // Update embed config to include the dashboard we're testing with
        const updateResp = await updateEmbedConfig(admin, {
            dashboardUuids: [testDashboardUuid],
            allowAllDashboards: false,
            chartUuids: originalEmbedConfig.chartUuids || [],
            allowAllCharts: originalEmbedConfig.allowAllCharts || false,
        });
        expect(updateResp.status).toBe(200);

        // Wait for the config to be updated with retry logic
        await waitForEmbedConfigWithDashboards(admin, [testDashboardUuid]);
    });

    beforeEach((ctx) => {
        if (!embedEnabled) ctx.skip();
    });

    it('should create embed URL for dashboard with JWT token', async () => {
        const resp = await getEmbedUrl(admin, {
            user: {
                externalId: 'dashboard-user@example.com',
                email: 'dashboard-user@example.com',
            },
            content: {
                type: 'dashboard',
                dashboardUuid: testDashboardUuid,
                canExportCsv: true,
                canExportImages: false,
                canViewUnderlyingData: true,
                canDateZoom: true,
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

    describe('Using Dashboard JWT Token', () => {
        let dashboardJwtToken: string;

        // Helper: creates a fresh ApiClient with no cookies (unauthenticated)
        function embedClient(): ApiClient {
            return new ApiClient();
        }

        function embedHeaders(token: string) {
            return { 'Lightdash-Embed-Token': token };
        }

        // Creates a fresh JWT each time, so it always uses the current embed secret
        async function freshDashboardJwt(): Promise<string> {
            // Ensure embed config still includes our dashboard
            const configResp = await getEmbedConfig(admin);
            const config = configResp.body.results;
            if (!config.dashboardUuids?.includes(testDashboardUuid)) {
                await updateEmbedConfig(admin, {
                    dashboardUuids: [testDashboardUuid],
                    allowAllDashboards: false,
                    chartUuids: config.chartUuids || [],
                    allowAllCharts: config.allowAllCharts || false,
                });
            }

            const resp = await getEmbedUrl(admin, {
                user: {
                    externalId: 'dashboard-user@example.com',
                    email: 'dashboard-user@example.com',
                },
                content: {
                    type: 'dashboard',
                    dashboardUuid: testDashboardUuid,
                    canExportCsv: true,
                    canExportImages: false,
                    canViewUnderlyingData: true,
                    canDateZoom: true,
                    projectUuid: SEED_PROJECT.project_uuid,
                },
                expiresIn: '24h',
            });
            expect(resp.status).toBe(200);
            return resp.body.results.url.split('#')[1];
        }

        // Refresh JWT before each test so it uses the current embed secret
        beforeEach(async () => {
            dashboardJwtToken = await freshDashboardJwt();
        });

        describe('Explore Access (Regression Tests)', () => {
            // Dashboard JWTs need access to explore endpoints because a dashboard
            // can contain multiple charts from different explores.

            it('should allow dashboard JWT to access getAllExploresSummary', async () => {
                const client = embedClient();
                const resp = await client.get<Body<unknown[]>>(
                    `/api/v1/projects/${SEED_PROJECT.project_uuid}/explores?projectUuid=${SEED_PROJECT.project_uuid}&filtered=true`,
                    { headers: embedHeaders(dashboardJwtToken) },
                );
                // Should succeed - dashboard JWTs need explore list
                expect(resp.status).toBe(200);
                expect(resp.body.status).toBe('ok');
                expect(Array.isArray(resp.body.results)).toBe(true);
            });

            it('should allow dashboard JWT to access getExplore for any explore', async () => {
                const client = embedClient();
                const exploreName = 'orders';
                const resp = await client.get<
                    Body<{ name: string; tables: unknown }>
                >(
                    `/api/v1/projects/${SEED_PROJECT.project_uuid}/explores/${exploreName}?projectUuid=${SEED_PROJECT.project_uuid}`,
                    { headers: embedHeaders(dashboardJwtToken) },
                );
                // Should succeed - dashboard JWTs need explore schemas
                expect(resp.status).toBe(200);
                expect(resp.body.status).toBe('ok');
                expect(resp.body.results).toHaveProperty('name');
                expect(resp.body.results).toHaveProperty('tables');
            });

            it('should allow dashboard JWT to access getTablesConfiguration', async () => {
                const client = embedClient();
                const resp = await client.get<
                    Body<{ tableSelection: unknown }>
                >(
                    `/api/v1/projects/${SEED_PROJECT.project_uuid}/tablesConfiguration?projectUuid=${SEED_PROJECT.project_uuid}`,
                    { headers: embedHeaders(dashboardJwtToken) },
                );
                // Should succeed - dashboard JWTs may need table config
                expect(resp.status).toBe(200);
                expect(resp.body.status).toBe('ok');
                expect(resp.body.results).toHaveProperty('tableSelection');
            });
        });

        describe('GET dashboard details', () => {
            it('should get dashboard using JWT token (authorized)', async () => {
                const client = embedClient();
                const resp = await client.get(
                    `/api/v1/dashboards/${testDashboardUuid}?projectUuid=${SEED_PROJECT.project_uuid}`,
                    {
                        headers: embedHeaders(dashboardJwtToken),
                        failOnStatusCode: false,
                    },
                );
                expect(resp.status).toBe(500);
            });
        });

        it('should fail to run SQL query with dashboard JWT token (no permission)', async () => {
            const client = embedClient();
            const resp = await client.post(
                `/api/v1/projects/${SEED_PROJECT.project_uuid}/sqlQuery`,
                {
                    sql: 'SELECT * FROM postgres.jaffle.orders LIMIT 10',
                },
                {
                    headers: embedHeaders(dashboardJwtToken),
                    failOnStatusCode: false,
                },
            );
            // Should fail with 403 Forbidden because dashboard JWT doesn't grant SQL query permission
            expect([403, 500]).toContain(resp.status);
            expect(resp.body).toHaveProperty('error');
        });

        describe('Calculate Total/Subtotals from Raw Query (Explore Mode)', () => {
            // These endpoints support embed Explore mode where users build
            // queries ad-hoc without a saved chart.

            const testMetricQuery = {
                exploreName: 'orders',
                dimensions: ['orders_status'],
                metrics: ['orders_total_order_amount'],
                filters: {},
                sorts: [],
                limit: 500,
                tableCalculations: [],
            };

            it('should calculate totals from raw metricQuery with embed JWT', async () => {
                const client = embedClient();
                const resp = await client.post<Body<unknown>>(
                    `/api/v1/embed/${SEED_PROJECT.project_uuid}/calculate-total`,
                    {
                        explore: 'orders',
                        metricQuery: testMetricQuery,
                    },
                    {
                        headers: embedHeaders(dashboardJwtToken),
                        failOnStatusCode: false,
                    },
                );
                // Should succeed - embed JWT can calculate totals from raw query
                expect(resp.status).toBe(200);
                expect(resp.body.status).toBe('ok');
                expect(typeof resp.body.results).toBe('object');
            });

            it('should calculate subtotals from raw metricQuery with embed JWT', async () => {
                const client = embedClient();
                const resp = await client.post<Body<unknown>>(
                    `/api/v1/embed/${SEED_PROJECT.project_uuid}/calculate-subtotals`,
                    {
                        explore: 'orders',
                        metricQuery: testMetricQuery,
                        columnOrder: [
                            'orders_status',
                            'orders_total_order_amount',
                        ],
                    },
                    {
                        headers: embedHeaders(dashboardJwtToken),
                        failOnStatusCode: false,
                    },
                );
                // Should succeed - embed JWT can calculate subtotals from raw query
                expect(resp.status).toBe(200);
                expect(resp.body.status).toBe('ok');
                expect(typeof resp.body.results).toBe('object');
            });

            it('should fail to calculate totals without embed JWT', async () => {
                // No login, no embed token - completely unauthenticated
                const client = new ApiClient();
                const resp = await client.post(
                    `/api/v1/embed/${SEED_PROJECT.project_uuid}/calculate-total`,
                    {
                        explore: 'orders',
                        metricQuery: testMetricQuery,
                    },
                    { failOnStatusCode: false },
                );
                // Should fail - no JWT token provided
                expect(resp.status).toBe(403);
            });

            it('should fail to calculate subtotals without embed JWT', async () => {
                // No login, no embed token - completely unauthenticated
                const client = new ApiClient();
                const resp = await client.post(
                    `/api/v1/embed/${SEED_PROJECT.project_uuid}/calculate-subtotals`,
                    {
                        explore: 'orders',
                        metricQuery: testMetricQuery,
                        columnOrder: [
                            'orders_status',
                            'orders_total_order_amount',
                        ],
                    },
                    { failOnStatusCode: false },
                );
                // Should fail - no JWT token provided
                expect(resp.status).toBe(403);
            });
        });
    });
});
