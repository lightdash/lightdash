import { describe, expect, it } from 'vitest';
import { type StreamPart } from '../../ee/features/aiCopilot/store/aiAgentThreadStreamSlice';
import { planDashboardAiAgentChanges } from './dashboardAiAgentChangePlanner';

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
    },
} as StreamPart;

describe('planDashboardAiAgentChanges', () => {
    it('plans a dashboard refresh for current dashboard edits', () => {
        expect(
            planDashboardAiAgentChanges({
                parts: [dashboardEditPart],
                handledToolCallIds: new Set(),
                currentDashboardSlug: 'jaffle-dashboard',
                pendingChartSlugToFocus: null,
            }),
        ).toEqual({
            handledToolCallIds: ['dashboard-edit'],
            actions: [{ type: 'refreshDashboard', focusChartSlug: undefined }],
            pendingChartSlugToFocus: null,
        });
    });

    it('plans focused chart refreshes for chart edits', () => {
        expect(
            planDashboardAiAgentChanges({
                parts: [chartEditPart],
                handledToolCallIds: new Set(),
                currentDashboardSlug: 'jaffle-dashboard',
                pendingChartSlugToFocus: null,
            }),
        ).toEqual({
            handledToolCallIds: ['chart-edit'],
            actions: [
                {
                    type: 'refreshChart',
                    chartSlug: 'orders-over-time',
                    focusTile: true,
                },
            ],
            pendingChartSlugToFocus: null,
        });
    });

    it('plans a dashboard refresh when a chart is created on the current dashboard', () => {
        expect(
            planDashboardAiAgentChanges({
                parts: [chartCreatePart],
                handledToolCallIds: new Set(),
                currentDashboardSlug: 'jaffle-dashboard',
                pendingChartSlugToFocus: null,
            }),
        ).toEqual({
            handledToolCallIds: ['chart-create'],
            actions: [
                {
                    type: 'refreshDashboard',
                    focusChartSlug: 'new-orders-chart',
                },
            ],
            pendingChartSlugToFocus: 'new-orders-chart',
        });
    });

    it('uses the pending chart focus when the current dashboard is refreshed', () => {
        expect(
            planDashboardAiAgentChanges({
                parts: [dashboardEditPart],
                handledToolCallIds: new Set(),
                currentDashboardSlug: 'jaffle-dashboard',
                pendingChartSlugToFocus: 'new-orders-chart',
            }),
        ).toEqual({
            handledToolCallIds: ['dashboard-edit'],
            actions: [
                {
                    type: 'refreshDashboard',
                    focusChartSlug: 'new-orders-chart',
                },
            ],
            pendingChartSlugToFocus: 'new-orders-chart',
        });
    });

    it('does not refresh when a different dashboard is edited', () => {
        expect(
            planDashboardAiAgentChanges({
                parts: [dashboardEditPart],
                handledToolCallIds: new Set(),
                currentDashboardSlug: 'other-dashboard',
                pendingChartSlugToFocus: null,
            }),
        ).toEqual({
            handledToolCallIds: ['dashboard-edit'],
            actions: [],
            pendingChartSlugToFocus: null,
        });
    });

    it('ignores already handled tool calls', () => {
        expect(
            planDashboardAiAgentChanges({
                parts: [dashboardEditPart],
                handledToolCallIds: new Set(['dashboard-edit']),
                currentDashboardSlug: 'jaffle-dashboard',
                pendingChartSlugToFocus: null,
            }),
        ).toEqual({
            handledToolCallIds: [],
            actions: [],
            pendingChartSlugToFocus: null,
        });
    });
});
