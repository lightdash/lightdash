import {
    isDashboardChartTileType,
    QueryExecutionContext,
    SEED_AI_AGENT,
    SEED_COMPOSER_ARTIFACT,
    SEED_PROJECT,
    type AiAgentSummary,
    type AiArtifact,
    type ApiAiAgentComposerArtifactVizQuery,
    type ApiExecuteAsyncComposerChartQueryResults,
    type ComposerSavedChart,
    type Dashboard,
    type FeatureFlag,
    type ResultRow,
} from '@lightdash/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiClient, Body } from '../helpers/api-client';
import { login, loginAsViewer } from '../helpers/auth';
import { pollUntil } from '../helpers/polling';
import { TestResourceTracker, uniqueName } from '../helpers/test-isolation';

// The first writer of composer charts: an author saves a seeded composer
// artifact version to a dashboard, and a viewer runs the resulting tile.
const projectUuid = SEED_PROJECT.project_uuid;
const COMPOSE_FLAG = 'compose-sql-runner';
const resultsCacheUrl = `/api/v1/projects/${projectUuid}/results-cache-config`;

type ArtifactRef = { artifactUuid: string; versionUuid: string };

type SaveResponse = Body<{ chart: ComposerSavedChart; dashboard: Dashboard }>;

type QueryResultsBody = Body<{
    status: string;
    rows: ResultRow[];
    totalResults: number;
    error?: string | null;
}>;

type ApiErrorBody = { error: { name: string; message: string } };

const rawRows = (rows: ResultRow[]): Record<string, unknown>[] =>
    rows.map((row) =>
        Object.fromEntries(
            Object.entries(row).map(([column, cell]) => [
                column,
                cell.value.raw,
            ]),
        ),
    );

const sortRows = (rows: Record<string, unknown>[]) =>
    [...rows].sort((a, b) =>
        JSON.stringify(a).localeCompare(JSON.stringify(b)),
    );

describe('Save a composer artifact to a dashboard', () => {
    let admin: ApiClient;
    let viewer: ApiClient;
    let agentUuid: string;
    let dashboardUuid: string;
    let flagWasEnabled: boolean;
    let cacheWasEnabled: boolean;
    const tracker = new TestResourceTracker();

    const agentUrl = () =>
        `/api/v1/projects/${projectUuid}/aiAgents/${agentUuid}`;
    const versionUrl = ({ artifactUuid, versionUuid }: ArtifactRef) =>
        `${agentUrl()}/artifacts/${artifactUuid}/versions/${versionUuid}`;

    const save = (client: ApiClient, artifact: ArtifactRef) =>
        client.post<SaveResponse & ApiErrorBody>(
            `${versionUrl(artifact)}/save-to-dashboard`,
            { dashboardUuid },
            { failOnStatusCode: false },
        );

    const getDashboard = async () => {
        const resp = await admin.get<Body<Dashboard>>(
            `/api/v1/dashboards/${dashboardUuid}`,
        );
        expect(resp.status).toBe(200);
        return resp.body.results;
    };

    const getArtifact = async (artifact: ArtifactRef) => {
        const resp = await admin.get<Body<AiArtifact>>(versionUrl(artifact));
        expect(resp.status).toBe(200);
        return resp.body.results;
    };

    const pollQueryResults = async (
        client: ApiClient,
        queryUuid: string,
    ): Promise<QueryResultsBody['results']> => {
        const { results } = await pollUntil<QueryResultsBody>(
            client,
            `/api/v2/projects/${projectUuid}/query/${queryUuid}`,
            {
                timeout: 60_000,
                interval: 500,
                condition: (body) =>
                    body.results.status === 'ready' ||
                    body.results.status === 'error',
            },
        );
        if (results.status === 'error') {
            throw new Error(`Query failed: ${JSON.stringify(results)}`);
        }
        return results;
    };

    /** The artifact as the author sees it in the thread: one run of its pipeline. */
    const runArtifact = async (artifact: ArtifactRef) => {
        const resp = await admin.get<Body<ApiAiAgentComposerArtifactVizQuery>>(
            `${versionUrl(artifact)}/viz-query`,
        );
        expect(resp.status).toBe(200);
        return resp.body.results;
    };

    const runTile = async (
        client: ApiClient,
        tile: { tileUuid: string; chartUuid: string },
    ) => {
        const resp = await client.post<
            Body<ApiExecuteAsyncComposerChartQueryResults>
        >(`/api/v2/projects/${projectUuid}/query/dashboard-chart`, {
            ...tile,
            dashboardUuid,
            dashboardFilters: {
                dimensions: [],
                metrics: [],
                tableCalculations: [],
            },
            dashboardSorts: [],
            context: QueryExecutionContext.DASHBOARD,
        });
        expect(resp.status).toBe(200);
        return resp.body.results;
    };

    const tileOf = (dashboard: Dashboard, chartUuid: string) => {
        const tile = dashboard.tiles.find(
            (candidate) =>
                isDashboardChartTileType(candidate) &&
                candidate.properties.savedChartUuid === chartUuid,
        );
        if (!tile) throw new Error(`No tile for chart ${chartUuid}`);
        return { tileUuid: tile.uuid, chartUuid };
    };

    beforeAll(async () => {
        admin = await login();
        viewer = await loginAsViewer();

        const flag = await admin.get<Body<FeatureFlag>>(
            `/api/v2/feature-flag/${COMPOSE_FLAG}`,
        );
        flagWasEnabled = flag.body.results.enabled;
        if (!flagWasEnabled) {
            await admin.post(`/api/v2/feature-flag/${COMPOSE_FLAG}`, {
                enabled: true,
            });
        }
        const cache =
            await admin.get<Body<{ cacheEnabled: boolean }>>(resultsCacheUrl);
        cacheWasEnabled = cache.body.results.cacheEnabled;
        if (!cacheWasEnabled) {
            await admin.patch(resultsCacheUrl, { cacheEnabled: true });
        }

        const agents = await admin.get<Body<AiAgentSummary[]>>(
            `/api/v1/projects/${projectUuid}/aiAgents`,
        );
        const agent = agents.body.results.find(
            ({ name }) => name === SEED_AI_AGENT.name,
        );
        if (!agent) throw new Error('Seeded AI agent not found');
        agentUuid = agent.uuid;

        const dashboard = await admin.post<Body<Dashboard>>(
            `/api/v1/projects/${projectUuid}/dashboards`,
            { name: uniqueName('Composer saves'), tiles: [], tabs: [] },
        );
        expect(dashboard.status).toBe(201);
        dashboardUuid = dashboard.body.results.uuid;
        tracker.trackDashboard(dashboardUuid);
    });

    afterAll(async () => {
        await tracker.cleanup(admin);
        if (!flagWasEnabled) {
            await admin.post(`/api/v2/feature-flag/${COMPOSE_FLAG}`, {
                enabled: false,
            });
        }
        if (!cacheWasEnabled) {
            await admin.patch(resultsCacheUrl, { cacheEnabled: false });
        }
    });

    it('saves the presented node as a dashboard tile a viewer runs to the same rows as the author', async () => {
        const artifact = SEED_COMPOSER_ARTIFACT.revenueByStatus;
        const saved = await save(admin, artifact);
        expect(saved.status).toBe(200);
        const { chart, dashboard } = saved.body.results;
        expect(chart.dashboardUuid).toBe(dashboardUuid);
        expect(chart.pipeline.terminalNodeId).toBe('by_status');
        expect(chart.pipeline.nodes.map(({ nodeId }) => nodeId)).toEqual([
            'orders',
            'by_status',
        ]);
        expect(chart.chartConfig.type).toBe('cartesian');
        expect(dashboard.uuid).toBe(dashboardUuid);
        const tile = tileOf(dashboard, chart.uuid);

        const version = await getArtifact(artifact);
        expect(version.savedQueryUuid).toBe(chart.uuid);
        expect(version.savedDashboardUuid).toBe(dashboardUuid);

        const authorRun = await runArtifact(artifact);
        const authorResults = await pollQueryResults(
            admin,
            authorRun.nodeQueryUuids.by_status,
        );
        const viewerRun = await runTile(viewer, tile);
        expect(viewerRun.queryType).toBe('composer');
        const viewerResults = await pollQueryResults(
            viewer,
            viewerRun.queryUuid,
        );
        expect(viewerResults.totalResults).toBeGreaterThan(1);
        expect(sortRows(rawRows(viewerResults.rows))).toEqual(
            sortRows(rawRows(authorResults.rows)),
        );
    }, 120_000);

    it('saves a series split as pivot dimensions and draws the same series as the artifact', async () => {
        const artifact = SEED_COMPOSER_ARTIFACT.revenueByMonthAndStatus;
        const saved = await save(admin, artifact);
        expect(saved.status).toBe(200);
        const { chart, dashboard } = saved.body.results;
        expect(chart.chartConfig.type).toBe('cartesian');
        expect(chart.pivotConfig).toEqual({
            columns: ['composer_result_orders_status'],
        });

        const authorRun = await runArtifact(artifact);
        if (authorRun.chartStage?.status !== 'ok') {
            throw new Error(
                `Artifact has no chart stage: ${JSON.stringify(authorRun.chartStage)}`,
            );
        }
        const stageResults = await pollQueryResults(
            admin,
            authorRun.chartStage.queryUuid,
        );
        const viewerRun = await runTile(viewer, tileOf(dashboard, chart.uuid));
        if (!viewerRun.chartStage) {
            throw new Error('The saved chart ran without a series split');
        }
        const viewerResults = await pollQueryResults(
            viewer,
            viewerRun.chartStage.queryUuid,
        );
        expect(viewerResults.totalResults).toBeGreaterThan(1);
        expect(sortRows(rawRows(viewerResults.rows))).toEqual(
            sortRows(rawRows(stageResults.rows)),
        );
    }, 120_000);

    it('saves an artifact without a viz config as a table', async () => {
        const saved = await save(admin, SEED_COMPOSER_ARTIFACT.statusTable);
        expect(saved.status).toBe(200);
        expect(saved.body.results.chart.chartConfig.type).toBe('table');
        expect(saved.body.results.chart.pivotConfig).toBeUndefined();
    });

    describe('refuses by name, writing nothing', () => {
        const refusal = async (
            client: ApiClient,
            artifact: ArtifactRef,
            status: number,
            message: RegExp,
        ) => {
            const tilesBefore = (await getDashboard()).tiles.length;
            const resp = await save(client, artifact);
            expect(resp.status).toBe(status);
            expect(resp.body.error.message).toMatch(message);
            expect((await getDashboard()).tiles.length).toBe(tilesBefore);
            const version = await getArtifact(artifact);
            expect(version.savedQueryUuid).toBeNull();
            expect(version.savedDashboardUuid).toBeNull();
        };

        it('a python node', () =>
            refusal(
                admin,
                SEED_COMPOSER_ARTIFACT.pythonNode,
                400,
                /by_status/,
            ));

        it('a node reading a query result by uuid', () =>
            refusal(
                admin,
                SEED_COMPOSER_ARTIFACT.queryUuidReference,
                400,
                /by_status.*uuid/,
            ));

        it('a charted column whose name contains a double underscore', () =>
            refusal(
                admin,
                SEED_COMPOSER_ARTIFACT.doubleUnderscoreColumn,
                400,
                /status__name/,
            ));

        it('a custom chart type', () =>
            refusal(
                admin,
                SEED_COMPOSER_ARTIFACT.customChartType,
                400,
                /custom chart type/i,
            ));

        it('a thread owner who cannot author queries', () =>
            refusal(
                viewer,
                SEED_COMPOSER_ARTIFACT.viewerOwned,
                403,
                /permission/i,
            ));

        it('the compose feature flag off', async () => {
            await admin.post(`/api/v2/feature-flag/${COMPOSE_FLAG}`, {
                enabled: false,
            });
            try {
                await refusal(
                    admin,
                    SEED_COMPOSER_ARTIFACT.pythonNode,
                    403,
                    /not enabled/,
                );
            } finally {
                await admin.post(`/api/v2/feature-flag/${COMPOSE_FLAG}`, {
                    enabled: true,
                });
            }
        });
    });
});
