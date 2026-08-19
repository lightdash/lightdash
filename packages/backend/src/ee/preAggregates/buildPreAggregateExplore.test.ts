import {
    DimensionType,
    ExploreType,
    FieldType,
    FilterOperator,
    MetricType,
    PRE_AGGREGATE_MATERIALIZED_TABLE_PLACEHOLDER,
    SupportedDbtAdapter,
    TimeFrames,
    WeekDay,
    type CompiledDimension,
    type CompiledMetric,
    type Explore,
    type PreAggregateDef,
} from '@lightdash/common';
import { buildPreAggregateExplore } from './buildPreAggregateExplore';

const buildExplore = (
    explore: Explore,
    preAggregateDef: PreAggregateDef,
    startOfWeek: WeekDay | null = null,
) => buildPreAggregateExplore(explore, preAggregateDef, startOfWeek);

const makeDimension = ({
    name,
    table,
    type = DimensionType.STRING,
    sql,
    compiledSql,
    parameterReferences,
    compilationError,
    timeInterval,
    timeIntervalBaseDimensionName,
}: {
    name: string;
    table: string;
    type?: DimensionType;
    sql?: string;
    compiledSql?: string;
    parameterReferences?: string[];
    compilationError?: { message: string };
    timeInterval?: TimeFrames;
    timeIntervalBaseDimensionName?: string;
}): CompiledDimension => ({
    index: 0,
    fieldType: FieldType.DIMENSION,
    type,
    name,
    label: name,
    table,
    tableLabel: table,
    sql: sql ?? `${table}.${name}`,
    hidden: false,
    compiledSql: compiledSql ?? sql ?? `${table}.${name}`,
    tablesReferences: [table],
    ...(parameterReferences ? { parameterReferences } : {}),
    ...(compilationError ? { compilationError } : {}),
    ...(timeInterval ? { timeInterval } : {}),
    ...(timeIntervalBaseDimensionName ? { timeIntervalBaseDimensionName } : {}),
});

const makeMetric = ({
    name,
    table,
    type,
}: {
    name: string;
    table: string;
    type: MetricType;
}): CompiledMetric => ({
    index: 0,
    fieldType: FieldType.METRIC,
    type,
    name,
    label: name,
    table,
    tableLabel: table,
    sql: `${table}.${name}`,
    hidden: false,
    compiledSql: `${table}.${name}`,
    tablesReferences: [table],
});

const makeCustomMetric = ({
    name,
    table,
    type,
    sql,
    compiledSql,
    parameterReferences,
    compilationError,
    filters,
}: {
    name: string;
    table: string;
    type: MetricType;
    sql?: string;
    compiledSql?: string;
    parameterReferences?: string[];
    compilationError?: { message: string };
    filters?: CompiledMetric['filters'];
}): CompiledMetric => ({
    index: 0,
    fieldType: FieldType.METRIC,
    type,
    name,
    label: name,
    table,
    tableLabel: table,
    sql: sql ?? `${table}.${name}`,
    hidden: false,
    compiledSql: compiledSql ?? sql ?? `${table}.${name}`,
    tablesReferences: [table],
    ...(parameterReferences ? { parameterReferences } : {}),
    ...(compilationError ? { compilationError } : {}),
    ...(filters ? { filters } : {}),
});

const sourceExplore = (): Explore => ({
    name: 'orders',
    label: 'Orders',
    tags: [],
    baseTable: 'orders',
    joinedTables: [
        {
            table: 'customers',
            sqlOn: '${orders.customer_id} = ${customers.customer_id}',
            compiledSqlOn: 'orders.customer_id = customers.customer_id',
        },
    ],
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    tables: {
        orders: {
            name: 'orders',
            label: 'Orders',
            database: 'db',
            schema: 'public',
            sqlTable: 'orders',
            dimensions: {
                status: makeDimension({ name: 'status', table: 'orders' }),
                order_date: makeDimension({
                    name: 'order_date',
                    table: 'orders',
                    type: DimensionType.DATE,
                }),
                order_date_hour: makeDimension({
                    name: 'order_date_hour',
                    table: 'orders',
                    type: DimensionType.DATE,
                    timeInterval: TimeFrames.HOUR,
                    timeIntervalBaseDimensionName: 'order_date',
                }),
                order_date_day: makeDimension({
                    name: 'order_date_day',
                    table: 'orders',
                    type: DimensionType.DATE,
                    timeInterval: TimeFrames.DAY,
                    timeIntervalBaseDimensionName: 'order_date',
                }),
                order_date_week: makeDimension({
                    name: 'order_date_week',
                    table: 'orders',
                    type: DimensionType.DATE,
                    timeInterval: TimeFrames.WEEK,
                    timeIntervalBaseDimensionName: 'order_date',
                }),
                order_date_week_num: makeDimension({
                    name: 'order_date_week_num',
                    table: 'orders',
                    type: DimensionType.NUMBER,
                    timeInterval: TimeFrames.WEEK_NUM,
                    timeIntervalBaseDimensionName: 'order_date',
                }),
                order_date_month: makeDimension({
                    name: 'order_date_month',
                    table: 'orders',
                    type: DimensionType.DATE,
                    timeInterval: TimeFrames.MONTH,
                    timeIntervalBaseDimensionName: 'order_date',
                }),
                order_date_month_name: makeDimension({
                    name: 'order_date_month_name',
                    table: 'orders',
                    type: DimensionType.STRING,
                    timeInterval: TimeFrames.MONTH_NAME,
                    timeIntervalBaseDimensionName: 'order_date',
                }),
                order_date_quarter: makeDimension({
                    name: 'order_date_quarter',
                    table: 'orders',
                    type: DimensionType.DATE,
                    timeInterval: TimeFrames.QUARTER,
                    timeIntervalBaseDimensionName: 'order_date',
                }),
                order_date_year: makeDimension({
                    name: 'order_date_year',
                    table: 'orders',
                    type: DimensionType.DATE,
                    timeInterval: TimeFrames.YEAR,
                    timeIntervalBaseDimensionName: 'order_date',
                }),
                created_at: makeDimension({
                    name: 'created_at',
                    table: 'orders',
                    type: DimensionType.TIMESTAMP,
                }),
                created_at_day: makeDimension({
                    name: 'created_at_day',
                    table: 'orders',
                    type: DimensionType.TIMESTAMP,
                    timeInterval: TimeFrames.DAY,
                    timeIntervalBaseDimensionName: 'created_at',
                }),
            },
            metrics: {
                total_order_amount: makeMetric({
                    name: 'total_order_amount',
                    table: 'orders',
                    type: MetricType.SUM,
                }),
                shipping_total: makeMetric({
                    name: 'shipping_total',
                    table: 'orders',
                    type: MetricType.SUM,
                }),
                order_count: makeMetric({
                    name: 'order_count',
                    table: 'orders',
                    type: MetricType.COUNT,
                }),
                distinct_customer_count: makeMetric({
                    name: 'distinct_customer_count',
                    table: 'orders',
                    type: MetricType.COUNT_DISTINCT,
                }),
                avg_order_amount: makeMetric({
                    name: 'avg_order_amount',
                    table: 'orders',
                    type: MetricType.AVERAGE,
                }),
                median_order_amount: makeMetric({
                    name: 'median_order_amount',
                    table: 'orders',
                    type: MetricType.MEDIAN,
                }),
                custom_sql: makeMetric({
                    name: 'custom_sql',
                    table: 'orders',
                    type: MetricType.NUMBER,
                }),
                gross_total: makeCustomMetric({
                    name: 'gross_total',
                    table: 'orders',
                    type: MetricType.NUMBER,
                    sql: '${total_order_amount} + ${shipping_total}',
                }),
                total_order_amount_plus_average_customer_age: makeCustomMetric({
                    name: 'total_order_amount_plus_average_customer_age',
                    table: 'orders',
                    type: MetricType.NUMBER,
                    sql: '${total_order_amount} + ${customers.average_age}',
                }),
            },
            lineageGraph: {},
        },
        customers: {
            name: 'customers',
            label: 'Customers',
            database: 'db',
            schema: 'public',
            sqlTable: 'customers',
            dimensions: {
                first_name: makeDimension({
                    name: 'first_name',
                    table: 'customers',
                }),
            },
            metrics: {
                average_age: makeMetric({
                    name: 'average_age',
                    table: 'customers',
                    type: MetricType.AVERAGE,
                }),
                max_customer_age: makeMetric({
                    name: 'max_customer_age',
                    table: 'customers',
                    type: MetricType.MAX,
                }),
            },
            lineageGraph: {},
        },
    },
    preAggregates: [
        {
            name: 'orders_rollup',
            dimensions: ['status', 'customers.first_name', 'order_date'],
            metrics: [
                'total_order_amount',
                'order_count',
                'avg_order_amount',
                'customers.max_customer_age',
            ],
            timeDimension: 'order_date',
            granularity: TimeFrames.DAY,
        },
    ],
});

describe('buildPreAggregateExplore', () => {
    it('builds a deterministic internal pre-aggregate explore', () => {
        const result = buildExplore(
            sourceExplore(),
            sourceExplore().preAggregates![0],
        );

        expect(result.name).toBe('__preagg__orders__orders_rollup');
        expect(result.type).toBe(ExploreType.PRE_AGGREGATE);
        expect(result.baseTable).toBe('orders');
        expect(result.preAggregateSource).toEqual({
            sourceExploreName: 'orders',
            preAggregateName: 'orders_rollup',
        });
        expect(result.joinedTables).toEqual([]);
        expect(result.preAggregates).toEqual([]);
        expect(result.tables.orders.sqlTable).toBe(
            PRE_AGGREGATE_MATERIALIZED_TABLE_PLACEHOLDER,
        );
    });

    it('keeps required filters for query-time application', () => {
        const explore = sourceExplore();
        const requiredFilters = [
            {
                id: 'required-status',
                target: { fieldRef: 'status' },
                operator: FilterOperator.EQUALS,
                values: ['completed'],
                required: true,
            },
        ];
        const exploreWithRequiredFilters: Explore = {
            ...explore,
            tables: {
                ...explore.tables,
                orders: {
                    ...explore.tables.orders,
                    requiredFilters,
                },
            },
        };

        const preAggregateDef = exploreWithRequiredFilters.preAggregates?.[0];
        if (!preAggregateDef) {
            throw new Error('Expected pre-aggregate definition');
        }

        const result = buildExplore(
            exploreWithRequiredFilters,
            preAggregateDef,
        );

        expect(result.tables.orders.requiredFilters).toStrictEqual(
            requiredFilters,
        );
    });

    it('rewrites supported metrics', () => {
        const result = buildExplore(
            sourceExplore(),
            sourceExplore().preAggregates![0],
        );

        expect(
            result.tables.orders.metrics.total_order_amount.compiledSql,
        ).toBe('SUM(orders.orders_total_order_amount)');
        expect(result.tables.orders.metrics.order_count.compiledSql).toBe(
            'SUM(orders.orders_order_count)',
        );
        expect(result.tables.orders.metrics.avg_order_amount.compiledSql).toBe(
            'CAST(SUM(orders.orders_avg_order_amount__sum) AS DOUBLE) / CAST(NULLIF(SUM(orders.orders_avg_order_amount__count), 0) AS DOUBLE)',
        );
        expect(
            result.tables.customers.metrics.max_customer_age.compiledSql,
        ).toBe('MAX(orders.customers_max_customer_age)');
    });

    it('maps joined dimensions to materialized field-id columns', () => {
        const result = buildExplore(
            sourceExplore(),
            sourceExplore().preAggregates![0],
        );

        expect(result.tables.customers.dimensions.first_name.compiledSql).toBe(
            'orders.customers_first_name',
        );
    });

    it('keeps derivable time frames and drops finer ones', () => {
        const result = buildExplore(
            sourceExplore(),
            sourceExplore().preAggregates![0],
        );

        expect(result.tables.orders.dimensions.order_date_day.compiledSql).toBe(
            'orders.orders_order_date_day',
        );
        expect(
            result.tables.orders.dimensions.order_date_month.compiledSql,
        ).toContain('orders.orders_order_date_day');
        expect(result.tables.orders.dimensions.order_date_hour).toBeUndefined();
    });

    it('does not expose calendar months or week numbers from a week-grain pre-aggregate', () => {
        const result = buildExplore(sourceExplore(), {
            ...sourceExplore().preAggregates![0],
            granularity: TimeFrames.WEEK,
        });

        expect(result.tables.orders.dimensions.order_date_week).toBeDefined();
        expect(
            result.tables.orders.dimensions.order_date_month,
        ).toBeUndefined();
        expect(
            result.tables.orders.dimensions.order_date_quarter,
        ).toBeUndefined();
        expect(result.tables.orders.dimensions.order_date_year).toBeUndefined();
        expect(
            result.tables.orders.dimensions.order_date_week_num,
        ).toBeUndefined();
    });

    it('exposes a raw date but not a raw timestamp from a day-grain pre-aggregate', () => {
        const explore = sourceExplore();
        const result = buildExplore(explore, {
            ...explore.preAggregates![0],
            dimensions: ['created_at'],
            timeDimension: 'created_at',
            granularity: TimeFrames.DAY,
        });

        expect(result.tables.orders.dimensions.created_at).toBeUndefined();
        expect(result.tables.orders.dimensions.created_at_day).toBeDefined();

        const dateResult = buildExplore(explore, explore.preAggregates![0]);
        expect(dateResult.tables.orders.dimensions.order_date).toBeDefined();
    });

    it('uses DuckDB-compatible date truncation SQL regardless of source warehouse adapter', () => {
        const result = buildExplore(
            {
                ...sourceExplore(),
                targetDatabase: SupportedDbtAdapter.BIGQUERY, // doesn't matter what's the warehouse type
            },
            sourceExplore().preAggregates![0],
        );

        expect(
            result.tables.orders.dimensions.order_date_month.compiledSql,
        ).toContain("DATE_TRUNC('MONTH', orders.orders_order_date_day)");
    });

    it('applies startOfWeek to week re-truncation', () => {
        const result = buildExplore(
            sourceExplore(),
            sourceExplore().preAggregates![0],
            WeekDay.SUNDAY,
        );

        expect(
            result.tables.orders.dimensions.order_date_week.compiledSql,
        ).toBe(
            "(DATE_TRUNC('WEEK', (orders.orders_order_date_day - interval '6 days')) + interval '6 days')",
        );
    });

    it('uses default week truncation when startOfWeek is not configured', () => {
        const result = buildExplore(
            sourceExplore(),
            sourceExplore().preAggregates![0],
        );

        expect(
            result.tables.orders.dimensions.order_date_week.compiledSql,
        ).toBe("DATE_TRUNC('WEEK', orders.orders_order_date_day)");
    });

    it('derives named time frames with the serving warehouse function', () => {
        const result = buildExplore(
            sourceExplore(),
            sourceExplore().preAggregates![0],
        );

        expect(
            result.tables.orders.dimensions.order_date_month_name.compiledSql,
        ).toBe("TO_CHAR(orders.orders_order_date_day, 'FMMonth')");
    });

    describe('external pre-aggregates', () => {
        const externalDef = () => ({
            ...sourceExplore().preAggregates![0],
            table: '"analytics"."orders_rollup_mv"',
        });

        it('bakes the external table into every sqlTable and marks the source external', () => {
            const result = buildExplore(sourceExplore(), externalDef());

            expect(result.tables.orders.sqlTable).toBe(
                '"analytics"."orders_rollup_mv"',
            );
            expect(result.tables.customers.sqlTable).toBe(
                '"analytics"."orders_rollup_mv"',
            );
            expect(result.preAggregateSource).toEqual({
                sourceExploreName: 'orders',
                preAggregateName: 'orders_rollup',
                externalTable: '"analytics"."orders_rollup_mv"',
            });
        });

        it('compiles average re-aggregation casts in the project warehouse dialect', () => {
            const postgresResult = buildExplore(
                sourceExplore(), // targetDatabase: postgres
                externalDef(),
            );
            expect(
                postgresResult.tables.orders.metrics.avg_order_amount
                    .compiledSql,
            ).toBe(
                'CAST(SUM(orders.orders_avg_order_amount__sum) AS FLOAT) / CAST(NULLIF(SUM(orders.orders_avg_order_amount__count), 0) AS FLOAT)',
            );

            const bigqueryResult = buildExplore(
                {
                    ...sourceExplore(),
                    targetDatabase: SupportedDbtAdapter.BIGQUERY,
                },
                externalDef(),
            );
            expect(
                bigqueryResult.tables.orders.metrics.avg_order_amount
                    .compiledSql,
            ).toBe(
                'CAST(SUM(orders.orders_avg_order_amount__sum) AS FLOAT64) / CAST(NULLIF(SUM(orders.orders_avg_order_amount__count), 0) AS FLOAT64)',
            );
        });

        it('derives coarser grains with the project warehouse date truncation', () => {
            const result = buildExplore(
                {
                    ...sourceExplore(),
                    targetDatabase: SupportedDbtAdapter.BIGQUERY,
                },
                externalDef(),
            );

            // BigQuery argument order, not DuckDB's DATE_TRUNC('MONTH', x)
            expect(
                result.tables.orders.dimensions.order_date_month.compiledSql,
            ).toBe('DATE_TRUNC(orders.orders_order_date_day, MONTH)');
        });

        it('derives named time frames with the project warehouse function', () => {
            const result = buildExplore(
                {
                    ...sourceExplore(),
                    targetDatabase: SupportedDbtAdapter.BIGQUERY,
                },
                externalDef(),
            );

            expect(
                result.tables.orders.dimensions.order_date_month_name
                    .compiledSql,
            ).toBe("FORMAT_DATE('%B', orders.orders_order_date_day)");
        });

        it('preserves timestamp materialization types for named time frames', () => {
            const explore = sourceExplore();
            explore.targetDatabase = SupportedDbtAdapter.BIGQUERY;
            explore.tables.orders.dimensions.order_date.type =
                DimensionType.TIMESTAMP;

            const result = buildExplore(explore, externalDef());

            expect(
                result.tables.orders.dimensions.order_date_month_name
                    .compiledSql,
            ).toBe("FORMAT_DATETIME('%B', orders.orders_order_date_day)");
        });
    });

    it('throws when pre-aggregate references unknown fields', () => {
        expect(() =>
            buildExplore(sourceExplore(), {
                name: 'invalid_rollup',
                dimensions: ['unknown_dimension'],
                metrics: ['order_count'],
            }),
        ).toThrow('references unknown dimensions');
    });

    it('throws when pre-aggregate references unsupported metric types', () => {
        expect(() =>
            buildExplore(sourceExplore(), {
                name: 'invalid_rollup',
                dimensions: ['status'],
                metrics: ['custom_sql'],
            }),
        ).toThrow(
            'Pre-aggregate "invalid_rollup" references unsupported metrics: "custom_sql" (number). Supported metric types: sum, count, min, max, average, count_distinct, sum_distinct, average_distinct, median, percentile',
        );
    });

    it('rewrites exact-only metrics to MAX over the stored value column and hides them from the explore', () => {
        const result = buildExplore(sourceExplore(), {
            name: 'unique_rollup',
            dimensions: ['status'],
            metrics: ['distinct_customer_count', 'median_order_amount'],
        });

        expect(
            result.tables.orders.metrics.distinct_customer_count.compiledSql,
        ).toBe('MAX(orders.orders_distinct_customer_count)');
        expect(
            result.tables.orders.metrics.distinct_customer_count.hidden,
        ).toBe(true);
        expect(
            result.tables.orders.metrics.median_order_amount.compiledSql,
        ).toBe('MAX(orders.orders_median_order_amount)');
        expect(result.tables.orders.metrics.median_order_amount.hidden).toBe(
            true,
        );
    });

    it('keeps re-aggregatable metrics visible alongside hidden exact-only metrics', () => {
        const result = buildExplore(sourceExplore(), {
            name: 'mixed_rollup',
            dimensions: ['status'],
            metrics: ['distinct_customer_count', 'order_count'],
        });

        expect(result.tables.orders.metrics.order_count.hidden).toBe(false);
        expect(
            result.tables.orders.metrics.distinct_customer_count.hidden,
        ).toBe(true);
    });

    it('rejects number metrics that reference exact-only metrics', () => {
        const explore = sourceExplore();
        explore.tables.orders.metrics.distinct_plus_total = makeCustomMetric({
            name: 'distinct_plus_total',
            table: 'orders',
            type: MetricType.NUMBER,
            sql: '${distinct_customer_count} + ${total_order_amount}',
        });

        expect(() =>
            buildExplore(explore, {
                name: 'invalid_number_rollup',
                dimensions: ['status'],
                metrics: [
                    'distinct_plus_total',
                    'distinct_customer_count',
                    'total_order_amount',
                ],
            }),
        ).toThrow(
            'Pre-aggregate "invalid_number_rollup" references unsupported metrics: "distinct_plus_total" (number)',
        );
    });

    it('requires dependent metrics for supported number metrics', () => {
        expect(() =>
            buildExplore(sourceExplore(), {
                name: 'number_metric_preagg',
                dimensions: ['status'],
                metrics: ['gross_total', 'total_order_amount'],
            }),
        ).toThrow(
            'Pre-aggregate "number_metric_preagg" metric "gross_total" requires dependent metrics "shipping_total" to be included in the pre-aggregate definition.',
        );
    });

    it('keeps supported number metrics on the pre-aggregate explore and rewrites them to use materialized dependencies', () => {
        const result = buildExplore(sourceExplore(), {
            name: 'number_metric_preagg',
            dimensions: ['status'],
            metrics: ['gross_total', 'total_order_amount', 'shipping_total'],
        });

        expect(result.tables.orders.metrics.gross_total.compiledSql).toBe(
            '(SUM(orders.orders_total_order_amount)) + (SUM(orders.orders_shipping_total))',
        );
        expect(
            result.tables.orders.metrics.total_order_amount.compiledSql,
        ).toBe('SUM(orders.orders_total_order_amount)');
        expect(result.tables.orders.metrics.shipping_total.compiledSql).toBe(
            'SUM(orders.orders_shipping_total)',
        );
    });

    it('rewrites supported cross-model number metrics to use materialized dependencies from joined tables', () => {
        const result = buildExplore(sourceExplore(), {
            name: 'cross_model_number_metric_preagg',
            dimensions: ['status'],
            metrics: [
                'total_order_amount_plus_average_customer_age',
                'total_order_amount',
                'customers.average_age',
            ],
        });

        expect(
            result.tables.orders.metrics
                .total_order_amount_plus_average_customer_age.compiledSql,
        ).toBe(
            '(SUM(orders.orders_total_order_amount)) + (CAST(SUM(orders.customers_average_age__sum) AS DOUBLE) / CAST(NULLIF(SUM(orders.customers_average_age__count), 0) AS DOUBLE))',
        );
        expect(result.tables.customers.metrics.average_age.compiledSql).toBe(
            'CAST(SUM(orders.customers_average_age__sum) AS DOUBLE) / CAST(NULLIF(SUM(orders.customers_average_age__count), 0) AS DOUBLE)',
        );
    });

    it('includes time dimension even when not in dimensions array', () => {
        const result = buildExplore(sourceExplore(), {
            name: 'time_dim_separate',
            dimensions: ['status'],
            metrics: ['order_count'],
            timeDimension: 'order_date',
            granularity: TimeFrames.DAY,
        });

        expect(result.tables.orders.dimensions.order_date_day).toBeDefined();
        expect(result.tables.orders.dimensions.order_date_day.compiledSql).toBe(
            'orders.orders_order_date_day',
        );
        expect(result.tables.orders.dimensions.status).toBeDefined();
    });

    it('supports legacy metric fieldIds in pre-aggregate definitions', () => {
        const result = buildExplore(sourceExplore(), {
            name: 'legacy_field_id_rollup',
            dimensions: ['status'],
            metrics: ['orders_order_count'],
        });

        expect(result.tables.orders.metrics.order_count).toBeDefined();
    });

    it('accepts eligible derived dimensions selected by the pre-aggregate definition', () => {
        const explore = sourceExplore();
        explore.tables.orders.dimensions.status_label = makeDimension({
            name: 'status_label',
            table: 'orders',
            sql: "concat(${status}, '-ok')",
            compiledSql: "concat(orders.status, '-ok')",
        });

        const result = buildExplore(explore, {
            name: 'derived_dimension_rollup',
            dimensions: ['status_label'],
            metrics: ['order_count'],
        });

        expect(result.tables.orders.dimensions.status_label).toBeDefined();
        expect(result.tables.orders.dimensions.status_label.compiledSql).toBe(
            'orders.orders_status_label',
        );
    });

    it('rejects parameterized derived dimensions selected by the pre-aggregate definition', () => {
        const explore = sourceExplore();
        explore.tables.orders.dimensions.parameterized_status = makeDimension({
            name: 'parameterized_status',
            table: 'orders',
            sql: `
                CASE
                    WHEN \${lightdash.parameters.orders.region} = 'EMEA' THEN \${TABLE}.status
                    ELSE NULL
                END
            `,
            parameterReferences: ['orders.region'],
        });

        expect(() =>
            buildExplore(explore, {
                name: 'invalid_rollup',
                dimensions: ['parameterized_status'],
                metrics: ['order_count'],
            }),
        ).toThrow(
            'Pre-aggregate "invalid_rollup" references ineligible dimension "parameterized_status": dimension "orders_parameterized_status" is not eligible for direct materialization (reason: parameter_references)',
        );
    });

    it('rejects user-attribute derived dimensions selected by the pre-aggregate definition', () => {
        const explore = sourceExplore();
        explore.tables.orders.dimensions.region_aware_status = makeDimension({
            name: 'region_aware_status',
            table: 'orders',
            sql: "case when ${ld.attr.region} = 'EMEA' then ${TABLE}.status end",
        });

        expect(() =>
            buildExplore(explore, {
                name: 'invalid_rollup',
                dimensions: ['region_aware_status'],
                metrics: ['order_count'],
            }),
        ).toThrow(
            'Pre-aggregate "invalid_rollup" references ineligible dimension "region_aware_status": dimension "orders_region_aware_status" is not eligible for direct materialization (reason: user_attributes)',
        );
    });

    it('rejects derived dimensions whose recursive dependency is ineligible', () => {
        const explore = sourceExplore();
        explore.tables.orders.dimensions.parameterized_status = makeDimension({
            name: 'parameterized_status',
            table: 'orders',
            sql: `
                CASE
                    WHEN \${lightdash.parameters.orders.region} = 'EMEA' THEN \${TABLE}.status
                    ELSE NULL
                END
            `,
            parameterReferences: ['orders.region'],
        });
        explore.tables.orders.dimensions.status_wrapper = makeDimension({
            name: 'status_wrapper',
            table: 'orders',
            sql: '${parameterized_status}',
        });

        expect(() =>
            buildExplore(explore, {
                name: 'invalid_rollup',
                dimensions: ['status_wrapper'],
                metrics: ['order_count'],
            }),
        ).toThrow(
            'Pre-aggregate "invalid_rollup" references ineligible dimension "status_wrapper": dimension "orders_parameterized_status" is not eligible for direct materialization (reason: parameter_references)',
        );
    });

    it('accepts eligible custom sql metrics selected by the pre-aggregate definition', () => {
        const explore = sourceExplore();
        explore.tables.orders.dimensions.amount = makeDimension({
            name: 'amount',
            table: 'orders',
            type: DimensionType.NUMBER,
            sql: '${TABLE}.amount',
            compiledSql: 'orders.amount',
        });
        explore.tables.orders.metrics.order_revenue = makeCustomMetric({
            name: 'order_revenue',
            table: 'orders',
            type: MetricType.SUM,
            sql: '${amount}',
            compiledSql: 'SUM(orders.amount)',
        });

        const result = buildExplore(explore, {
            name: 'metric_rollup',
            dimensions: ['status'],
            metrics: ['order_revenue'],
        });

        expect(result.tables.orders.metrics.order_revenue).toBeDefined();
        expect(result.tables.orders.metrics.order_revenue.compiledSql).toBe(
            'SUM(orders.orders_order_revenue)',
        );
    });

    it('rejects parameterized custom sql metrics selected by the pre-aggregate definition', () => {
        const explore = sourceExplore();
        explore.tables.orders.metrics.parameterized_revenue = makeCustomMetric({
            name: 'parameterized_revenue',
            table: 'orders',
            type: MetricType.SUM,
            sql: `
                CASE
                    WHEN \${lightdash.parameters.orders.region} = 'EMEA' THEN \${TABLE}.amount
                    ELSE 0
                END
            `,
            parameterReferences: ['orders.region'],
        });

        expect(() =>
            buildExplore(explore, {
                name: 'invalid_rollup',
                dimensions: ['status'],
                metrics: ['parameterized_revenue'],
            }),
        ).toThrow(
            'Pre-aggregate "invalid_rollup" references ineligible metric "parameterized_revenue": metric "orders_parameterized_revenue" is not eligible for pre-aggregation (reason: parameter_references)',
        );
    });

    it('rejects custom sql metrics whose filter dimension is ineligible', () => {
        const explore = sourceExplore();
        explore.tables.orders.dimensions.parameterized_status = makeDimension({
            name: 'parameterized_status',
            table: 'orders',
            sql: `
                CASE
                    WHEN \${lightdash.parameters.orders.region} = 'EMEA' THEN \${TABLE}.status
                    ELSE NULL
                END
            `,
            parameterReferences: ['orders.region'],
        });
        explore.tables.orders.metrics.filtered_revenue = makeCustomMetric({
            name: 'filtered_revenue',
            table: 'orders',
            type: MetricType.SUM,
            sql: '${TABLE}.amount',
            compiledSql: 'SUM(orders.amount)',
            filters: [
                {
                    id: 'metric-filter',
                    target: {
                        fieldRef: 'parameterized_status',
                    },
                    operator: FilterOperator.EQUALS,
                    values: ['completed'],
                },
            ],
        });

        expect(() =>
            buildExplore(explore, {
                name: 'invalid_rollup',
                dimensions: ['status'],
                metrics: ['filtered_revenue'],
            }),
        ).toThrow(
            'Pre-aggregate "invalid_rollup" references ineligible metric "filtered_revenue": dimension "orders_parameterized_status" is not eligible for pre-aggregation metric filters (reason: parameter_references)',
        );
    });
});

describe('sql_filter (sqlWhere) rewrite', () => {
    const exploreWithSqlFilter = (uncompiledSqlWhere: string): Explore => {
        const explore = sourceExplore();
        return {
            ...explore,
            tables: {
                ...explore.tables,
                orders: {
                    ...explore.tables.orders,
                    uncompiledSqlWhere,
                    // compiled against source join aliases, unusable on the materialization
                    sqlWhere: uncompiledSqlWhere.replace(
                        /\$\{customers\.first_name\}/g,
                        '("customers".first_name)',
                    ),
                },
            },
        };
    };

    const def: PreAggregateDef = {
        name: 'orders_rollup',
        dimensions: ['status', 'customers.first_name'],
        metrics: ['total_order_amount'],
    };

    it('rewrites joined field references to materialized columns for managed serving', () => {
        const result = buildExplore(
            exploreWithSqlFilter(
                '${customers.first_name} = ${lightdash.attributes.name}',
            ),
            def,
        );

        expect(result.tables.orders.sqlWhere).toBe(
            'orders.customers_first_name = ${lightdash.attributes.name}',
        );
        expect(result.tables.orders.uncompiledSqlWhere).toBe(
            'orders.customers_first_name = ${lightdash.attributes.name}',
        );
    });

    it('rewrites base-table field references to materialized columns', () => {
        const result = buildExplore(
            exploreWithSqlFilter("${status} = 'completed'"),
            def,
        );

        expect(result.tables.orders.sqlWhere).toBe(
            "orders.orders_status = 'completed'",
        );
    });

    it('applies the same rewrite for external pre-aggregates', () => {
        const result = buildExplore(
            exploreWithSqlFilter(
                '${customers.first_name} = ${lightdash.attributes.name}',
            ),
            { ...def, table: '"analytics"."orders_rollup_mv"' },
        );

        expect(result.tables.orders.sqlWhere).toBe(
            'orders.customers_first_name = ${lightdash.attributes.name}',
        );
        expect(result.tables.orders.uncompiledSqlWhere).toBe(
            'orders.customers_first_name = ${lightdash.attributes.name}',
        );
    });

    it('passes ${TABLE} raw column references through against the base alias', () => {
        const result = buildExplore(
            exploreWithSqlFilter('${TABLE}.raw_col = 1'),
            def,
        );

        expect(result.tables.orders.sqlWhere).toBe('"orders".raw_col = 1');
    });

    it('maps a raw time dimension reference to the materialized granularity column', () => {
        const result = buildExplore(
            exploreWithSqlFilter("${order_date} >= '2024-01-01'"),
            {
                ...def,
                timeDimension: 'order_date',
                granularity: TimeFrames.DAY,
            },
        );

        expect(result.tables.orders.sqlWhere).toBe(
            "orders.orders_order_date_day >= '2024-01-01'",
        );
    });

    it('rewrites uncovered field references so serving fails closed on a missing column', () => {
        const result = buildExplore(
            exploreWithSqlFilter(
                '${customers.first_name} = ${lightdash.attributes.name}',
            ),
            { ...def, dimensions: ['status'] },
        );

        expect(result.tables.orders.sqlWhere).toBe(
            'orders.customers_first_name = ${lightdash.attributes.name}',
        );
    });
});
