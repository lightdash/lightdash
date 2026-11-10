import { DashboardTileTypes, type DashboardTile } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { type StreamPart } from '../../ee/features/aiCopilot/store/aiAgentThreadStreamSlice';
import {
    getDashboardTilesForChart,
    planDashboardAiAgentChanges,
} from './dashboardAiAgentChangePlanner';

const dashboardEditPart = {
    type: 'toolCall',
    toolCallId: 'dashboard-edit',
    toolName: 'editContent',
    isPreliminary: false,
    toolArgs: {
        type: 'dashboard',
        slug: 'jaffle-dashboard',
        patch: [],
    },
    toolResult: {
        result: '{}',
        metadata: {
            status: 'success',
            slug: 'jaffle-dashboard',
            name: 'Jaffle dashboard',
            uuid: 'dashboard-uuid',
            href: '/projects/project-uuid/dashboards/jaffle-dashboard',
            warnings: [],
            versionUuids: { before: null, after: null },
        },
        structuredContent: {
            type: 'dashboard',
            href: '/projects/project-uuid/dashboards/jaffle-dashboard',
            content: {},
            warnings: [],
        },
    },
} as StreamPart;

const chartEditPart = {
    type: 'toolCall',
    toolCallId: 'chart-edit',
    toolName: 'editContent',
    isPreliminary: false,
    toolArgs: {
        type: 'chart',
        slug: 'orders-over-time',
        patch: [],
    },
    toolResult: {
        result: '{}',
        metadata: {
            status: 'success',
            slug: 'orders-over-time',
            name: 'Orders over time',
            uuid: 'chart-uuid',
            href: '/projects/project-uuid/saved/chart-uuid',
            warnings: [],
            versionUuids: { before: null, after: null },
        },
        structuredContent: {
            type: 'chart',
            href: '/projects/project-uuid/saved/chart-uuid',
            content: {},
            warnings: [],
        },
    },
} as StreamPart;

const chartCreatePart = {
    type: 'toolCall',
    toolCallId: 'chart-create',
    toolName: 'createContent',
    isPreliminary: false,
    toolArgs: {
        type: 'chart',
        content: {
            slug: 'new-orders-chart',
            name: 'New orders chart',
            description: null,
            spaceSlug: 'shared',
            version: 1,
            contentType: 'chart',
            updatedAt: null,
            downloadedAt: null,
            verified: false,
            verification: null,
            tableName: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: [],
                metrics: [],
                filters: {},
                sorts: [],
                limit: 500,
                tableCalculations: [],
            },
            chartConfig: {},
            pivotConfig: {},
            tableConfig: {},
            dashboardSlug: 'jaffle-dashboard',
            parameters: null,
        },
    },
    toolResult: {
        result: '{}',
        metadata: {
            status: 'success',
            slug: 'new-orders-chart',
            name: 'New orders chart',
            uuid: 'chart-uuid',
            href: '/projects/project-uuid/saved/chart-uuid',
            warnings: [],
        },
        structuredContent: {
            type: 'chart',
            slug: 'new-orders-chart',
            name: 'New orders chart',
            uuid: 'chart-uuid',
            href: '/projects/project-uuid/saved/chart-uuid',
            content: {},
            warnings: [],
        },
    },
} as StreamPart;

const sqlChartEditPart = {
    type: 'toolCall',
    toolCallId: 'sql-chart-edit',
    toolName: 'editContent',
    isPreliminary: false,
    toolArgs: {
        type: 'sql_chart',
        slug: 'orders-by-status-sql',
        patch: [],
    },
    toolResult: {
        result: '{}',
        metadata: {
            status: 'success',
            slug: 'orders-by-status-sql',
            name: 'Orders by status (SQL)',
            uuid: 'sql-chart-uuid',
            href: '/projects/project-uuid/sql-runner/orders-by-status-sql',
            warnings: [],
            versionUuids: { before: null, after: null },
        },
        structuredContent: {
            type: 'sql_chart',
            href: '/projects/project-uuid/sql-runner/orders-by-status-sql',
            content: {},
            warnings: [],
        },
    },
} as StreamPart;

const sqlChartCreatePart = {
    type: 'toolCall',
    toolCallId: 'sql-chart-create',
    toolName: 'createContent',
    isPreliminary: false,
    toolArgs: {
        type: 'sql_chart',
        content: {
            slug: 'new-orders-sql',
            name: 'New orders (SQL)',
            description: null,
            spaceSlug: 'shared',
            version: 1,
            contentType: 'sql_chart',
            sql: 'select status, count(*) as orders from orders group by 1',
            limit: 500,
            chartKind: 'vertical_bar',
            config: { type: 'vertical_bar' },
        },
    },
    toolResult: {
        result: '{}',
        metadata: {
            status: 'success',
            slug: 'new-orders-sql',
            name: 'New orders (SQL)',
            uuid: 'sql-chart-uuid',
            href: '/projects/project-uuid/sql-runner/new-orders-sql',
            warnings: [],
        },
        structuredContent: {
            type: 'sql_chart',
            slug: 'new-orders-sql',
            name: 'New orders (SQL)',
            uuid: 'sql-chart-uuid',
            href: '/projects/project-uuid/sql-runner/new-orders-sql',
            content: {},
            warnings: [],
        },
    },
} as StreamPart;

describe('planDashboardAiAgentChanges', () => {
    it('plans a dashboard refresh for current dashboard edits', () => {
        expect(
            planDashboardAiAgentChanges({
                parts: [dashboardEditPart],
                handledToolCallIds: new Set(),
                currentDashboardSlug: 'jaffle-dashboard',
                pendingChartToFocus: null,
            }),
        ).toEqual({
            handledToolCallIds: ['dashboard-edit'],
            actions: [{ type: 'refreshDashboard', focusChart: null }],
            pendingChartToFocus: null,
        });
    });

    it('plans focused chart refreshes for chart edits', () => {
        expect(
            planDashboardAiAgentChanges({
                parts: [chartEditPart],
                handledToolCallIds: new Set(),
                currentDashboardSlug: 'jaffle-dashboard',
                pendingChartToFocus: null,
            }),
        ).toEqual({
            handledToolCallIds: ['chart-edit'],
            actions: [
                {
                    type: 'refreshChart',
                    chart: { type: 'chart', slug: 'orders-over-time' },
                    focusTile: true,
                },
            ],
            pendingChartToFocus: null,
        });
    });

    it('plans a dashboard refresh when a chart is created on the current dashboard', () => {
        expect(
            planDashboardAiAgentChanges({
                parts: [chartCreatePart],
                handledToolCallIds: new Set(),
                currentDashboardSlug: 'jaffle-dashboard',
                pendingChartToFocus: null,
            }),
        ).toEqual({
            handledToolCallIds: ['chart-create'],
            actions: [
                {
                    type: 'refreshDashboard',
                    focusChart: { type: 'chart', slug: 'new-orders-chart' },
                },
            ],
            pendingChartToFocus: { type: 'chart', slug: 'new-orders-chart' },
        });
    });

    it('uses the pending chart focus when the current dashboard is refreshed', () => {
        expect(
            planDashboardAiAgentChanges({
                parts: [dashboardEditPart],
                handledToolCallIds: new Set(),
                currentDashboardSlug: 'jaffle-dashboard',
                pendingChartToFocus: {
                    type: 'chart',
                    slug: 'new-orders-chart',
                },
            }),
        ).toEqual({
            handledToolCallIds: ['dashboard-edit'],
            actions: [
                {
                    type: 'refreshDashboard',
                    focusChart: { type: 'chart', slug: 'new-orders-chart' },
                },
            ],
            pendingChartToFocus: { type: 'chart', slug: 'new-orders-chart' },
        });
    });

    it('does not refresh when a different dashboard is edited', () => {
        expect(
            planDashboardAiAgentChanges({
                parts: [dashboardEditPart],
                handledToolCallIds: new Set(),
                currentDashboardSlug: 'other-dashboard',
                pendingChartToFocus: null,
            }),
        ).toEqual({
            handledToolCallIds: ['dashboard-edit'],
            actions: [],
            pendingChartToFocus: null,
        });
    });

    it('plans a focused SQL chart refresh for SQL chart edits', () => {
        expect(
            planDashboardAiAgentChanges({
                parts: [sqlChartEditPart],
                handledToolCallIds: new Set(),
                currentDashboardSlug: 'jaffle-dashboard',
                pendingChartToFocus: null,
            }),
        ).toEqual({
            handledToolCallIds: ['sql-chart-edit'],
            actions: [
                {
                    type: 'refreshChart',
                    chart: { type: 'sql_chart', slug: 'orders-by-status-sql' },
                    focusTile: true,
                },
            ],
            pendingChartToFocus: null,
        });
    });

    it('focuses a created SQL chart once the agent adds it to the current dashboard', () => {
        expect(
            planDashboardAiAgentChanges({
                parts: [sqlChartCreatePart, dashboardEditPart],
                handledToolCallIds: new Set(),
                currentDashboardSlug: 'jaffle-dashboard',
                pendingChartToFocus: null,
            }),
        ).toEqual({
            handledToolCallIds: ['sql-chart-create', 'dashboard-edit'],
            actions: [
                {
                    type: 'refreshDashboard',
                    focusChart: { type: 'sql_chart', slug: 'new-orders-sql' },
                },
            ],
            pendingChartToFocus: { type: 'sql_chart', slug: 'new-orders-sql' },
        });
    });

    it('waits for a dashboard edit before refreshing for a created SQL chart', () => {
        expect(
            planDashboardAiAgentChanges({
                parts: [sqlChartCreatePart],
                handledToolCallIds: new Set(),
                currentDashboardSlug: 'jaffle-dashboard',
                pendingChartToFocus: null,
            }),
        ).toEqual({
            handledToolCallIds: ['sql-chart-create'],
            actions: [],
            pendingChartToFocus: { type: 'sql_chart', slug: 'new-orders-sql' },
        });
    });

    it('ignores already handled tool calls', () => {
        expect(
            planDashboardAiAgentChanges({
                parts: [dashboardEditPart],
                handledToolCallIds: new Set(['dashboard-edit']),
                currentDashboardSlug: 'jaffle-dashboard',
                pendingChartToFocus: null,
            }),
        ).toEqual({
            handledToolCallIds: [],
            actions: [],
            pendingChartToFocus: null,
        });
    });
});

const tileBase = { x: 0, y: 0, h: 3, w: 6, tabUuid: undefined };

const savedChartTile: DashboardTile = {
    ...tileBase,
    uuid: 'saved-chart-tile',
    type: DashboardTileTypes.SAVED_CHART,
    properties: {
        savedChartUuid: 'saved-chart-uuid',
        chartSlug: 'orders',
    },
};

const sqlChartTile: DashboardTile = {
    ...tileBase,
    uuid: 'sql-chart-tile',
    type: DashboardTileTypes.SQL_CHART,
    properties: {
        savedSqlUuid: 'saved-sql-uuid',
        chartName: 'Orders (SQL)',
        chartSlug: 'orders',
    },
};

const unsavedSqlChartTile: DashboardTile = {
    ...tileBase,
    uuid: 'unsaved-sql-chart-tile',
    type: DashboardTileTypes.SQL_CHART,
    properties: {
        savedSqlUuid: null,
        chartName: 'Orders (SQL)',
        chartSlug: 'orders',
    },
};

describe('getDashboardTilesForChart', () => {
    const tiles = [savedChartTile, sqlChartTile, unsavedSqlChartTile];

    it('matches saved chart tiles for charts', () => {
        expect(
            getDashboardTilesForChart(tiles, { type: 'chart', slug: 'orders' }),
        ).toEqual({ type: 'chart', tiles: [savedChartTile] });
    });

    it('matches SQL chart tiles for SQL charts sharing a slug with a chart', () => {
        expect(
            getDashboardTilesForChart(tiles, {
                type: 'sql_chart',
                slug: 'orders',
            }),
        ).toEqual({ type: 'sql_chart', tiles: [sqlChartTile] });
    });

    it('matches nothing for unknown slugs', () => {
        expect(
            getDashboardTilesForChart(tiles, {
                type: 'sql_chart',
                slug: 'missing',
            }),
        ).toEqual({ type: 'sql_chart', tiles: [] });
    });
});
