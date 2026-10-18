import {
    ChartType,
    DimensionType,
    FieldType,
    PIPELINE_VIZ_NODE_ID,
    QuerySourceType,
    type ChartConfig,
    type SavedChartDAO,
    type SavedPipelineDefinition,
} from '@lightdash/common';
import { planSavedPipelineRun } from './savedPipelineExecution';

const pipeline: SavedPipelineDefinition = {
    queries: [
        {
            sourceType: QuerySourceType.SEMANTIC_LAYER,
            nodeId: 'orders',
            exploreName: 'orders',
            dimensions: ['orders_status'],
            metrics: ['orders_total'],
        },
        {
            sourceType: QuerySourceType.DUCKDB,
            nodeId: 'ranked',
            title: 'Ranked orders',
            sql: 'SELECT orders_status AS status, orders_total AS total FROM orders',
            references: ['orders'],
        },
    ],
    terminalNodeId: 'ranked',
    columns: {
        status: { reference: 'status', type: DimensionType.STRING },
        total: {
            reference: 'total',
            type: DimensionType.NUMBER,
            provenance: {
                fieldId: 'orders_total',
                fieldType: FieldType.METRIC,
            },
        },
    },
};

const savedChart: Pick<
    SavedChartDAO,
    'metricQuery' | 'chartConfig' | 'pivotConfig' | 'tableConfig'
> = {
    metricQuery: {
        exploreName: 'ranked',
        dimensions: ['ranked_status'],
        metrics: ['ranked_total'],
        filters: {},
        sorts: [{ fieldId: 'ranked_total', descending: true }],
        limit: 500,
        tableCalculations: [],
    },
    chartConfig: { type: ChartType.TABLE, config: {} },
    pivotConfig: undefined,
    tableConfig: { columnOrder: ['ranked_total', 'ranked_status', 'stale'] },
};

describe('planSavedPipelineRun', () => {
    it('appends the chart node and keys the result by field id', () => {
        const plan = planSavedPipelineRun({
            savedChart,
            pipeline,
            pivotResults: true,
            pivotConfiguration: undefined,
            dashboardSorts: undefined,
            limit: 500,
        });
        expect(plan.queries.map((query) => query.nodeId)).toEqual([
            'orders',
            'ranked',
            PIPELINE_VIZ_NODE_ID,
        ]);
        expect(plan.columnOrder).toEqual(['ranked_total', 'ranked_status']);
        expect(plan.metricQuery.exploreName).toBe('ranked');
        expect(plan.metricQuery.dimensions).toEqual(['ranked_status']);
        expect(plan.metricQuery.metrics).toEqual(['ranked_total']);
        expect(plan.sorts).toEqual([
            { fieldId: 'ranked_total', descending: true },
        ]);
        expect(plan.originalColumns.ranked_total).toMatchObject({
            reference: 'ranked_total',
            type: DimensionType.NUMBER,
            provenance: {
                fieldId: 'ranked_total',
                sourceQueryUuid: 'ranked',
                fieldType: FieldType.METRIC,
            },
        });
        expect(plan.typedColumns).toEqual([
            { reference: 'ranked_status', type: DimensionType.STRING },
            { reference: 'ranked_total', type: DimensionType.NUMBER },
        ]);
        expect(plan.referenceLabels).toEqual({ ranked: 'Ranked orders' });
        // A table chart has nothing to pivot
        expect(plan.pivotConfiguration).toBeUndefined();
    });

    it('takes validated dashboard sorts over the chart sort', () => {
        const plan = planSavedPipelineRun({
            savedChart,
            pipeline,
            pivotResults: false,
            pivotConfiguration: undefined,
            dashboardSorts: [
                { fieldId: 'ranked_status', descending: false },
                { fieldId: 'other_field', descending: false },
            ],
            limit: 10,
        });
        expect(plan.sorts).toEqual([
            { fieldId: 'ranked_status', descending: false },
        ]);
        expect(plan.limit).toBe(10);
        expect(plan.metricQuery.limit).toBe(10);
    });

    it('derives the pivot from a grouped chart and hands it to the chart node', () => {
        const plan = planSavedPipelineRun({
            savedChart: {
                ...savedChart,
                chartConfig: {
                    type: ChartType.CARTESIAN,
                    config: {
                        layout: {
                            xField: 'ranked_status',
                            yField: ['ranked_total'],
                        },
                        eChartsConfig: { series: [] },
                    },
                } as ChartConfig,
                pivotConfig: { columns: ['ranked_status'] },
            },
            pipeline,
            pivotResults: true,
            pivotConfiguration: undefined,
            dashboardSorts: undefined,
            limit: 500,
        });
        const vizNode = plan.queries.find(
            (query) => query.nodeId === PIPELINE_VIZ_NODE_ID,
        );
        expect(plan.pivotConfiguration).toBeDefined();
        expect(vizNode).toMatchObject({
            sourceType: QuerySourceType.DUCKDB,
            pivotConfiguration: plan.pivotConfiguration,
        });
    });
});
