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
    entities: [
        { name: 'order', type: 'primary', expr: 'order_id' },
        { name: 'customer', type: 'foreign', expr: 'customer_id' },
    ],
    dimensions: [
        { name: 'status', type: 'categorical', expr: null },
        { name: 'ordered_at', type: 'time', expr: 'ordered_at' },
    ],
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
                    // TimeDimension() templates are untranslatable, so this
                    // metric must be skipped entirely.
                    filter: {
                        where_filters: [
                            {
                                where_sql_template:
                                    "{{ TimeDimension('order__ordered_at', 'day') }} >= '2024-01-01'",
                            },
                        ],
                    },
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

        // The untranslatable metric is skipped and its mirrored create_metric
        // measure must not resurface as an unfiltered metric.
        expect(result.metricsByModel.orders?.completed_revenue).toBeUndefined();
        expect(result.skippedCount).toBe(1);
        expect(result.warnings.join(' ')).toContain('template functions');
    });

    it.each([
        ['cumulative', { type: 'cumulative' as const, type_params: {} }],
        ['conversion', { type: 'conversion' as const, type_params: {} }],
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

    describe('where filters', () => {
        it('translates a metric filter into a CASE WHEN over the measure', () => {
            const result = translateMetricFlowMetrics({
                semanticModels: { sm: ordersSemanticModel },
                metrics: {
                    m: simpleMetric('completed_revenue', 'order_total', {
                        filter: {
                            where_filters: [
                                {
                                    where_sql_template:
                                        "{{ Dimension('order__status') }} = 'completed'\n",
                                },
                            ],
                        },
                    }),
                },
                modelNamesByUniqueId,
            });
            expect(result.metricsByModel.orders.completed_revenue).toEqual({
                type: MetricType.SUM,
                sql: "CASE WHEN (${TABLE}.status = 'completed') THEN (${TABLE}.amount) END",
                label: undefined,
                description: undefined,
            });
        });

        it('combines metric-level and measure-level filters with AND', () => {
            const result = translateMetricFlowMetrics({
                semanticModels: { sm: ordersSemanticModel },
                metrics: {
                    m: {
                        ...simpleMetric('completed_recent', 'order_total', {
                            filter: {
                                where_filters: [
                                    {
                                        where_sql_template:
                                            "{{ Dimension('order__status') }} = 'completed'",
                                    },
                                ],
                            },
                        }),
                        type_params: {
                            measure: {
                                name: 'order_total',
                                filter: {
                                    where_filters: [
                                        {
                                            where_sql_template:
                                                "{{ Dimension('order__status') }} != 'returned'",
                                        },
                                    ],
                                },
                            },
                        },
                    },
                },
                modelNamesByUniqueId,
            });
            expect(result.metricsByModel.orders.completed_recent.sql).toBe(
                "CASE WHEN (${TABLE}.status = 'completed') AND (${TABLE}.status != 'returned') THEN (${TABLE}.amount) END",
            );
        });

        it('inlines a dimension expr when the dimension is not a plain column', () => {
            const result = translateMetricFlowMetrics({
                semanticModels: {
                    sm: {
                        ...ordersSemanticModel,
                        dimensions: [
                            {
                                name: 'status',
                                type: 'categorical',
                                expr: "lower(raw_status || '')",
                            },
                        ],
                    },
                },
                metrics: {
                    m: simpleMetric('completed_revenue', 'order_total', {
                        filter: {
                            where_filters: [
                                {
                                    where_sql_template:
                                        "{{ Dimension('order__status') }} = 'completed'",
                                },
                            ],
                        },
                    }),
                },
                modelNamesByUniqueId,
            });
            expect(result.metricsByModel.orders.completed_revenue.sql).toBe(
                "CASE WHEN ((lower(raw_status || '')) = 'completed') THEN (${TABLE}.amount) END",
            );
        });

        it('skips filters referencing dimensions that do not resolve on the semantic model', () => {
            const result = translateMetricFlowMetrics({
                semanticModels: { sm: ordersSemanticModel },
                metrics: {
                    m: simpleMetric('eu_revenue', 'order_total', {
                        // `customer` is an entity here but `region` lives on
                        // another semantic model — cross-model filters can't
                        // be translated.
                        filter: {
                            where_filters: [
                                {
                                    where_sql_template:
                                        "{{ Dimension('customer__region') }} = 'EU'",
                                },
                            ],
                        },
                    }),
                },
                modelNamesByUniqueId,
            });
            expect(result.metricsByModel.orders?.eu_revenue).toBeUndefined();
            expect(result.skippedCount).toBe(1);
            expect(result.warnings[0]).toContain('customer__region');
        });

        it('skips filters using template functions other than Dimension()', () => {
            const result = translateMetricFlowMetrics({
                semanticModels: { sm: ordersSemanticModel },
                metrics: {
                    m: simpleMetric('recent_revenue', 'order_total', {
                        filter: {
                            where_filters: [
                                {
                                    where_sql_template:
                                        "{{ TimeDimension('order__ordered_at', 'day') }} >= '2024-01-01'",
                                },
                            ],
                        },
                    }),
                },
                modelNamesByUniqueId,
            });
            expect(result.skippedCount).toBe(1);
            expect(result.warnings[0]).toContain('template functions');
        });

        it('skips filters in an unrecognised format', () => {
            const result = translateMetricFlowMetrics({
                semanticModels: { sm: ordersSemanticModel },
                metrics: {
                    m: simpleMetric('weird', 'order_total', {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        filter: { not_where_filters: true } as any,
                    }),
                },
                modelNamesByUniqueId,
            });
            expect(result.skippedCount).toBe(1);
            expect(result.warnings[0]).toContain('unrecognised format');
        });
    });

    it('translates sum_boolean measures as a sum over CASE WHEN 1/0', () => {
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
        expect(result.metricsByModel.orders.food_orders).toEqual({
            type: MetricType.SUM,
            sql: 'CASE WHEN (${TABLE}.is_food_order) THEN 1 ELSE 0 END',
            label: undefined,
            description: undefined,
        });
        expect(result.skippedCount).toBe(0);
    });

    describe('ratio metrics', () => {
        const ratioMetric = (
            name: string,
            numerator: DbtSemanticMetric['type_params']['numerator'],
            denominator: DbtSemanticMetric['type_params']['denominator'],
            extra: Partial<DbtSemanticMetric> = {},
        ): DbtSemanticMetric => ({
            name,
            unique_id: `metric.jaffle.${name}`,
            type: 'ratio',
            type_params: { numerator, denominator },
            ...extra,
        });

        it('translates a same-model ratio into a number metric over its inputs', () => {
            const result = translateMetricFlowMetrics({
                semanticModels: { sm: ordersSemanticModel },
                metrics: {
                    m1: simpleMetric('revenue', 'order_total'),
                    m2: simpleMetric('orders_count', 'order_count'),
                    m3: ratioMetric(
                        'revenue_per_order',
                        { name: 'revenue' },
                        { name: 'orders_count' },
                        { label: 'Revenue per order' },
                    ),
                },
                modelNamesByUniqueId,
            });
            expect(result.metricsByModel.orders.revenue_per_order).toEqual({
                type: MetricType.NUMBER,
                sql: '(${revenue} * 1.0) / NULLIF(${orders_count}, 0)',
                label: 'Revenue per order',
                description: undefined,
            });
            expect(result.translatedCount).toBe(4); // 2 simple + create_metric + ratio
            expect(result.skippedCount).toBe(0);
        });

        it('bakes input filters into hidden helper metrics', () => {
            const result = translateMetricFlowMetrics({
                semanticModels: { sm: ordersSemanticModel },
                metrics: {
                    m1: simpleMetric('orders_count', 'order_count'),
                    m2: ratioMetric(
                        'completion_rate',
                        {
                            name: 'orders_count',
                            filter: {
                                where_filters: [
                                    {
                                        where_sql_template:
                                            "{{ Dimension('order__status') }} = 'completed'",
                                    },
                                ],
                            },
                        },
                        { name: 'orders_count' },
                    ),
                },
                modelNamesByUniqueId,
            });
            expect(
                result.metricsByModel.orders.completion_rate_numerator,
            ).toEqual({
                type: MetricType.COUNT,
                sql: "CASE WHEN (${TABLE}.status = 'completed') THEN (1) END",
                label: undefined,
                description: undefined,
                hidden: true,
            });
            expect(result.metricsByModel.orders.completion_rate.sql).toBe(
                '(${completion_rate_numerator} * 1.0) / NULLIF(${orders_count}, 0)',
            );
        });

        it('applies a ratio-level filter to both inputs', () => {
            const result = translateMetricFlowMetrics({
                semanticModels: { sm: ordersSemanticModel },
                metrics: {
                    m1: simpleMetric('revenue', 'order_total'),
                    m2: simpleMetric('orders_count', 'order_count'),
                    m3: ratioMetric(
                        'food_revenue_per_order',
                        { name: 'revenue' },
                        { name: 'orders_count' },
                        {
                            filter: {
                                where_filters: [
                                    {
                                        where_sql_template:
                                            "{{ Dimension('order__status') }} = 'completed'",
                                    },
                                ],
                            },
                        },
                    ),
                },
                modelNamesByUniqueId,
            });
            const helpers = result.metricsByModel.orders;
            expect(helpers.food_revenue_per_order_numerator.hidden).toBe(true);
            expect(helpers.food_revenue_per_order_denominator.hidden).toBe(
                true,
            );
            expect(helpers.food_revenue_per_order.sql).toBe(
                '(${food_revenue_per_order_numerator} * 1.0) / NULLIF(${food_revenue_per_order_denominator}, 0)',
            );
        });

        it('skips cross-model ratios with a warning', () => {
            const customersSemanticModel: DbtSemanticModel = {
                ...ordersSemanticModel,
                name: 'customers',
                unique_id: 'semantic_model.jaffle.customers',
                model: "ref('customers')",
                depends_on: { nodes: ['model.jaffle.customers'] },
                measures: [
                    {
                        name: 'customer_count',
                        agg: MetricFlowAggregation.COUNT_DISTINCT,
                        expr: 'customer_id',
                    },
                ],
            };
            const result = translateMetricFlowMetrics({
                semanticModels: {
                    sm1: ordersSemanticModel,
                    sm2: customersSemanticModel,
                },
                metrics: {
                    m1: simpleMetric('revenue', 'order_total'),
                    m2: simpleMetric('customers_count', 'customer_count'),
                    m3: ratioMetric(
                        'revenue_per_customer',
                        { name: 'revenue' },
                        { name: 'customers_count' },
                    ),
                },
                modelNamesByUniqueId: {
                    ...modelNamesByUniqueId,
                    'model.jaffle.customers': 'customers',
                },
            });
            expect(
                result.metricsByModel.orders?.revenue_per_customer,
            ).toBeUndefined();
            expect(result.skippedCount).toBe(1);
            expect(result.warnings.join(' ')).toContain('different models');
        });

        it('skips ratios whose inputs were not translated', () => {
            const result = translateMetricFlowMetrics({
                semanticModels: { sm: ordersSemanticModel },
                metrics: {
                    m1: simpleMetric('revenue', 'order_total'),
                    m2: ratioMetric(
                        'broken_ratio',
                        { name: 'revenue' },
                        { name: 'does_not_exist' },
                    ),
                },
                modelNamesByUniqueId,
            });
            expect(result.metricsByModel.orders?.broken_ratio).toBeUndefined();
            expect(result.skippedCount).toBe(1);
            expect(result.warnings.join(' ')).toContain('does_not_exist');
        });
    });

    describe('derived metrics', () => {
        it('translates a same-model derived metric, rewriting names and aliases', () => {
            const result = translateMetricFlowMetrics({
                semanticModels: { sm: ordersSemanticModel },
                metrics: {
                    m1: simpleMetric('revenue', 'order_total'),
                    m2: {
                        name: 'double_revenue_per_customer',
                        unique_id: 'metric.jaffle.double_revenue_per_customer',
                        type: 'derived',
                        label: 'Double revenue per customer',
                        type_params: {
                            expr: 'rev * 2 / unique_customers',
                            metrics: [
                                { name: 'revenue', alias: 'rev' },
                                { name: 'unique_customers' },
                            ],
                        },
                    },
                },
                modelNamesByUniqueId,
            });
            expect(
                result.metricsByModel.orders.double_revenue_per_customer,
            ).toEqual({
                type: MetricType.NUMBER,
                sql: '${revenue} * 2 / ${unique_customers}',
                label: 'Double revenue per customer',
                description: undefined,
            });
            expect(result.skippedCount).toBe(0);
        });

        it('bakes input filters into hidden helper metrics named by alias', () => {
            const result = translateMetricFlowMetrics({
                semanticModels: { sm: ordersSemanticModel },
                metrics: {
                    m1: simpleMetric('revenue', 'order_total'),
                    m2: {
                        name: 'completed_share',
                        unique_id: 'metric.jaffle.completed_share',
                        type: 'derived',
                        type_params: {
                            expr: 'completed_rev / revenue',
                            metrics: [
                                {
                                    name: 'revenue',
                                    alias: 'completed_rev',
                                    filter: {
                                        where_filters: [
                                            {
                                                where_sql_template:
                                                    "{{ Dimension('order__status') }} = 'completed'",
                                            },
                                        ],
                                    },
                                },
                                { name: 'revenue' },
                            ],
                        },
                    },
                },
                modelNamesByUniqueId,
            });
            const { orders } = result.metricsByModel;
            expect(orders.completed_share_completed_rev).toEqual({
                type: MetricType.SUM,
                sql: "CASE WHEN (${TABLE}.status = 'completed') THEN (${TABLE}.amount) END",
                label: undefined,
                description: undefined,
                hidden: true,
            });
            expect(orders.completed_share.sql).toBe(
                '${completed_share_completed_rev} / ${revenue}',
            );
        });

        it('skips derived metrics with time-offset inputs', () => {
            const result = translateMetricFlowMetrics({
                semanticModels: { sm: ordersSemanticModel },
                metrics: {
                    m1: simpleMetric('revenue', 'order_total'),
                    m2: {
                        name: 'revenue_growth',
                        unique_id: 'metric.jaffle.revenue_growth',
                        type: 'derived',
                        type_params: {
                            expr: '(revenue - revenue_last_month) / revenue_last_month',
                            metrics: [
                                { name: 'revenue' },
                                {
                                    name: 'revenue',
                                    alias: 'revenue_last_month',
                                    offset_window: '1 month',
                                },
                            ],
                        },
                    },
                },
                modelNamesByUniqueId,
            });
            expect(
                result.metricsByModel.orders?.revenue_growth,
            ).toBeUndefined();
            expect(result.skippedCount).toBe(1);
            expect(result.warnings.join(' ')).toContain('offset_window');
        });

        it('resolves chains where a derived metric references a later ratio metric', () => {
            const result = translateMetricFlowMetrics({
                semanticModels: { sm: ordersSemanticModel },
                metrics: {
                    // Deliberately listed before the ratio it references.
                    m1: {
                        name: 'double_aov',
                        unique_id: 'metric.jaffle.double_aov',
                        type: 'derived',
                        type_params: {
                            expr: 'aov * 2',
                            metrics: [{ name: 'aov' }],
                        },
                    },
                    m2: simpleMetric('revenue', 'order_total'),
                    m3: simpleMetric('orders_count', 'order_count'),
                    m4: {
                        name: 'aov',
                        unique_id: 'metric.jaffle.aov',
                        type: 'ratio',
                        type_params: {
                            numerator: { name: 'revenue' },
                            denominator: { name: 'orders_count' },
                        },
                    },
                },
                modelNamesByUniqueId,
            });
            expect(result.metricsByModel.orders.double_aov.sql).toBe(
                '${aov} * 2',
            );
            expect(result.skippedCount).toBe(0);
        });
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

    // End-to-end: a translated ratio must compile into a real Explore metric
    // with the referenced input metrics inlined.
    it('produces a ratio metric that compiles through convertExplores', async () => {
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
                },
                {
                    // The mock warehouse client only compiles SUM/AVG/MAX
                    // aggregates, so the denominator is a sum too.
                    name: 'total_other',
                    agg: MetricFlowAggregation.SUM,
                    expr: 'myOtherColumn',
                },
            ],
        };

        const { metricsByModel, translatedCount } = translateMetricFlowMetrics({
            semanticModels: { [semanticModel.unique_id]: semanticModel },
            metrics: {
                m1: simpleMetric('total_revenue', 'total_column'),
                m2: simpleMetric('order_count', 'total_other'),
                m3: {
                    name: 'revenue_per_order',
                    unique_id: 'metric.test.revenue_per_order',
                    type: 'ratio',
                    label: 'Revenue per order',
                    type_params: {
                        numerator: { name: 'total_revenue' },
                        denominator: { name: 'order_count' },
                    },
                },
            },
            modelNamesByUniqueId: { [modelUniqueId]: MOCK_MODEL.name },
        });
        expect(translatedCount).toBe(3);

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
        const metric =
            explore.tables[MOCK_MODEL.name].metrics.revenue_per_order;
        expect(metric.type).toBe(MetricType.NUMBER);
        expect(metric.compiledSql).toBe(
            '((SUM("myTable".myColumnName)) * 1.0) / NULLIF((SUM("myTable".myOtherColumn)), 0)',
        );
    });
});
