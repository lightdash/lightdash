import {
    ChartType,
    DashboardTileTypes,
    FeatureFlags,
    MAX_RESULTS_CACHE_TTL_SECONDS,
    MIN_RESULTS_CACHE_TTL_SECONDS,
    QueryExecutionContext,
    SEED_PROJECT,
    type ApiExecuteAsyncDashboardChartQueryResults,
    type ApiExecuteAsyncMetricQueryResults,
    type CreateChartInSpace,
    type CreateDashboard,
    type Dashboard,
    type ResultsCacheInvalidation,
    type ResultsCacheProjectSettings,
    type SavedChart,
} from '@lightdash/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiClient, type Body } from '../helpers/api-client';
import { login, loginAsEditor, loginAsViewer } from '../helpers/auth';
import { pollUntil } from '../helpers/polling';

const settingsUrl = `/api/v1/projects/${SEED_PROJECT.project_uuid}/results-cache-config`;
const flagOverrideUrl = `/api/v2/feature-flag/${FeatureFlags.ResultsCacheEnabled}`;
const invalidateUrl = `/api/v1/projects/${SEED_PROJECT.project_uuid}/results-cache/invalidate`;
const metricQueryUrl = `/api/v2/projects/${SEED_PROJECT.project_uuid}/query/metric-query`;

describe('Project results cache settings', () => {
    let admin: ApiClient;
    let viewer: ApiClient;

    beforeAll(async () => {
        admin = await login();
        viewer = await loginAsViewer();
        // PATCH is gated on results caching; enable it for the org
        await admin.post(flagOverrideUrl, { enabled: true });
    });

    afterAll(async () => {
        await admin.patch(settingsUrl, { cacheTtlSeconds: null });
        await admin.delete(flagOverrideUrl);
    });

    it('defaults to the instance TTL', async () => {
        const resp =
            await admin.get<Body<ResultsCacheProjectSettings>>(settingsUrl);
        expect(resp.status).toBe(200);
        expect(resp.body.results).toMatchObject({
            projectUuid: SEED_PROJECT.project_uuid,
            cacheTtlSeconds: null,
            instanceDefaultTtlSeconds: expect.any(Number),
        });
        expect(resp.body.results.instanceDefaultTtlSeconds).toBeGreaterThan(0);
    });

    it('persists a project TTL and clears it back to the default', async () => {
        const updated = await admin.patch<Body<ResultsCacheProjectSettings>>(
            settingsUrl,
            { cacheTtlSeconds: 1800 },
        );
        expect(updated.status).toBe(200);
        expect(updated.body.results.cacheTtlSeconds).toBe(1800);

        const persisted =
            await admin.get<Body<ResultsCacheProjectSettings>>(settingsUrl);
        expect(persisted.body.results.cacheTtlSeconds).toBe(1800);

        const cleared = await admin.patch<Body<ResultsCacheProjectSettings>>(
            settingsUrl,
            { cacheTtlSeconds: null },
        );
        expect(cleared.body.results.cacheTtlSeconds).toBeNull();
    });

    it.each([
        ['below the minimum', MIN_RESULTS_CACHE_TTL_SECONDS - 1],
        ['above the maximum', MAX_RESULTS_CACHE_TTL_SECONDS + 1],
        ['not a whole number', 90.5],
    ])('rejects a TTL %s', async (_label, cacheTtlSeconds) => {
        const resp = await admin.patch(
            settingsUrl,
            { cacheTtlSeconds },
            { failOnStatusCode: false },
        );
        expect(resp.status).toBe(400);
    });

    it('is not readable or writable by a viewer', async () => {
        const read = await viewer.get(settingsUrl, { failOnStatusCode: false });
        expect(read.status).toBe(403);

        const write = await viewer.patch(
            settingsUrl,
            { cacheTtlSeconds: 1800 },
            { failOnStatusCode: false },
        );
        expect(write.status).toBe(403);
    });

    describe('invalidation', () => {
        // Unique per run so earlier runs cannot leave a cached result behind
        const limit = 100 + Math.floor(Math.random() * 400);
        const runQuery = async () => {
            const resp = await admin.post<
                Body<ApiExecuteAsyncMetricQueryResults>
            >(metricQueryUrl, {
                context: 'exploreView',
                query: {
                    exploreName: 'orders',
                    dimensions: ['orders_status'],
                    metrics: ['orders_total_order_amount'],
                    filters: {},
                    sorts: [],
                    limit,
                    tableCalculations: [],
                    customDimensions: [],
                    additionalMetrics: [],
                },
            });
            expect(resp.status).toBe(200);
            const { queryUuid, cacheMetadata } = resp.body.results;
            await pollUntil<Body<{ status: string }>>(
                admin,
                `/api/v2/projects/${SEED_PROJECT.project_uuid}/query/${queryUuid}`,
                {
                    timeout: 60_000,
                    condition: (body) => body.results.status === 'ready',
                },
            );
            return { queryUuid, cacheHit: cacheMetadata.cacheHit };
        };

        it('runs fresh after invalidation and caches the new result', async () => {
            await runQuery();
            expect((await runQuery()).cacheHit).toBe(true);

            const resp =
                await admin.post<Body<ResultsCacheInvalidation>>(invalidateUrl);
            expect(resp.status).toBe(200);
            expect(resp.body.results).toEqual({
                projectUuid: SEED_PROJECT.project_uuid,
                invalidatedAt: expect.any(String),
            });

            expect((await runQuery()).cacheHit).toBe(false);
            expect((await runQuery()).cacheHit).toBe(true);

            const settings =
                await admin.get<Body<ResultsCacheProjectSettings>>(settingsUrl);
            expect(settings.body.results.lastInvalidatedAt).toBe(
                resp.body.results.invalidatedAt,
            );
        });

        it('keeps results that were already returned readable', async () => {
            const { queryUuid } = await runQuery();
            await admin.post(invalidateUrl);

            const resp = await admin.get<Body<{ status: string }>>(
                `/api/v2/projects/${SEED_PROJECT.project_uuid}/query/${queryUuid}`,
            );
            expect(resp.status).toBe(200);
            expect(resp.body.results.status).toBe('ready');
        });

        it('is restricted to project admins', async () => {
            const editor = await loginAsEditor();
            const asEditor = await editor.post(invalidateUrl, undefined, {
                failOnStatusCode: false,
            });
            expect(asEditor.status).toBe(403);

            const asViewer = await viewer.post(invalidateUrl, undefined, {
                failOnStatusCode: false,
            });
            expect(asViewer.status).toBe(403);
        });
    });

    describe('chart and dashboard invalidation', () => {
        const projectUrl = `/api/v1/projects/${SEED_PROJECT.project_uuid}`;
        const queryUrl = `/api/v2/projects/${SEED_PROJECT.project_uuid}/query`;
        let chartUuid: string;
        let dashboardUuid: string;
        let tileUuid: string;

        beforeAll(async () => {
            const chart = await admin.post<Body<SavedChart>>(
                `${projectUrl}/saved`,
                {
                    name: `Cache invalidation ${Date.now()}`,
                    tableName: 'orders',
                    metricQuery: {
                        exploreName: 'orders',
                        dimensions: ['orders_status'],
                        metrics: ['orders_total_order_amount'],
                        filters: {},
                        sorts: [],
                        // Unique per run so earlier runs leave nothing cached
                        limit: 500 + Math.floor(Math.random() * 400),
                        tableCalculations: [],
                        additionalMetrics: [],
                    },
                    chartConfig: { type: ChartType.TABLE },
                    tableConfig: { columnOrder: [] },
                    dashboardUuid: null,
                    spaceUuid: undefined,
                } satisfies CreateChartInSpace,
            );
            chartUuid = chart.body.results.uuid;
            const dashboard = await admin.post<Body<Dashboard>>(
                `${projectUrl}/dashboards`,
                {
                    name: `Cache invalidation ${Date.now()}`,
                    tiles: [
                        {
                            type: DashboardTileTypes.SAVED_CHART,
                            x: 0,
                            y: 0,
                            w: 12,
                            h: 6,
                            tabUuid: null,
                            properties: { savedChartUuid: chartUuid },
                        },
                    ],
                    tabs: [],
                } satisfies CreateDashboard,
            );
            dashboardUuid = dashboard.body.results.uuid;
            tileUuid = dashboard.body.results.tiles[0].uuid;
        });

        afterAll(async () => {
            await admin.delete(`/api/v1/dashboards/${dashboardUuid}`, {
                failOnStatusCode: false,
            });
            await admin.delete(`/api/v1/saved/${chartUuid}`, {
                failOnStatusCode: false,
            });
        });

        const waitUntilReady = (queryUuid: string) =>
            pollUntil<Body<{ status: string }>>(
                admin,
                `${queryUrl}/${queryUuid}`,
                {
                    timeout: 60_000,
                    condition: (body) => body.results.status === 'ready',
                },
            );
        const runChart = async () => {
            const resp = await admin.post<
                Body<ApiExecuteAsyncMetricQueryResults>
            >(`${queryUrl}/chart`, {
                chartUuid,
                context: QueryExecutionContext.CHART,
            });
            await waitUntilReady(resp.body.results.queryUuid);
            return resp.body.results.cacheMetadata.cacheHit;
        };
        const runTile = async () => {
            const resp = await admin.post<
                Body<ApiExecuteAsyncDashboardChartQueryResults>
            >(`${queryUrl}/dashboard-chart`, {
                chartUuid,
                tileUuid,
                dashboardUuid,
                dashboardFilters: {
                    dimensions: [],
                    metrics: [],
                    tableCalculations: [],
                },
                dashboardSorts: [],
                context: QueryExecutionContext.DASHBOARD,
            });
            await waitUntilReady(resp.body.results.queryUuid);
            return resp.body.results.cacheMetadata.cacheHit;
        };

        it('runs the chart fresh after its cache is cleared', async () => {
            await runChart();
            expect(await runChart()).toBe(true);

            const resp = await admin.post<Body<ResultsCacheInvalidation>>(
                `/api/v2/saved/${chartUuid}/results-cache/invalidate`,
            );
            expect(resp.status).toBe(200);

            expect(await runChart()).toBe(false);
            expect(await runChart()).toBe(true);
        });

        it('runs dashboard tiles fresh after its cache is cleared', async () => {
            await runTile();
            expect(await runTile()).toBe(true);

            const resp = await admin.post<Body<ResultsCacheInvalidation>>(
                `/api/v2/dashboards/${dashboardUuid}/results-cache/invalidate`,
            );
            expect(resp.status).toBe(200);

            expect(await runTile()).toBe(false);
            expect(await runTile()).toBe(true);
        });

        it('is restricted to project admins', async () => {
            const editor = await loginAsEditor();
            const chartResp = await editor.post(
                `/api/v2/saved/${chartUuid}/results-cache/invalidate`,
                undefined,
                { failOnStatusCode: false },
            );
            expect(chartResp.status).toBe(403);
            const dashboardResp = await editor.post(
                `/api/v2/dashboards/${dashboardUuid}/results-cache/invalidate`,
                undefined,
                { failOnStatusCode: false },
            );
            expect(dashboardResp.status).toBe(403);
        });
    });
});
