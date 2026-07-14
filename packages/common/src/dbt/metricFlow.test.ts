import { warehouseClientMock } from '../compiler/exploreCompiler.mock';
import { convertExplores } from '../compiler/translator';
import { model as MOCK_MODEL } from '../compiler/translator.mock';
import { SupportedDbtAdapter, type DbtModelNode } from '../types/dbt';
import {
    MetricFlowAggregation,
    type DbtSemanticMetric,
    type DbtSemanticModel,
} from '../types/dbtSemanticLayer';
import { type Explore } from '../types/explore';
import { FieldType, MetricType } from '../types/field';
import { DEFAULT_SPOTLIGHT_CONFIG } from '../types/lightdashProjectConfig';
import { translateMetricFlowMetrics } from './metricFlow';

const ordersSemanticModel: DbtSemanticModel = {
    name: 'orders',
    unique_id: 'semantic_model.jaffle.orders',
    model: "ref('orders')",
    node_relation: {
        alias: 'orders',
        schema_name: 'jaffle',
        database: 'db',
        relation_name: '"db"."jaffle"."orders"',
    },
    depends_on: { nodes: ['model.jaffle.orders'] },
    measures: [
        { name: 'order_total', agg: MetricFlowAggregation.SUM, expr: 'amount' },
        { name: 'order_count', agg: MetricFlowAggregation.COUNT, expr: '1' },
        {
            name: 'unique_customers',
            agg: MetricFlowAggregation.COUNT_DISTINCT,
            expr: 'customer_id',
            create_metric: true,
            label: 'Unique customers',
        },
    ],
};

const modelNamesByUniqueId = { 'model.jaffle.orders': 'orders' };

const simpleMetric = (
    name: string,
    measureName: string,
    extra: Partial<DbtSemanticMetric> = {},
): DbtSemanticMetric => ({
    name,
    unique_id: `metric.jaffle.${name}`,
    type: 'simple',
    type_params: { measure: { name: measureName } },
    ...extra,
});

describe('translateMetricFlowMetrics', () => {
    it('translates a simple metric into a Lightdash model metric', () => {
        const result = translateMetricFlowMetrics({
            semanticModels: {
                [ordersSemanticModel.unique_id]: ordersSemanticModel,
            },
            metrics: {
                'metric.jaffle.revenue': simpleMetric(
                    'revenue',
                    'order_total',
                    {
                        label: 'Revenue',
                        description: 'Total revenue',
                    },
                ),
            },
            modelNamesByUniqueId,
        });

        expect(result.translatedCount).toBe(2); // revenue + create_metric measure
        expect(result.metricsByModel.orders.revenue).toEqual({
            type: MetricType.SUM,
            sql: '${TABLE}.amount',
            label: 'Revenue',
            description: 'Total revenue',
        });
    });

    it('qualifies bare column exprs and passes complex exprs through', () => {
        const result = translateMetricFlowMetrics({
            semanticModels: {
                sm: {
                    ...ordersSemanticModel,
                    measures: [
                        {
                            name: 'completed_total',
                            agg: MetricFlowAggregation.SUM,
                            expr: "case when status = 'completed' then amount else 0 end",
                        },
                    ],
                },
            },
            metrics: {
                m: simpleMetric('completed_revenue', 'completed_total'),
            },
            modelNamesByUniqueId,
        });
        expect(result.metricsByModel.orders.completed_revenue.sql).toBe(
            "case when status = 'completed' then amount else 0 end",
        );
    });

    it('defaults sql to the measure name when expr is missing', () => {
        const result = translateMetricFlowMetrics({
            semanticModels: {
                sm: {
                    ...ordersSemanticModel,
                    measures: [
                        { name: 'amount', agg: MetricFlowAggregation.SUM },
                    ],
                },
            },
            metrics: { m: simpleMetric('total_amount', 'amount') },
            modelNamesByUniqueId,
        });
        expect(result.metricsByModel.orders.total_amount.sql).toBe(
            '${TABLE}.amount',
        );
    });

    it('translates create_metric measures and scales a 0-1 percentile to 0-100', () => {
        const result = translateMetricFlowMetrics({
            semanticModels: {
                sm: {
                    ...ordersSemanticModel,
                    measures: [
                        {
                            name: 'p95_total',
                            agg: MetricFlowAggregation.PERCENTILE,
                            expr: 'amount',
                            create_metric: true,
                            agg_params: { percentile: 0.95 },
                        },
                    ],
                },
            },
            metrics: {},
            modelNamesByUniqueId,
        });
        expect(result.metricsByModel.orders.p95_total).toEqual({
            type: MetricType.PERCENTILE,
            sql: '${TABLE}.amount',
            label: undefined,
            description: undefined,
            percentile: 95,
        });
    });

    it('accepts a percentile already on the 0-100 scale', () => {
        const result = translateMetricFlowMetrics({
            semanticModels: {
                sm: {
                    ...ordersSemanticModel,
                    measures: [
                        {
                            name: 'p90_total',
                            agg: MetricFlowAggregation.PERCENTILE,
                            expr: 'amount',
                            create_metric: true,
                            agg_params: { percentile: 90 },
                        },
                    ],
                },
            },
            metrics: {},
            modelNamesByUniqueId,
        });
        expect(result.metricsByModel.orders.p90_total.percentile).toBe(90);
    });

    it('does not duplicate a create_metric measure already defined as an explicit metric', () => {
        const result = translateMetricFlowMetrics({
            semanticModels: { sm: ordersSemanticModel },
            metrics: {
                m: simpleMetric('unique_customers', 'unique_customers'),
            },
            modelNamesByUniqueId,
        });
        expect(Object.keys(result.metricsByModel.orders)).toEqual([
            'unique_customers',
        ]);
        expect(result.translatedCount).toBe(1);
    });

    // dbt Fusion / latest-spec manifests inline the aggregation on the metric
    // (type_params.measure is null) and mirror it as a create_metric measure.
    it('translates a Fusion-style simple metric via metric_aggregation_params', () => {
        const result = translateMetricFlowMetrics({
            semanticModels: {
                sm: {
                    ...ordersSemanticModel,
                    measures: [
                        {
                            name: 'total_revenue',
                            agg: MetricFlowAggregation.SUM,
                            expr: 'amount',
                            create_metric: true,
                        },
                    ],
                },
            },
            metrics: {
                m: {
                    name: 'total_revenue',
                    unique_id: 'metric.jaffle.total_revenue',
                    type: 'simple',
                    label: 'Total revenue',
                    description: 'Sum of all order amounts',
                    type_params: {
                        measure: null,
                        expr: 'amount',
                        metric_aggregation_params: {
                            semantic_model: 'orders',
                            agg: MetricFlowAggregation.SUM,
                            expr: 'amount',
                            agg_params: { percentile: null },
                        },
                    },
                },
            },
            modelNamesByUniqueId,
        });

        // Exactly one metric: the mirrored create_metric measure is deduped.
        expect(result.translatedCount).toBe(1);
        expect(result.metricsByModel.orders.total_revenue).toEqual({
            type: MetricType.SUM,
            sql: '${TABLE}.amount',
            label: 'Total revenue',
            description: 'Sum of all order amounts',
        });
    });

    it('does not translate the mirrored measure of a skipped filtered metric', () => {
        const result = translateMetricFlowMetrics({
            semanticModels: {
                sm: {
                    ...ordersSemanticModel,
                    measures: [
                        {
                            name: 'completed_revenue',
                            agg: MetricFlowAggregation.SUM,
                            expr: 'amount',
                            create_metric: true,
                        },
                    ],
                },
            },
            metrics: {
                m: {
                    name: 'completed_revenue',
                    unique_id: 'metric.jaffle.completed_revenue',
                    type: 'simple',
                    filter: { where_filters: [{ where_sql_template: '1=1' }] },
                    type_params: {
                        measure: null,
                        metric_aggregation_params: {
                            semantic_model: 'orders',
                            agg: MetricFlowAggregation.SUM,
                            expr: 'amount',
                        },
                    },
                },
            },
            modelNamesByUniqueId,
        });

        // The filtered metric is skipped and its mirrored create_metric
        // measure must not resurface as an unfiltered metric.
        expect(result.metricsByModel.orders?.completed_revenue).toBeUndefined();
        expect(result.skippedCount).toBe(1);
        expect(result.warnings.join(' ')).toContain('filters');
    });

    it.each([
        ['ratio', { type: 'ratio' as const, type_params: {} }],
        ['derived', { type: 'derived' as const, type_params: {} }],
        ['cumulative', { type: 'cumulative' as const, type_params: {} }],
    ])(
        'skips unsupported metric type %s with a warning',
        (_label, overrides) => {
            const result = translateMetricFlowMetrics({
                semanticModels: {
                    sm: { ...ordersSemanticModel, measures: [] },
                },
                metrics: {
                    m: {
                        name: 'unsupported',
                        unique_id: 'metric.jaffle.unsupported',
                        ...overrides,
                    },
                },
                modelNamesByUniqueId,
            });
            expect(result.translatedCount).toBe(0);
            expect(result.skippedCount).toBe(1);
            expect(result.warnings[0]).toContain('unsupported');
        },
    );

    it('skips filtered metrics', () => {
        const result = translateMetricFlowMetrics({
            semanticModels: { sm: ordersSemanticModel },
            metrics: {
                m: simpleMetric('filtered', 'order_total', {
                    filter: { where_filters: [{ where_sql_template: '1=1' }] },
                }),
            },
            modelNamesByUniqueId,
        });
        expect(result.metricsByModel.orders?.filtered).toBeUndefined();
        expect(result.skippedCount).toBe(1);
        expect(result.warnings[0]).toContain('filters');
    });

    it('skips sum_boolean measures', () => {
        const result = translateMetricFlowMetrics({
            semanticModels: {
                sm: {
                    ...ordersSemanticModel,
                    measures: [
                        {
                            name: 'is_food',
                            agg: MetricFlowAggregation.SUM_BOOLEAN,
                            expr: 'is_food_order',
                        },
                    ],
                },
            },
            metrics: { m: simpleMetric('food_orders', 'is_food') },
            modelNamesByUniqueId,
        });
        expect(result.skippedCount).toBe(1);
        expect(result.warnings[0]).toContain('not supported');
    });

    it('skips percentile measures without a numeric percentile value', () => {
        // Translating without a value would silently compile to the warehouse
        // default (p50) — must skip with a warning instead.
        const result = translateMetricFlowMetrics({
            semanticModels: {
                sm: {
                    ...ordersSemanticModel,
                    measures: [
                        {
                            name: 'p95_total',
                            agg: MetricFlowAggregation.PERCENTILE,
                            expr: 'amount',
                            create_metric: true,
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            agg_params: { percentile: 'ninety' as any },
                        },
                    ],
                },
            },
            metrics: {},
            modelNamesByUniqueId,
        });
        expect(result.metricsByModel.orders?.p95_total).toBeUndefined();
        expect(result.skippedCount).toBe(1);
        expect(result.warnings[0]).toContain('numeric agg_params.percentile');
    });

    it('counts malformed metric entries as skipped with a warning', () => {
        const result = translateMetricFlowMetrics({
            semanticModels: { sm: ordersSemanticModel },
            metrics: {
                'metric.jaffle.broken': {
                    name: 'broken',
                    unique_id: 'metric.jaffle.broken',
                    type: 'simple',
                    type_params: null,
                },
                'metric.jaffle.garbage': 'i am not a metric object',
            },
            modelNamesByUniqueId,
        });
        expect(result.skippedCount).toBe(2);
        expect(result.warnings).toEqual([
            expect.stringContaining('"broken": malformed metric definition'),
            expect.stringContaining('malformed metric definition'),
        ]);
    });

    it('does not throw when a semantic model has a non-array measures value', () => {
        const result = translateMetricFlowMetrics({
            semanticModels: {
                sm: {
                    ...ordersSemanticModel,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    measures: 'notanarray' as any,
                },
            },
            metrics: {},
            modelNamesByUniqueId,
        });
        expect(result.translatedCount).toBe(0);
        expect(result.skippedCount).toBe(0);
    });

    it('skips metrics whose semantic model targets a model that is not being deployed', () => {
        const result = translateMetricFlowMetrics({
            semanticModels: { sm: ordersSemanticModel },
            metrics: { m: simpleMetric('revenue', 'order_total') },
            modelNamesByUniqueId: {},
        });
        expect(result.translatedCount).toBe(0);
        expect(result.warnings.join(' ')).toContain('could not resolve');
    });

    // End-to-end: translated metrics must compile into a real Explore metric,
    // mirroring how the CLI merges them into model meta before convertExplores.
    it('produces a metric that compiles through convertExplores', async () => {
        const modelUniqueId = 'model.test.myTable';
        const semanticModel: DbtSemanticModel = {
            name: 'my_table',
            unique_id: 'semantic_model.test.my_table',
            model: "ref('myTable')",
            node_relation: { alias: 'myTable', schema_name: 'mySchema' },
            depends_on: { nodes: [modelUniqueId] },
            measures: [
                {
                    name: 'total_column',
                    agg: MetricFlowAggregation.SUM,
                    expr: 'myColumnName',
                    label: 'Total column',
                },
            ],
        };

        const { metricsByModel, translatedCount } = translateMetricFlowMetrics({
            semanticModels: { [semanticModel.unique_id]: semanticModel },
            metrics: {
                m: simpleMetric('total_revenue', 'total_column', {
                    label: 'Total revenue',
                }),
            },
            modelNamesByUniqueId: { [modelUniqueId]: MOCK_MODEL.name },
        });
        expect(translatedCount).toBe(1);

        const modelWithMetrics: DbtModelNode = {
            ...MOCK_MODEL,
            unique_id: modelUniqueId,
            meta: {
                ...MOCK_MODEL.meta,
                metrics: metricsByModel[MOCK_MODEL.name],
            },
        };

        const explores = await convertExplores(
            [modelWithMetrics],
            false,
            SupportedDbtAdapter.POSTGRES,
            warehouseClientMock,
            { spotlight: DEFAULT_SPOTLIGHT_CONFIG },
        );

        const explore = explores.find(
            (e) => 'name' in e && e.name === MOCK_MODEL.name,
        ) as Explore;
        const metric = explore.tables[MOCK_MODEL.name].metrics.total_revenue;
        expect(metric.fieldType).toBe(FieldType.METRIC);
        expect(metric.type).toBe(MetricType.SUM);
        expect(metric.label).toBe('Total revenue');
        expect(metric.compiledSql).toBe('SUM("myTable".myColumnName)');
    });
});
