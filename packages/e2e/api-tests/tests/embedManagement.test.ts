import {
    CreateEmbedJwt,
    CreateEmbedRequestBody,
    DecodedEmbed,
    SEED_PROJECT,
    UpdateEmbed,
} from '@lightdash/common';
import { ApiClient, Body } from '../helpers/api-client';
import { anotherLogin, login } from '../helpers/auth';

const EMBED_API_PREFIX = `/api/v1/embed/${SEED_PROJECT.project_uuid}`;

// ---------------------------------------------------------------------------
// Embed helper functions (local async equivalents of Cypress embedUtils)
// ---------------------------------------------------------------------------

async function getEmbedConfig(
    client: ApiClient,
    options?: { failOnStatusCode?: boolean },
) {
    return client.get<Body<DecodedEmbed>>(
        `${EMBED_API_PREFIX}/config`,
        options,
    );
}

async function replaceEmbedConfig(
    client: ApiClient,
    body: CreateEmbedRequestBody,
    options?: { failOnStatusCode?: boolean },
) {
    return client.post<Body<DecodedEmbed>>(
        `${EMBED_API_PREFIX}/config`,
        body,
        options,
    );
}

async function updateEmbedConfig(
    client: ApiClient,
    body: UpdateEmbed,
    options?: { failOnStatusCode?: boolean },
) {
    return client.patch<Body<unknown>>(
        `${EMBED_API_PREFIX}/config`,
        body,
        options,
    );
}

async function updateEmbedConfigDashboards(
    client: ApiClient,
    dashboardUuids: string[],
    options?: { failOnStatusCode?: boolean },
) {
    return client.patch<Body<unknown>>(
        `${EMBED_API_PREFIX}/config/dashboards`,
        {
            dashboardUuids,
            chartUuids: [],
            allowAllDashboards: false,
            allowAllCharts: false,
        },
        options,
    );
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Embed Management API', () => {
    let admin: Awaited<ReturnType<typeof login>>;
    let embedConfig: DecodedEmbed;
    let originalConfig: DecodedEmbed;
    let beforeTestConfig: DecodedEmbed | null;
    let embedEnabled = true;

    beforeAll(async () => {
        admin = await login();

        // Check if embed feature is available
        const resp = await getEmbedConfig(admin, { failOnStatusCode: false });
        if (resp.status === 403) {
            embedEnabled = false;
            return;
        }
        expect(resp.status).toBe(200);
        const config = resp.body.results;
        originalConfig = { ...config };

        // If dashboardUuids is empty, set up initial dashboards for testing
        if (!config.dashboardUuids || config.dashboardUuids.length === 0) {
            const dashResp = await admin.get<
                Body<{ data: Array<{ uuid: string }> }>
            >(`/api/v2/content?pageSize=10&contentTypes=dashboard`);
            expect(dashResp.status).toBe(200);
            const dashboardUuids = dashResp.body.results.data
                .map((d: { uuid: string }) => d.uuid)
                .slice(0, 2); // Take first 2 dashboards

            if (dashboardUuids.length > 0) {
                await updateEmbedConfig(admin, {
                    dashboardUuids,
                    allowAllDashboards: false,
                    chartUuids: config.chartUuids || [],
                    allowAllCharts: config.allowAllCharts || false,
                });
                const newResp = await getEmbedConfig(admin);
                expect(newResp.status).toBe(200);
                embedConfig = newResp.body.results;
            } else {
                embedConfig = config;
            }
        } else {
            embedConfig = config;
        }
    });

    beforeEach(async (ctx) => {
        if (!embedEnabled) {
            ctx.skip();
            return;
        }
        // Save config state before each test for isolation
        const resp = await getEmbedConfig(admin);
        if (resp.status === 200) {
            beforeTestConfig = resp.body.results;
        } else {
            beforeTestConfig = null;
        }
    });

    afterEach(async () => {
        if (!embedEnabled) return;
        // Restore config state after each test
        if (beforeTestConfig) {
            await updateEmbedConfig(admin, {
                dashboardUuids: beforeTestConfig.dashboardUuids,
                allowAllDashboards: beforeTestConfig.allowAllDashboards,
                chartUuids: beforeTestConfig.chartUuids,
                allowAllCharts: beforeTestConfig.allowAllCharts,
            });
        }
    });

    afterAll(async () => {
        if (!embedEnabled) return;
        // Restore original configuration
        if (originalConfig) {
            await updateEmbedConfig(admin, {
                dashboardUuids: originalConfig.dashboardUuids,
                allowAllDashboards: originalConfig.allowAllDashboards,
                chartUuids: originalConfig.chartUuids,
                allowAllCharts: originalConfig.allowAllCharts,
            });
        }
    });

    it('should get project embed configuration', async () => {
        expect(embedConfig).not.toBe(null);
        expect(embedConfig.projectUuid).toBe(SEED_PROJECT.project_uuid);
        expect(embedConfig.dashboardUuids.length).toBeGreaterThan(0);
        expect(embedConfig.createdAt).not.toBe(null);
        expect(embedConfig.user).not.toBe(null);
        expect(embedConfig.secret).not.toBe(null);
        expect(embedConfig.encodedSecret).toBe(undefined);
        expect(Array.isArray(embedConfig.chartUuids)).toBe(true);
        expect(typeof embedConfig.allowAllCharts).toBe('boolean');
    });

    it('should replace project embed configuration with dashboards only', async () => {
        const updateResp = await replaceEmbedConfig(admin, {
            dashboardUuids: embedConfig.dashboardUuids,
        });
        expect(updateResp.status).toBe(201);
        // should have new secret
        expect(updateResp.body.results.secret).not.toBe(embedConfig.secret);
    });

    it('allows empty config to disable embeds for the project', async () => {
        const resp = await updateEmbedConfig(
            admin,
            {
                dashboardUuids: [],
                allowAllDashboards: false,
                chartUuids: [],
                allowAllCharts: false,
            },
            { failOnStatusCode: false },
        );
        expect(resp.status).toBe(200);
    });

    it('should update project embed allowed dashboards', async () => {
        const resp = await admin.get<Body<{ data: Array<{ uuid: string }> }>>(
            `/api/v2/content?pageSize=999&contentTypes=dashboard`,
        );
        expect(resp.status).toBe(200);
        const dashboardsUuids = resp.body.results.data.map(
            (d: { uuid: string }) => d.uuid,
        );
        expect(dashboardsUuids.length).toBeGreaterThan(1);

        const updateResp = await updateEmbedConfigDashboards(
            admin,
            dashboardsUuids,
        );
        expect(updateResp.status).toBe(200);

        const newConfigResp = await getEmbedConfig(admin);
        expect(newConfigResp.status).toBe(200);
    });

    it('should create embed url', async () => {
        const resp = await getEmbedUrl(admin, {
            content: {
                type: 'dashboard',
                dashboardUuid: embedConfig.dashboardUuids[0],
            },
        });
        expect(resp.status).toBe(200);
        expect(resp.body.results.url).not.toBe(null);
    });

    it('should create embed with charts only', async () => {
        const resp = await admin.get<Body<{ data: Array<{ uuid: string }> }>>(
            `/api/v2/content?pageSize=999&contentTypes=chart`,
        );
        expect(resp.status).toBe(200);
        const chartUuids = resp.body.results.data
            .map((c: { uuid: string }) => c.uuid)
            .slice(0, 2); // Take first 2 charts
        expect(chartUuids.length).toBeGreaterThan(0);

        const createResp = await replaceEmbedConfig(admin, {
            chartUuids,
        });
        expect(createResp.status).toBe(201);
        expect(Array.isArray(createResp.body.results.dashboardUuids)).toBe(
            true,
        );
    });

    it('should create embed with both dashboards and charts', async () => {
        const chartResp = await admin.get<
            Body<{ data: Array<{ uuid: string }> }>
        >(`/api/v2/content?pageSize=999&contentTypes=chart`);
        expect(chartResp.status).toBe(200);
        const chartUuids = chartResp.body.results.data
            .map((c: { uuid: string }) => c.uuid)
            .slice(0, 2);

        const createResp = await replaceEmbedConfig(admin, {
            dashboardUuids: embedConfig.dashboardUuids,
            chartUuids,
        });
        expect(createResp.status).toBe(201);
    });

    it('should update embed config with unified PATCH /config endpoint', async () => {
        const chartResp = await admin.get<
            Body<{ data: Array<{ uuid: string }> }>
        >(`/api/v2/content?pageSize=999&contentTypes=chart`);
        expect(chartResp.status).toBe(200);
        const chartUuids = chartResp.body.results.data
            .map((c: { uuid: string }) => c.uuid)
            .slice(0, 3);

        const updateResp = await updateEmbedConfig(admin, {
            dashboardUuids: embedConfig.dashboardUuids,
            allowAllDashboards: false,
            chartUuids,
            allowAllCharts: false,
        });
        expect(updateResp.status).toBe(200);

        // Verify the update
        const newConfigResp = await getEmbedConfig(admin);
        expect(newConfigResp.status).toBe(200);
        expect(newConfigResp.body.results.allowAllDashboards).toBe(false);
        expect(newConfigResp.body.results.allowAllCharts).toBe(false);
    });

    it('should update to allow all charts', async () => {
        const updateResp = await updateEmbedConfig(admin, {
            dashboardUuids: embedConfig.dashboardUuids,
            allowAllDashboards: false,
            chartUuids: [],
            allowAllCharts: true,
        });
        expect(updateResp.status).toBe(200);

        const newConfigResp = await getEmbedConfig(admin);
        expect(newConfigResp.status).toBe(200);
        expect(newConfigResp.body.results.allowAllCharts).toBe(true);
        expect(Array.isArray(newConfigResp.body.results.chartUuids)).toBe(true);
    });

    it('should update charts while keeping existing dashboards', async () => {
        // Get charts from the jaffle dashboard (these won't get removed, avoiding race conditions)
        const response = await admin.get<
            Body<{
                name: string;
                tiles: Array<{
                    type: string;
                    properties: { savedChartUuid: string };
                }>;
            }>
        >(`/api/v1/dashboards/jaffle-dashboard`);
        expect(response.status).toBe(200);
        expect(response.body.status).toBe('ok');
        expect(response.body.results.name).toBe('Jaffle dashboard');

        // Get 2 random charts from jaffle dashboard
        const newChartUuids = response.body.results.tiles
            .filter((tile: { type: string }) => tile.type === 'saved_chart')
            .map(
                (tile: { properties: { savedChartUuid: string } }) =>
                    tile.properties.savedChartUuid,
            )
            .slice(0, 2);
        expect(newChartUuids).toHaveLength(2);

        // First, get current config
        const currentConfigResp = await getEmbedConfig(admin);
        const currentDashboards = currentConfigResp.body.results.dashboardUuids;

        // Update only charts, keeping dashboards the same
        const updateResp = await updateEmbedConfig(admin, {
            dashboardUuids: currentDashboards,
            allowAllDashboards: false,
            chartUuids: newChartUuids,
            allowAllCharts: false,
        });
        expect(updateResp.status).toBe(200);

        // Verify both dashboards and charts are correct
        const verifyResp = await getEmbedConfig(admin);
        expect(verifyResp.status).toBe(200);
    });
});

describe('Embed Management API - invalid permissions', () => {
    let otherClient: Awaited<ReturnType<typeof anotherLogin>>;

    beforeAll(async () => {
        otherClient = await anotherLogin();
    });

    it('should not get embed configuration', async () => {
        const resp = await getEmbedConfig(otherClient, {
            failOnStatusCode: false,
        });
        expect(resp.status).toBe(403);
    });

    it('should not get embed url', async () => {
        const resp = await getEmbedUrl(
            otherClient,
            {
                content: {
                    type: 'dashboard',
                    dashboardUuid: 'uuid',
                },
            },
            { failOnStatusCode: false },
        );
        expect(resp.status).toBe(403);
    });

    it('should not replace embed configuration', async () => {
        const resp = await replaceEmbedConfig(
            otherClient,
            { dashboardUuids: ['uuid'] },
            { failOnStatusCode: false },
        );
        expect(resp.status).toBe(403);
    });

    it('should not update embed configuration (dashboards endpoint)', async () => {
        const resp = await updateEmbedConfigDashboards(otherClient, ['uuid'], {
            failOnStatusCode: false,
        });
        expect(resp.status).toBe(403);
    });

    it('should not update embed configuration (unified endpoint)', async () => {
        const resp = await updateEmbedConfig(
            otherClient,
            {
                dashboardUuids: ['uuid'],
                allowAllDashboards: false,
                chartUuids: ['uuid2'],
                allowAllCharts: false,
            },
            { failOnStatusCode: false },
        );
        expect(resp.status).toBe(403);
    });
});
