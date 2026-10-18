import { describe, expect, it } from 'vitest';
import {
    SortByDirection,
    VizAggregationOptions,
    VizIndexType,
    type AllVizChartConfig,
} from '../visualizations/types';
import { DimensionType, FieldType } from './field';
import { QuerySourceType } from './querySources';
import { ChartKind, ChartType } from './savedCharts';
import {
    buildSqlChartPipeline,
    convertSqlChartToPipelineChart,
    getPipelineSqlChartSource,
    SQL_CHART_AGGREGATE_NODE_ID,
    SQL_CHART_NODE_ID,
} from './sqlChartPipeline';

const sql = 'select status, amount, region from orders';

describe('convertSqlChartToPipelineChart', () => {
    it('turns an aggregated bar chart into a SQL node, an aggregate node and a cartesian config', () => {
        const config: AllVizChartConfig = {
            metadata: { version: 1 },
            type: ChartKind.VERTICAL_BAR,
            fieldConfig: {
                x: { reference: 'status', type: VizIndexType.CATEGORY },
                y: [
                    {
                        reference: 'amount',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupBy: [{ reference: 'region' }],
                sortBy: [
                    { reference: 'amount', direction: SortByDirection.DESC },
                ],
            },
            display: {
                xAxis: { label: 'Status' },
                yAxis: [{ label: 'Amount' }],
                series: { amount_sum: { color: '#123456', label: 'Total' } },
                stack: true,
            },
        };
        const chart = convertSqlChartToPipelineChart({
            sql,
            limit: 500,
            config,
        });
        expect(chart.pipeline.queries.map((node) => node.nodeId)).toEqual([
            SQL_CHART_NODE_ID,
            SQL_CHART_AGGREGATE_NODE_ID,
        ]);
        expect(chart.pipeline.queries[0]).toMatchObject({
            sourceType: QuerySourceType.SQL,
            sql,
            limit: 500,
        });
        expect(chart.pipeline.queries[1]).toMatchObject({
            sourceType: QuerySourceType.DUCKDB,
            sql: 'SELECT "status" AS "status", "region" AS "region", SUM("amount") AS "amount_sum" FROM "sql" GROUP BY "status", "region"',
            references: [SQL_CHART_NODE_ID],
        });
        expect(chart.pipeline.terminalNodeId).toBe(SQL_CHART_AGGREGATE_NODE_ID);
        expect(Object.keys(chart.pipeline.columns)).toEqual([
            'status',
            'region',
            'amount_sum',
        ]);
        expect(chart.pipeline.columns.amount_sum).toMatchObject({
            type: DimensionType.NUMBER,
            provenance: { fieldType: FieldType.METRIC },
        });
        expect(chart.tableName).toBe(SQL_CHART_AGGREGATE_NODE_ID);
        expect(chart.metricQuery).toMatchObject({
            exploreName: SQL_CHART_AGGREGATE_NODE_ID,
            dimensions: ['aggregated_status', 'aggregated_region'],
            metrics: ['aggregated_amount_sum'],
            sorts: [{ fieldId: 'aggregated_amount_sum', descending: true }],
            limit: 500,
        });
        expect(chart.pivotConfig).toEqual({ columns: ['aggregated_region'] });
        expect(chart.chartConfig.type).toBe(ChartType.CARTESIAN);
        if (chart.chartConfig.type !== ChartType.CARTESIAN) return;
        expect(chart.chartConfig.config?.layout).toEqual({
            xField: 'aggregated_status',
            yField: ['aggregated_amount_sum'],
        });
        expect(
            chart.chartConfig.config?.eChartsConfig.series?.[0],
        ).toMatchObject({
            type: 'bar',
            encode: {
                xRef: { field: 'aggregated_status' },
                yRef: { field: 'aggregated_amount_sum' },
            },
            stack: 'stack',
            color: '#123456',
            name: 'Total',
        });
        expect(chart.chartConfig.config?.eChartsConfig.xAxis?.[0].name).toBe(
            'Status',
        );
    });

    it('keeps the statement as the terminal node of a table chart and uses discovered columns', () => {
        const config: AllVizChartConfig = {
            metadata: { version: 1 },
            type: ChartKind.TABLE,
            columns: {
                amount: {
                    visible: true,
                    reference: 'amount',
                    label: 'Amount',
                    frozen: false,
                    order: 1,
                },
                status: {
                    visible: false,
                    reference: 'status',
                    label: 'Status',
                    frozen: true,
                    order: 0,
                },
            },
            display: undefined,
        };
        const chart = convertSqlChartToPipelineChart({
            sql,
            limit: 100,
            config,
            columns: {
                status: { reference: 'status', type: DimensionType.STRING },
                amount: { reference: 'amount', type: DimensionType.NUMBER },
                region: { reference: 'region', type: DimensionType.STRING },
            },
        });
        expect(chart.pipeline.queries).toHaveLength(1);
        expect(chart.pipeline.terminalNodeId).toBe(SQL_CHART_NODE_ID);
        expect(chart.tableConfig.columnOrder).toEqual([
            'sql_status',
            'sql_amount',
            'sql_region',
        ]);
        expect(chart.metricQuery.dimensions).toEqual([
            'sql_status',
            'sql_region',
        ]);
        expect(chart.metricQuery.metrics).toEqual(['sql_amount']);
        expect(chart.chartConfig).toEqual({
            type: ChartType.TABLE,
            config: {
                columns: {
                    sql_amount: {
                        visible: true,
                        name: 'Amount',
                        frozen: false,
                    },
                    sql_status: {
                        visible: false,
                        name: 'Status',
                        frozen: true,
                    },
                },
            },
        });
    });

    it('turns a big number into an aggregate over every row', () => {
        const config: AllVizChartConfig = {
            metadata: { version: 1 },
            type: ChartKind.BIG_NUMBER,
            fieldConfig: {
                x: undefined,
                y: [
                    {
                        reference: 'amount',
                        aggregation: VizAggregationOptions.AVERAGE,
                    },
                ],
                groupBy: undefined,
            },
            display: { label: 'Average order', style: undefined },
        };
        const chart = convertSqlChartToPipelineChart({
            sql,
            limit: 500,
            config,
        });
        expect(chart.pipeline.queries[1]).toMatchObject({
            sql: 'SELECT AVG("amount") AS "amount_avg" FROM "sql"',
        });
        expect(chart.chartConfig).toMatchObject({
            type: ChartType.BIG_NUMBER,
            config: {
                selectedField: 'aggregated_amount_avg',
                label: 'Average order',
            },
        });
        expect(chart.pivotConfig).toBeUndefined();
    });

    it('turns a pie into group fields and a metric', () => {
        const config: AllVizChartConfig = {
            metadata: { version: 1 },
            type: ChartKind.PIE,
            fieldConfig: {
                x: { reference: 'status', type: VizIndexType.CATEGORY },
                y: [
                    {
                        reference: 'amount',
                        aggregation: VizAggregationOptions.COUNT,
                    },
                ],
                groupBy: undefined,
            },
            display: { isDonut: true },
        };
        const chart = convertSqlChartToPipelineChart({
            sql,
            limit: 500,
            config,
        });
        expect(chart.chartConfig).toEqual({
            type: ChartType.PIE,
            config: {
                groupFieldIds: ['aggregated_status'],
                metricId: 'aggregated_amount_count',
                isDonut: true,
            },
        });
    });
});

describe('buildSqlChartPipeline / getPipelineSqlChartSource', () => {
    const columns = {
        status: { reference: 'status', type: DimensionType.STRING },
    };

    it('saves a SQL runner chart as a one-node pipeline the SQL runner can reopen', () => {
        const pipeline = buildSqlChartPipeline({
            sql: 'select status from orders',
            limit: 50,
            columns,
            warehouseConnectionUuid: 'finance-uuid',
        });
        expect(pipeline.queries).toHaveLength(1);
        expect(pipeline.terminalNodeId).toBe(SQL_CHART_NODE_ID);
        expect(getPipelineSqlChartSource(pipeline)).toEqual({
            sql: 'select status from orders',
            limit: 50,
            warehouseConnectionUuid: 'finance-uuid',
        });
    });

    it('omits the connection for the original warehouse and reads it back as null', () => {
        const pipeline = buildSqlChartPipeline({
            sql: 'select 1',
            limit: 10,
            columns,
            warehouseConnectionUuid: null,
        });
        expect(pipeline.queries[0]).not.toHaveProperty(
            'warehouseConnectionUuid',
        );
        expect(
            getPipelineSqlChartSource(pipeline)?.warehouseConnectionUuid,
        ).toBe(null);
    });

    it('does not reopen a folded chart that aggregates at draw time, nor a composer pipeline', () => {
        const aggregated = convertSqlChartToPipelineChart({
            sql: 'select status, amount from orders',
            limit: 500,
            config: {
                metadata: { version: 1 },
                type: ChartKind.VERTICAL_BAR,
                fieldConfig: {
                    x: { reference: 'status', type: VizIndexType.CATEGORY },
                    y: [
                        {
                            reference: 'amount',
                            aggregation: VizAggregationOptions.SUM,
                        },
                    ],
                    groupBy: undefined,
                },
                display: undefined,
            },
        });
        expect(getPipelineSqlChartSource(aggregated.pipeline)).toBeNull();
        expect(
            getPipelineSqlChartSource({
                queries: [
                    {
                        sourceType: QuerySourceType.SEMANTIC_LAYER,
                        nodeId: 'orders',
                        exploreName: 'orders',
                        dimensions: [],
                        metrics: [],
                    },
                ],
                terminalNodeId: 'orders',
            }),
        ).toBeNull();
    });
});
