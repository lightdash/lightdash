import {
    ChartType,
    QuerySourceType,
    SAVED_COMPOSER_PIPELINE_SCHEMA_VERSION,
    type ComposerSavedChartDAO,
    type SavedChartDAO,
    type SavedChartVariant,
    type SavedComposerPipeline,
} from '@lightdash/common';

export const composerPipelineFixture: SavedComposerPipeline = {
    schemaVersion: SAVED_COMPOSER_PIPELINE_SCHEMA_VERSION,
    nodes: [
        {
            sourceType: QuerySourceType.SEMANTIC_LAYER,
            nodeId: 'orders',
            title: 'Orders',
            exploreName: 'orders',
            dimensions: ['orders_status'],
            metrics: ['orders_total_order_amount'],
            limit: 500,
        },
        {
            sourceType: QuerySourceType.DUCKDB,
            nodeId: 'by_status',
            title: 'Revenue by status',
            sql: 'SELECT orders_status, sum(orders_total_order_amount) AS revenue FROM orders GROUP BY 1',
            references: ['orders'],
            limit: 100,
        },
    ],
    terminalNodeId: 'by_status',
};

/** A composer chart as `SavedChartModel.getVariant` returns it, for service unit tests. */
export const composerSavedChartVariant = (
    overrides: Partial<ComposerSavedChartDAO> = {},
): Extract<SavedChartVariant, { queryType: 'composer' }> => ({
    queryType: 'composer',
    chart: {
        uuid: 'composer-chart-uuid',
        name: 'Revenue by status',
        slug: 'revenue-by-status',
        projectUuid: 'project-uuid',
        organizationUuid: 'organization-uuid',
        spaceUuid: 'space-uuid',
        spaceName: 'Space',
        dashboardUuid: 'dashboard-uuid',
        dashboardName: 'Dashboard',
        dashboardSlug: 'dashboard',
        chartConfig: { type: ChartType.TABLE, config: undefined },
        pivotConfig: undefined,
        parameters: undefined,
        updatedAt: new Date('2026-01-01'),
        pinnedListUuid: null,
        pinnedListOrder: null,
        colorPalette: [],
        pipeline: composerPipelineFixture,
        ...overrides,
    } as ComposerSavedChartDAO,
});

/** Wraps a classic chart stub the way `getVariant` returns it. */
export const semanticSavedChartVariant = <T>(
    chart: T,
): Extract<SavedChartVariant, { queryType: 'semantic' }> => ({
    queryType: 'semantic',
    chart: chart as SavedChartDAO,
});
