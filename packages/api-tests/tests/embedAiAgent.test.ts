import {
    CreateEmbedJwt,
    EMBED_DASHBOARD_HEADER_NAME,
    JWT_HEADER_NAME,
    SEED_ORG_1_ADMIN,
    SEED_PROJECT,
} from '@lightdash/common';
import { randomUUID } from 'crypto';
import { ApiClient, Body } from '../helpers/api-client';
import { login } from '../helpers/auth';
import { TestResourceTracker, uniqueName } from '../helpers/test-isolation';

const projectUuid = SEED_PROJECT.project_uuid;
const EMBED_API_PREFIX = `/api/v1/embed/${projectUuid}`;
const AGENT_UUID = randomUUID();

const ordersChart = (name: string, spaceUuid: string) => ({
    name,
    description: 'embedded AI agent api test',
    tableName: 'orders',
    spaceUuid,
    metricQuery: {
        exploreName: 'orders',
        dimensions: ['orders_status'],
        metrics: ['orders_total_order_amount'],
        filters: {},
        sorts: [],
        limit: 10,
        tableCalculations: [],
        additionalMetrics: [],
    },
    chartConfig: { type: 'table', config: {} },
    tableConfig: {
        columnOrder: ['orders_status', 'orders_total_order_amount'],
    },
});

describe('Embedded AI agent saved content', () => {
    let admin: ApiClient;
    let embedEnabled = true;
    const tracker = new TestResourceTracker();
    let writeSpaceUuid: string;
    let otherSpaceUuid: string;
    let writeSpaceChartUuid: string;
    let otherSpaceChartUuid: string;
    let writeSpaceDashboardUuid: string;
    let otherSpaceDashboardUuid: string;
    let agentToken: string;

    const embedClient = () => new ApiClient();
    const agentHeaders = (dashboardUuid?: string) => ({
        [JWT_HEADER_NAME]: agentToken,
        ...(dashboardUuid
            ? { [EMBED_DASHBOARD_HEADER_NAME]: dashboardUuid }
            : {}),
    });

    const createSpace = async (name: string) => {
        const resp = await admin.post<Body<{ uuid: string }>>(
            `/api/v1/projects/${projectUuid}/spaces`,
            { name: uniqueName(name), isPrivate: false },
        );
        tracker.trackSpace(resp.body.results.uuid);
        return resp.body.results.uuid;
    };
    const createChart = async (name: string, spaceUuid: string) => {
        const resp = await admin.post<Body<{ uuid: string }>>(
            `/api/v1/projects/${projectUuid}/saved`,
            ordersChart(uniqueName(name), spaceUuid),
        );
        tracker.trackChart(resp.body.results.uuid);
        return resp.body.results.uuid;
    };
    const createDashboard = async (
        name: string,
        spaceUuid: string,
        chartUuid: string,
    ) => {
        const created = await admin.post<Body<{ uuid: string }>>(
            `/api/v1/projects/${projectUuid}/dashboards`,
            { name: uniqueName(name), spaceUuid, tiles: [], tabs: [] },
        );
        const dashboardUuid = created.body.results.uuid;
        tracker.trackDashboard(dashboardUuid);
        await admin.patch(`/api/v1/dashboards/${dashboardUuid}`, {
            tiles: [
                {
                    uuid: randomUUID(),
                    type: 'saved_chart',
                    x: 0,
                    y: 0,
                    w: 18,
                    h: 9,
                    tabUuid: null,
                    properties: { savedChartUuid: chartUuid, title: '' },
                },
            ],
            filters: { dimensions: [], metrics: [], tableCalculations: [] },
            tabs: [],
        });
        return dashboardUuid;
    };

    beforeAll(async () => {
        admin = await login();
        const configResp = await admin.get(`${EMBED_API_PREFIX}/config`, {
            failOnStatusCode: false,
        });
        if (configResp.status === 403) {
            embedEnabled = false;
            return;
        }

        writeSpaceUuid = await createSpace('embed agent write space');
        otherSpaceUuid = await createSpace('embed agent other space');
        writeSpaceChartUuid = await createChart(
            'write space chart',
            writeSpaceUuid,
        );
        otherSpaceChartUuid = await createChart(
            'other space chart',
            otherSpaceUuid,
        );
        writeSpaceDashboardUuid = await createDashboard(
            'write space dashboard',
            writeSpaceUuid,
            writeSpaceChartUuid,
        );
        otherSpaceDashboardUuid = await createDashboard(
            'other space dashboard',
            otherSpaceUuid,
            otherSpaceChartUuid,
        );

        const jwt: CreateEmbedJwt = {
            content: { type: 'aiAgent', agentUuid: AGENT_UUID, projectUuid },
            writeActions: {
                userUuid: SEED_ORG_1_ADMIN.user_uuid,
                spaceUuid: writeSpaceUuid,
            },
            user: { externalId: 'embedded-agent-viewer' },
            expiresIn: '1h',
        };
        const urlResp = await admin.post<Body<{ url: string }>>(
            `${EMBED_API_PREFIX}/get-embed-url`,
            jwt,
        );
        [, agentToken] = urlResp.body.results.url.split('#');
    });

    afterAll(async () => {
        if (admin) await tracker.cleanup(admin);
    });

    beforeEach((ctx) => {
        if (!embedEnabled) ctx.skip();
    });

    describe('saved chart query (side panel)', () => {
        it('runs a chart from the write space', async () => {
            const resp = await embedClient().post<Body<{ queryUuid: string }>>(
                `/api/v2/projects/${projectUuid}/query/chart`,
                { chartUuid: writeSpaceChartUuid },
                { headers: agentHeaders(), failOnStatusCode: false },
            );
            expect(resp.status).toBe(200);
            expect(resp.body.results.queryUuid).toBeTruthy();
        });

        it('rejects a chart outside the write space', async () => {
            const resp = await embedClient().post(
                `/api/v2/projects/${projectUuid}/query/chart`,
                { chartUuid: otherSpaceChartUuid },
                { headers: agentHeaders(), failOnStatusCode: false },
            );
            expect(resp.status).toBe(403);
        });
    });

    describe('dashboard viewer (request header)', () => {
        it('rejects dashboard requests without a requested dashboard', async () => {
            const resp = await embedClient().post(
                `${EMBED_API_PREFIX}/dashboard`,
                {},
                { headers: agentHeaders(), failOnStatusCode: false },
            );
            expect(resp.status).toBe(403);
        });

        it('serves a write-space dashboard read-only', async () => {
            const resp = await embedClient().post<
                Body<{
                    uuid: string;
                    tiles: unknown[];
                    canExportCsv?: boolean;
                    canExportImages?: boolean;
                    canExportPagePdf?: boolean;
                    canDateZoom?: boolean;
                    dashboardFiltersInteractivity?: unknown;
                }>
            >(
                `${EMBED_API_PREFIX}/dashboard`,
                {},
                {
                    headers: agentHeaders(writeSpaceDashboardUuid),
                    failOnStatusCode: false,
                },
            );
            expect(resp.status).toBe(200);
            expect(resp.body.results.uuid).toBe(writeSpaceDashboardUuid);
            expect(resp.body.results.tiles).toHaveLength(1);
            expect(resp.body.results.canExportCsv).toBeFalsy();
            expect(resp.body.results.canExportImages).toBeFalsy();
            expect(resp.body.results.canExportPagePdf).toBe(false);
            expect(resp.body.results.canDateZoom).toBeFalsy();
            expect(resp.body.results.dashboardFiltersInteractivity).toBeFalsy();
        });

        it('runs a tile of the requested dashboard', async () => {
            const dashboard = await embedClient().post<
                Body<{ tiles: { uuid: string }[] }>
            >(
                `${EMBED_API_PREFIX}/dashboard`,
                {},
                {
                    headers: agentHeaders(writeSpaceDashboardUuid),
                },
            );
            const resp = await embedClient().post<Body<{ queryUuid: string }>>(
                `${EMBED_API_PREFIX}/query/dashboard-tile`,
                {
                    tileUuid: dashboard.body.results.tiles[0].uuid,
                    dashboardFilters: {
                        dimensions: [],
                        metrics: [],
                        tableCalculations: [],
                    },
                    dashboardSorts: [],
                },
                {
                    headers: agentHeaders(writeSpaceDashboardUuid),
                    failOnStatusCode: false,
                },
            );
            expect(resp.status).toBe(200);
            expect(resp.body.results.queryUuid).toBeTruthy();
        });

        it('rejects a dashboard outside the write space', async () => {
            const resp = await embedClient().post(
                `${EMBED_API_PREFIX}/dashboard`,
                {},
                {
                    headers: agentHeaders(otherSpaceDashboardUuid),
                    failOnStatusCode: false,
                },
            );
            expect(resp.status).toBe(403);
        });

        it('rejects an unknown dashboard', async () => {
            const resp = await embedClient().post(
                `${EMBED_API_PREFIX}/dashboard`,
                {},
                {
                    headers: agentHeaders(randomUUID()),
                    failOnStatusCode: false,
                },
            );
            expect(resp.status).toBe(404);
        });

        it('ignores the requested dashboard on the agent routes', async () => {
            const resp = await embedClient().get(
                `/api/v1/projects/${projectUuid}/aiAgents`,
                {
                    headers: agentHeaders(writeSpaceDashboardUuid),
                    failOnStatusCode: false,
                },
            );
            // The header turns the request into a dashboard viewer, which the
            // agent routes refuse; without it the agent routes are reachable.
            expect(resp.status).toBe(403);
        });
    });
});
