// Shared by api-tests, e2e and scripts/composer-dashboard.ts: keep it free of
// test-runner imports so every caller can load it.
import {
    ChartType,
    DashboardTileTypes,
    FieldType,
    QuerySourceType,
    SEED_PROJECT,
    type ComposerChart,
    type CreateComposerChart,
    type Dashboard,
    type DashboardComposerChartTile,
} from '@lightdash/common';
import { randomUUID } from 'crypto';

/** Sends one request and returns `results`; throws on a non-2xx status. */
export type ComposerApiSend = <T>(
    method: 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
) => Promise<T>;

export type ComposerDashboard = {
    dashboard: Dashboard;
    chart: ComposerChart;
};

export const composerChartBody = (
    dashboardUuid: string,
): CreateComposerChart => ({
    dashboardUuid,
    name: 'Orders by status',
    description: null,
    pipeline: {
        schemaVersion: 1,
        terminalNodeId: 'orders',
        nodes: [
            {
                sourceType: QuerySourceType.SEMANTIC_LAYER,
                nodeId: 'orders',
                title: 'Orders by status',
                exploreName: 'orders',
                dimensions: ['orders_status'],
                metrics: ['orders_total_order_amount'],
            },
        ],
    },
    chart: {
        schemaVersion: 1,
        columns: [
            { reference: 'orders_status', fieldType: FieldType.DIMENSION },
            {
                reference: 'orders_total_order_amount',
                fieldType: FieldType.METRIC,
            },
        ],
        chartConfig: {
            type: ChartType.CARTESIAN,
            config: {
                layout: {
                    xField: 'orders_status',
                    yField: ['orders_total_order_amount'],
                },
                eChartsConfig: {},
            },
        },
        pivotConfig: null,
        tableConfig: {
            columnOrder: ['orders_status', 'orders_total_order_amount'],
        },
    },
});

export const composerTile = (
    composerChartUuid: string,
): DashboardComposerChartTile => ({
    uuid: randomUUID(),
    type: DashboardTileTypes.COMPOSER_CHART,
    x: 0,
    y: 0,
    h: 9,
    w: 12,
    tabUuid: null,
    properties: {
        title: 'Orders',
        composerChartUuid,
        chartName: null,
        chartSlug: null,
    },
});

/** Deleting the dashboard cascades to the composer charts it owns. */
export const deleteComposerDashboard = (
    send: ComposerApiSend,
    dashboardUuid: string,
) => send<undefined>('DELETE', `/api/v1/dashboards/${dashboardUuid}`);

/** A new dashboard in the seed project holding one composer chart tile. */
export const createComposerDashboard = async (
    send: ComposerApiSend,
    {
        pipeline,
        chart: storedChart,
    }: Partial<Pick<CreateComposerChart, 'pipeline' | 'chart'>> = {},
): Promise<ComposerDashboard> => {
    const projectUuid = SEED_PROJECT.project_uuid;
    const name = `Composer test dashboard ${randomUUID().slice(0, 8)}`;
    const created = await send<Dashboard>(
        'POST',
        `/api/v1/projects/${projectUuid}/dashboards`,
        { name, tiles: [], tabs: [] },
    );
    try {
        const chart = await send<ComposerChart>(
            'POST',
            `/api/v2/projects/${projectUuid}/composer-charts`,
            {
                ...composerChartBody(created.uuid),
                ...(pipeline && { pipeline }),
                ...(storedChart && { chart: storedChart }),
            },
        );
        const dashboard = await send<Dashboard>(
            'PATCH',
            `/api/v1/dashboards/${created.uuid}`,
            {
                tiles: [composerTile(chart.uuid)],
                filters: created.filters,
                tabs: created.tabs,
            },
        );
        return { dashboard, chart };
    } catch (error) {
        await deleteComposerDashboard(send, created.uuid);
        throw error;
    }
};

export const apiClientSend =
    (client: {
        request<R>(
            path: string,
            options: { method: string; body?: unknown },
        ): Promise<{ body: R }>;
    }): ComposerApiSend =>
    async <T>(
        method: 'POST' | 'PATCH' | 'DELETE',
        path: string,
        body?: unknown,
    ): Promise<T> =>
        (await client.request<{ results: T }>(path, { method, body })).body
            .results;

/** A `send` over plain fetch, e.g. with `{ Authorization: 'ApiKey <pat>' }`. */
export const fetchSend =
    (siteUrl: string, headers: Record<string, string>): ComposerApiSend =>
    async <T>(
        method: 'POST' | 'PATCH' | 'DELETE',
        path: string,
        body?: unknown,
    ): Promise<T> => {
        const response = await fetch(`${siteUrl}${path}`, {
            method,
            headers: { 'Content-Type': 'application/json', ...headers },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const text = await response.text();
        if (!response.ok) {
            throw new Error(`${method} ${path} → ${response.status}: ${text}`);
        }
        try {
            const parsed: { results: T } = JSON.parse(text);
            return parsed.results;
        } catch {
            throw new Error(`${method} ${path} → non-JSON response: ${text}`);
        }
    };
