import {
    BinType,
    CustomDimensionType,
    DimensionType,
    FieldType,
    FilterOperator,
    GroupValueMatchType,
    MetricType,
    PreAggregateMissReason,
    preAggregateUtils,
    SupportedDbtAdapter,
    TableCalculationTemplateType,
    TimeFrames,
    UnitOfTime,
    type CompiledDimension,
    type CompiledMetric,
    type Explore,
    type MetricQuery,
    type PreAggregateDef,
} from '@lightdash/common';

const makeDimension = ({
    name,
    table = 'orders',
    type = DimensionType.STRING,
    timeInterval,
    timeIntervalBaseDimensionName,
}: {
    name: string;
    table?: string;
    type?: DimensionType;
    timeInterval?: TimeFrames;
    timeIntervalBaseDimensionName?: string;
}): CompiledDimension => ({
    index: 0,
    fieldType: FieldType.DIMENSION,
    type,
    name,
    label: name,
    sql: '${TABLE}.x',
    table,
    tableLabel: table,
    hidden: false,
    compiledSql: 'x',
    tablesReferences: [],
    ...(timeInterval ? { timeInterval } : {}),
    ...(timeIntervalBaseDimensionName ? { timeIntervalBaseDimensionName } : {}),
});

const makeMetric = ({
    name,
    type,
    table = 'orders',
}: {
    name: string;
    type: MetricType;
    table?: string;
}): CompiledMetric => ({
    index: 0,
    fieldType: FieldType.METRIC,
    type,
    name,
    label: name,
    sql: '${TABLE}.x',
    table,
    tableLabel: table,
    hidden: false,
    compiledSql: 'x',
    tablesReferences: [],
});

const baseExplore = (): Explore => ({
    name: 'orders',
    label: 'Orders',
    tags: [],
    baseTable: 'orders',
    joinedTables: [],
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    tables: {
        orders: {
            name: 'orders',
            label: 'Orders',
            database: 'db',
            schema: 'public',
            sqlTable: 'orders',
            dimensions: {
                status: makeDimension({ name: 'status' }),
                order_date: makeDimension({
                    name: 'order_date',
                    type: DimensionType.DATE,
                }),
                order_date_day: makeDimension({
                    name: 'order_date_day',
                    type: DimensionType.DATE,
                    timeInterval: TimeFrames.DAY,
                    timeIntervalBaseDimensionName: 'order_date',
                }),
                order_date_month: makeDimension({
                    name: 'order_date_month',
                    type: DimensionType.DATE,
                    timeInterval: TimeFrames.MONTH,
                    timeIntervalBaseDimensionName: 'order_date',
                }),
                order_date_quarter: makeDimension({
                    name: 'order_date_quarter',
                    type: DimensionType.DATE,
                    timeInterval: TimeFrames.QUARTER,
                    timeIntervalBaseDimensionName: 'order_date',
                }),
                order_date_week_num: makeDimension({
                    name: 'order_date_week_num',
                    type: DimensionType.NUMBER,
                    timeInterval: TimeFrames.WEEK_NUM,
                    timeIntervalBaseDimensionName: 'order_date',
                }),
                order_date_month_name: makeDimension({
                    name: 'order_date_month_name',
                    type: DimensionType.STRING,
                    timeInterval: TimeFrames.MONTH_NAME,
                    timeIntervalBaseDimensionName: 'order_date',
                }),
                created_at: makeDimension({
                    name: 'created_at',
                    type: DimensionType.TIMESTAMP,
                }),
                created_at_day: makeDimension({
                    name: 'created_at_day',
                    type: DimensionType.TIMESTAMP,
                    timeInterval: TimeFrames.DAY,
                    timeIntervalBaseDimensionName: 'created_at',
                }),
                created_at_week: makeDimension({
                    name: 'created_at_week',
                    type: DimensionType.TIMESTAMP,
                    timeInterval: TimeFrames.WEEK,
                    timeIntervalBaseDimensionName: 'created_at',
                }),
                amount: makeDimension({
                    name: 'amount',
                    type: DimensionType.NUMBER,
                }),
            },
            metrics: {
                total_order_amount: makeMetric({
                    name: 'total_order_amount',
                    type: MetricType.SUM,
                }),
                shipping_total: makeMetric({
                    name: 'shipping_total',
                    type: MetricType.SUM,
                }),
                order_count: makeMetric({
                    name: 'order_count',
                    type: MetricType.COUNT,
                }),
                unique_customers: makeMetric({
                    name: 'unique_customers',
                    type: MetricType.COUNT_DISTINCT,
                }),
                median_amount: makeMetric({
                    name: 'median_amount',
                    type: MetricType.MEDIAN,
                }),
                running_total_amount: makeMetric({
                    name: 'running_total_amount',
                    type: MetricType.RUNNING_TOTAL,
                }),
                custom_metric: makeMetric({
                    name: 'custom_metric',
                    type: MetricType.NUMBER,
                }),
                gross_total: {
                    ...makeMetric({
                        name: 'gross_total',
                        type: MetricType.NUMBER,
                    }),
                    sql: '${total_order_amount} + ${shipping_total}',
                    compiledSql: '(SUM(x)) + (SUM(y))',
                },
                avg_order_amount: makeMetric({
                    name: 'avg_order_amount',
                    type: MetricType.AVERAGE,
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
            metrics: {},
            lineageGraph: {},
        },
    },
});

const makeExploreWithRequiredStatusFilter = ({
    preAggregateDimensions,
    preAggregateFilters,
    required = true,
}: {
    preAggregateDimensions: string[];
    preAggregateFilters?: PreAggregateDef['filters'];
    required?: boolean;
}): Explore => {
    const explore = baseExplore();

    return {
        ...explore,
        tables: {
            ...explore.tables,
            orders: {
                ...explore.tables.orders,
                requiredFilters: [
                    {
                        id: 'required-status',
                        target: { fieldRef: 'status' },
                        operator: FilterOperator.EQUALS,
                        values: ['completed'],
                        required,
                    },
                ],
            },
        },
        preAggregates: [
            {
                name: 'orders_summary',
                dimensions: preAggregateDimensions,
                metrics: ['order_count'],
                ...(preAggregateFilters
                    ? { filters: preAggregateFilters }
                    : {}),
            },
        ],
    };
};

const makeExploreWithJoinedRequiredFilter = ({
    preAggregateDimensions,
}: {
    preAggregateDimensions: string[];
}): Explore => {
    const explore = baseExplore();

    return {
        ...explore,
        tables: {
            ...explore.tables,
            orders: {
                ...explore.tables.orders,
                requiredFilters: [
                    {
                        id: 'required-customer-name',
                        target: {
                            fieldRef: 'customers.first_name',
                            tableName: 'customers',
                        },
                        operator: FilterOperator.EQUALS,
                        values: ['Ada'],
                        required: true,
                    },
                ],
            },
        },
        preAggregates: [
            {
                name: 'orders_summary',
                dimensions: preAggregateDimensions,
                metrics: ['order_count'],
            },
        ],
    };
};

const makeMetricQuery = (
    partial: Partial<MetricQuery> & Pick<MetricQuery, 'dimensions' | 'metrics'>,
): MetricQuery => ({
    exploreName: 'orders',
    dimensions: partial.dimensions,
    metrics: partial.metrics,
    filters: partial.filters || {},
    sorts: partial.sorts || [],
    limit: partial.limit || 500,
    tableCalculations: partial.tableCalculations || [],
    ...(partial.additionalMetrics
        ? { additionalMetrics: partial.additionalMetrics }
        : {}),
    ...(partial.customDimensions
        ? { customDimensions: partial.customDimensions }
        : {}),
});

const makeCustomBinDimension = (binType: BinType) => {
    const base = {
        id: `${binType}_bin`,
        type: CustomDimensionType.BIN as const,
        name: `${binType} bin`,
        table: 'orders',
        dimensionId: 'orders_amount',
    };

    switch (binType) {
        case BinType.FIXED_WIDTH:
            return {
                ...base,
                binType,
                binWidth: 10,
            };
        case BinType.CUSTOM_RANGE:
            return {
                ...base,
                binType,
                customRange: [
                    { from: undefined, to: 10 },
                    { from: 10, to: undefined },
                ],
            };
        case BinType.CUSTOM_GROUP:
            return {
                ...base,
                binType,
                customGroups: [
                    {
                        name: 'small',
                        values: [
                            {
                                matchType: GroupValueMatchType.EXACT,
                                value: '1',
                            },
                        ],
                    },
                ],
            };
        case BinType.FIXED_NUMBER:
            return {
                ...base,
                binType,
                binNumber: 4,
            };
        default:
            throw new Error(`Unsupported bin type: ${binType}`);
    }
};

describe('findMatch', () => {
    it('returns no_pre_aggregates_defined when explore has no pre-aggregates', () => {
        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: ['orders_status'],
                metrics: ['orders_order_count'],
            }),
            baseExplore(),
        );

        expect(result).toStrictEqual({
            hit: false,
            preAggregateName: null,
            miss: {
                reason: PreAggregateMissReason.NO_PRE_AGGREGATES_DEFINED,
            },
        });
    });

    it('returns hit when dimensions and metrics match', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_daily',
                    dimensions: ['status', 'order_date'],
                    metrics: ['order_count', 'total_order_amount'],
                    timeDimension: 'order_date',
                    granularity: TimeFrames.DAY,
                },
            ],
        };

        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: ['orders_status', 'orders_order_date_month'],
                metrics: ['orders_order_count'],
            }),
            explore,
        );

        expect(result).toStrictEqual({
            hit: true,
            preAggregateName: 'orders_daily',
            miss: null,
        });
    });

    it('returns hit for eligible number metrics when the pre-aggregate explicitly includes their dependencies', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_daily',
                    dimensions: ['status'],
                    metrics: [
                        'gross_total',
                        'total_order_amount',
                        'shipping_total',
                    ],
                },
            ],
        };

        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: ['orders_status'],
                metrics: ['orders_gross_total'],
            }),
            explore,
        );

        expect(result).toStrictEqual({
            hit: true,
            preAggregateName: 'orders_daily',
            miss: null,
        });
    });

    it('returns hit when time dimension is separate from dimensions array', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_daily',
                    dimensions: ['status'],
                    metrics: ['order_count'],
                    timeDimension: 'order_date',
                    granularity: TimeFrames.DAY,
                },
            ],
        };

        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: ['orders_status', 'orders_order_date_month'],
                metrics: ['orders_order_count'],
            }),
            explore,
        );

        expect(result).toStrictEqual({
            hit: true,
            preAggregateName: 'orders_daily',
            miss: null,
        });
    });

    it('matches when the query filter is equivalent to the pre-aggregate filter', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_daily',
                    dimensions: ['status', 'order_date'],
                    metrics: ['order_count'],
                    filters: [
                        {
                            id: 'rollup-filter',
                            target: {
                                fieldRef: 'order_date',
                            },
                            operator: FilterOperator.IN_THE_PAST,
                            values: [3],
                            settings: {
                                unitOfTime: UnitOfTime.days,
                            },
                        },
                    ],
                    timeDimension: 'order_date',
                    granularity: TimeFrames.DAY,
                },
            ],
        };

        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: ['orders_status', 'orders_order_date_month'],
                metrics: ['orders_order_count'],
                filters: {
                    dimensions: {
                        id: 'query-filters',
                        and: [
                            {
                                id: 'query-date-filter',
                                operator: FilterOperator.IN_THE_PAST,
                                target: { fieldId: 'orders_order_date_day' },
                                values: [3],
                                settings: {
                                    unitOfTime: UnitOfTime.days,
                                },
                            },
                        ],
                    },
                },
            }),
            explore,
        );

        expect(result).toStrictEqual({
            hit: true,
            preAggregateName: 'orders_daily',
            miss: null,
        });
    });

    it('matches when the query filter is a narrower subset of the pre-aggregate filter', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_status_rollup',
                    dimensions: ['status'],
                    metrics: ['order_count'],
                    filters: [
                        {
                            id: 'rollup-filter',
                            target: {
                                fieldRef: 'status',
                            },
                            operator: FilterOperator.EQUALS,
                            values: ['completed', 'shipped'],
                        },
                    ],
                },
            ],
        };

        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: ['orders_status'],
                metrics: ['orders_order_count'],
                filters: {
                    dimensions: {
                        id: 'query-filters',
                        and: [
                            {
                                id: 'query-status-filter',
                                operator: FilterOperator.EQUALS,
                                target: { fieldId: 'orders_status' },
                                values: ['completed'],
                            },
                        ],
                    },
                },
            }),
            explore,
        );

        expect(result).toStrictEqual({
            hit: true,
            preAggregateName: 'orders_status_rollup',
            miss: null,
        });
    });

    it('does not match when a string query equals filter has no values', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_status_rollup',
                    dimensions: ['status'],
                    metrics: ['order_count'],
                    filters: [
                        {
                            id: 'rollup-filter',
                            target: {
                                fieldRef: 'status',
                            },
                            operator: FilterOperator.STARTS_WITH,
                            values: ['complete'],
                        },
                    ],
                },
            ],
        };

        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: ['orders_status'],
                metrics: ['orders_order_count'],
                filters: {
                    dimensions: {
                        id: 'query-filters',
                        and: [
                            {
                                id: 'query-status-filter',
                                operator: FilterOperator.EQUALS,
                                target: { fieldId: 'orders_status' },
                                values: [],
                            },
                        ],
                    },
                },
            }),
            explore,
        );

        expect(result.miss).toStrictEqual({
            reason: PreAggregateMissReason.PRE_AGGREGATE_FILTER_NOT_SATISFIED,
            fieldId: 'orders_status',
        });
    });

    it('does not match when a number query equals filter has no values', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_amount_rollup',
                    dimensions: ['amount'],
                    metrics: ['order_count'],
                    filters: [
                        {
                            id: 'rollup-filter',
                            target: {
                                fieldRef: 'amount',
                            },
                            operator: FilterOperator.GREATER_THAN,
                            values: [5],
                        },
                    ],
                },
            ],
        };

        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: ['orders_amount'],
                metrics: ['orders_order_count'],
                filters: {
                    dimensions: {
                        id: 'query-filters',
                        and: [
                            {
                                id: 'query-amount-filter',
                                operator: FilterOperator.EQUALS,
                                target: { fieldId: 'orders_amount' },
                                values: [],
                            },
                        ],
                    },
                },
            }),
            explore,
        );

        expect(result.miss).toStrictEqual({
            reason: PreAggregateMissReason.PRE_AGGREGATE_FILTER_NOT_SATISFIED,
            fieldId: 'orders_amount',
        });
    });

    it('does not match when a date query equals filter has no values', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_date_rollup',
                    dimensions: ['order_date'],
                    metrics: ['order_count'],
                    filters: [
                        {
                            id: 'rollup-filter',
                            target: {
                                fieldRef: 'order_date',
                            },
                            operator: FilterOperator.IN_BETWEEN,
                            values: ['2024-01-01', '2024-01-31'],
                        },
                    ],
                },
            ],
        };

        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: ['orders_order_date_day'],
                metrics: ['orders_order_count'],
                filters: {
                    dimensions: {
                        id: 'query-filters',
                        and: [
                            {
                                id: 'query-date-filter',
                                operator: FilterOperator.EQUALS,
                                target: { fieldId: 'orders_order_date_day' },
                                values: [],
                            },
                        ],
                    },
                },
            }),
            explore,
        );

        expect(result.miss).toStrictEqual({
            reason: PreAggregateMissReason.PRE_AGGREGATE_FILTER_NOT_SATISFIED,
            fieldId: 'orders_order_date',
        });
    });

    it('matches when the query relative date filter is narrower on a sibling time dimension', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_recent_rollup',
                    dimensions: ['order_date'],
                    metrics: ['order_count'],
                    filters: [
                        {
                            id: 'rollup-date-filter',
                            target: {
                                fieldRef: 'order_date',
                            },
                            operator: FilterOperator.IN_THE_PAST,
                            values: [7],
                            settings: {
                                unitOfTime: UnitOfTime.days,
                            },
                        },
                    ],
                    timeDimension: 'order_date',
                    granularity: TimeFrames.DAY,
                },
            ],
        };

        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: ['orders_order_date_day'],
                metrics: ['orders_order_count'],
                filters: {
                    dimensions: {
                        id: 'query-filters',
                        and: [
                            {
                                id: 'query-date-filter',
                                operator: FilterOperator.IN_THE_PAST,
                                target: { fieldId: 'orders_order_date_day' },
                                values: [3],
                                settings: {
                                    unitOfTime: UnitOfTime.days,
                                },
                            },
                        ],
                    },
                },
            }),
            explore,
        );

        expect(result).toStrictEqual({
            hit: true,
            preAggregateName: 'orders_recent_rollup',
            miss: null,
        });
    });

    it('does not match when NOT_IN_THE_CURRENT query is broader than the pre-aggregate filter', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_recent_rollup',
                    dimensions: ['order_date'],
                    metrics: ['order_count'],
                    filters: [
                        {
                            id: 'rollup-date-filter',
                            target: {
                                fieldRef: 'order_date',
                            },
                            operator: FilterOperator.NOT_IN_THE_CURRENT,
                            values: [],
                            settings: {
                                unitOfTime: UnitOfTime.months,
                            },
                        },
                    ],
                    timeDimension: 'order_date',
                    granularity: TimeFrames.DAY,
                },
            ],
        };

        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: ['orders_order_date_day'],
                metrics: ['orders_order_count'],
                filters: {
                    dimensions: {
                        id: 'query-filters',
                        and: [
                            {
                                id: 'query-date-filter',
                                operator: FilterOperator.NOT_IN_THE_CURRENT,
                                target: { fieldId: 'orders_order_date_day' },
                                values: [],
                                settings: {
                                    unitOfTime: UnitOfTime.days,
                                },
                            },
                        ],
                    },
                },
            }),
            explore,
        );

        expect(result.miss).toStrictEqual({
            reason: PreAggregateMissReason.PRE_AGGREGATE_FILTER_NOT_SATISFIED,
            fieldId: 'orders_order_date',
        });
    });

    it('matches when NULL filtered rollups have identical query filters', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_null_status_rollup',
                    dimensions: ['status'],
                    metrics: ['order_count'],
                    filters: [
                        {
                            id: 'rollup-null-filter',
                            target: {
                                fieldRef: 'status',
                            },
                            operator: FilterOperator.NULL,
                        },
                    ],
                },
            ],
        };

        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: ['orders_status'],
                metrics: ['orders_order_count'],
                filters: {
                    dimensions: {
                        id: 'query-filters',
                        and: [
                            {
                                id: 'query-null-filter',
                                operator: FilterOperator.NULL,
                                target: { fieldId: 'orders_status' },
                            },
                        ],
                    },
                },
            }),
            explore,
        );

        expect(result).toStrictEqual({
            hit: true,
            preAggregateName: 'orders_null_status_rollup',
            miss: null,
        });
    });

    it('matches when NOT_NULL filtered rollups have identical query filters', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_not_null_status_rollup',
                    dimensions: ['status'],
                    metrics: ['order_count'],
                    filters: [
                        {
                            id: 'rollup-not-null-filter',
                            target: {
                                fieldRef: 'status',
                            },
                            operator: FilterOperator.NOT_NULL,
                        },
                    ],
                },
            ],
        };

        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: ['orders_status'],
                metrics: ['orders_order_count'],
                filters: {
                    dimensions: {
                        id: 'query-filters',
                        and: [
                            {
                                id: 'query-not-null-filter',
                                operator: FilterOperator.NOT_NULL,
                                target: { fieldId: 'orders_status' },
                            },
                        ],
                    },
                },
            }),
            explore,
        );

        expect(result).toStrictEqual({
            hit: true,
            preAggregateName: 'orders_not_null_status_rollup',
            miss: null,
        });
    });

    it('does not match when the query is missing a required pre-aggregate filter', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_completed_rollup',
                    dimensions: ['status'],
                    metrics: ['order_count'],
                    filters: [
                        {
                            id: 'rollup-filter',
                            target: {
                                fieldRef: 'status',
                            },
                            operator: FilterOperator.EQUALS,
                            values: ['completed'],
                        },
                    ],
                },
            ],
        };

        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: ['orders_status'],
                metrics: ['orders_order_count'],
            }),
            explore,
        );

        expect(result.miss).toStrictEqual({
            reason: PreAggregateMissReason.PRE_AGGREGATE_FILTER_NOT_SATISFIED,
            fieldId: 'orders_status',
        });
    });

    it('does not match when the query filter is broader than the pre-aggregate filter', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_recent_rollup',
                    dimensions: ['order_date'],
                    metrics: ['order_count'],
                    filters: [
                        {
                            id: 'rollup-date-filter',
                            target: {
                                fieldRef: 'order_date',
                            },
                            operator: FilterOperator.IN_THE_PAST,
                            values: [3],
                            settings: {
                                unitOfTime: UnitOfTime.days,
                            },
                        },
                    ],
                    timeDimension: 'order_date',
                    granularity: TimeFrames.DAY,
                },
            ],
        };

        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: ['orders_order_date_day'],
                metrics: ['orders_order_count'],
                filters: {
                    dimensions: {
                        id: 'query-filters',
                        and: [
                            {
                                id: 'query-date-filter',
                                operator: FilterOperator.IN_THE_PAST,
                                target: { fieldId: 'orders_order_date_day' },
                                values: [7],
                                settings: {
                                    unitOfTime: UnitOfTime.days,
                                },
                            },
                        ],
                    },
                },
            }),
            explore,
        );

        expect(result.miss).toStrictEqual({
            reason: PreAggregateMissReason.PRE_AGGREGATE_FILTER_NOT_SATISFIED,
            fieldId: 'orders_order_date',
        });
    });

    it('does not match when an OR filter group broadens beyond the pre-aggregate filter', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_completed_rollup',
                    dimensions: ['status'],
                    metrics: ['order_count'],
                    filters: [
                        {
                            id: 'rollup-filter',
                            target: {
                                fieldRef: 'status',
                            },
                            operator: FilterOperator.EQUALS,
                            values: ['completed'],
                        },
                    ],
                },
            ],
        };

        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: ['orders_status'],
                metrics: ['orders_order_count'],
                filters: {
                    dimensions: {
                        id: 'query-filters',
                        or: [
                            {
                                id: 'status-completed',
                                operator: FilterOperator.EQUALS,
                                target: { fieldId: 'orders_status' },
                                values: ['completed'],
                            },
                            {
                                id: 'status-shipped',
                                operator: FilterOperator.EQUALS,
                                target: { fieldId: 'orders_status' },
                                values: ['shipped'],
                            },
                        ],
                    },
                },
            }),
            explore,
        );

        expect(result.miss).toStrictEqual({
            reason: PreAggregateMissReason.PRE_AGGREGATE_FILTER_NOT_SATISFIED,
            fieldId: 'orders_status',
        });
    });

    it('returns dimension_not_in_pre_aggregate when query dimensions are missing', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_summary',
                    dimensions: ['order_date'],
                    metrics: ['order_count'],
                },
            ],
        };

        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: ['orders_status'],
                metrics: ['orders_order_count'],
            }),
            explore,
        );

        expect(result.miss).toStrictEqual({
            reason: PreAggregateMissReason.DIMENSION_NOT_IN_PRE_AGGREGATE,
            fieldId: 'orders_status',
        });
    });

    it('returns metric_not_in_pre_aggregate when query metrics are missing', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_summary',
                    dimensions: ['status'],
                    metrics: ['order_count'],
                },
            ],
        };

        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: ['orders_status'],
                metrics: ['orders_total_order_amount'],
            }),
            explore,
        );

        expect(result.miss).toStrictEqual({
            reason: PreAggregateMissReason.METRIC_NOT_IN_PRE_AGGREGATE,
            fieldId: 'orders_total_order_amount',
        });
    });

    it('returns non_additive_metric for metrics that can never be served', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_summary',
                    dimensions: ['status'],
                    metrics: ['running_total_amount'],
                },
            ],
        };

        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: ['orders_status'],
                metrics: ['orders_running_total_amount'],
            }),
            explore,
        );

        expect(result.miss).toStrictEqual({
            reason: PreAggregateMissReason.NON_ADDITIVE_METRIC,
            fieldId: 'orders_running_total_amount',
        });
    });

    describe('exact match serving for non-additive metrics', () => {
        const exploreWithUniqueCustomersDef = (
            def?: Partial<PreAggregateDef>,
        ): Explore => ({
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_unique',
                    dimensions: ['status'],
                    metrics: ['unique_customers', 'order_count'],
                    ...def,
                },
            ],
        });

        it('hits when selected dimensions equal the pre-aggregate dimensions', () => {
            const result = preAggregateUtils.findMatch(
                makeMetricQuery({
                    dimensions: ['orders_status'],
                    metrics: ['orders_unique_customers'],
                }),
                exploreWithUniqueCustomersDef(),
            );

            expect(result).toStrictEqual({
                hit: true,
                preAggregateName: 'orders_unique',
                miss: null,
            });
        });

        it('hits with the time dimension selected at exactly the pre-aggregate granularity', () => {
            const result = preAggregateUtils.findMatch(
                makeMetricQuery({
                    dimensions: ['orders_status', 'orders_order_date_day'],
                    metrics: ['orders_unique_customers'],
                }),
                exploreWithUniqueCustomersDef({
                    timeDimension: 'order_date',
                    granularity: TimeFrames.DAY,
                }),
            );

            expect(result).toStrictEqual({
                hit: true,
                preAggregateName: 'orders_unique',
                miss: null,
            });
        });

        it('hits with the base date field of a day-grain time dimension', () => {
            const result = preAggregateUtils.findMatch(
                makeMetricQuery({
                    dimensions: ['orders_status', 'orders_order_date'],
                    metrics: ['orders_unique_customers'],
                }),
                exploreWithUniqueCustomersDef({
                    timeDimension: 'order_date',
                    granularity: TimeFrames.DAY,
                }),
            );

            expect(result).toStrictEqual({
                hit: true,
                preAggregateName: 'orders_unique',
                miss: null,
            });
        });

        it('misses with the base timestamp field of a day-grain time dimension', () => {
            const result = preAggregateUtils.findMatch(
                makeMetricQuery({
                    dimensions: ['orders_status', 'orders_created_at'],
                    metrics: ['orders_unique_customers'],
                }),
                exploreWithUniqueCustomersDef({
                    timeDimension: 'created_at',
                    granularity: TimeFrames.DAY,
                }),
            );

            expect(result.miss).toStrictEqual({
                reason: PreAggregateMissReason.NON_ADDITIVE_METRIC_REQUIRES_EXACT_MATCH,
                fieldId: 'orders_unique_customers',
            });
        });

        it('hits with the day alias of a stored date dimension', () => {
            const result = preAggregateUtils.findMatch(
                makeMetricQuery({
                    dimensions: ['orders_status', 'orders_order_date_day'],
                    metrics: ['orders_unique_customers'],
                }),
                exploreWithUniqueCustomersDef({
                    dimensions: ['status', 'order_date'],
                }),
            );

            expect(result).toStrictEqual({
                hit: true,
                preAggregateName: 'orders_unique',
                miss: null,
            });
        });

        it('misses with the day alias of a stored timestamp dimension', () => {
            const result = preAggregateUtils.findMatch(
                makeMetricQuery({
                    dimensions: ['orders_status', 'orders_created_at_day'],
                    metrics: ['orders_unique_customers'],
                }),
                exploreWithUniqueCustomersDef({
                    dimensions: ['status', 'created_at'],
                }),
            );

            expect(result.miss).toStrictEqual({
                reason: PreAggregateMissReason.NON_ADDITIVE_METRIC_REQUIRES_EXACT_MATCH,
                fieldId: 'orders_unique_customers',
            });
        });

        it('hits for median metrics on an exact match', () => {
            const result = preAggregateUtils.findMatch(
                makeMetricQuery({
                    dimensions: ['orders_status'],
                    metrics: ['orders_median_amount'],
                }),
                exploreWithUniqueCustomersDef({
                    metrics: ['median_amount'],
                }),
            );

            expect(result).toStrictEqual({
                hit: true,
                preAggregateName: 'orders_unique',
                miss: null,
            });
        });

        it('misses when the query selects a subset of the pre-aggregate dimensions', () => {
            const result = preAggregateUtils.findMatch(
                makeMetricQuery({
                    dimensions: ['orders_status'],
                    metrics: ['orders_unique_customers'],
                }),
                exploreWithUniqueCustomersDef({
                    dimensions: ['status', 'amount'],
                }),
            );

            expect(result.miss).toStrictEqual({
                reason: PreAggregateMissReason.NON_ADDITIVE_METRIC_REQUIRES_EXACT_MATCH,
                fieldId: 'orders_unique_customers',
            });
        });

        it('misses metrics-only queries because the dimensions are not selected', () => {
            const result = preAggregateUtils.findMatch(
                makeMetricQuery({
                    dimensions: [],
                    metrics: ['orders_unique_customers'],
                }),
                exploreWithUniqueCustomersDef(),
            );

            expect(result.miss).toStrictEqual({
                reason: PreAggregateMissReason.NON_ADDITIVE_METRIC_REQUIRES_EXACT_MATCH,
                fieldId: 'orders_unique_customers',
            });
        });

        it('misses when the time dimension is queried at a coarser granularity', () => {
            const result = preAggregateUtils.findMatch(
                makeMetricQuery({
                    dimensions: ['orders_status', 'orders_order_date_month'],
                    metrics: ['orders_unique_customers'],
                }),
                exploreWithUniqueCustomersDef({
                    timeDimension: 'order_date',
                    granularity: TimeFrames.DAY,
                }),
            );

            expect(result.miss).toStrictEqual({
                reason: PreAggregateMissReason.NON_ADDITIVE_METRIC_REQUIRES_EXACT_MATCH,
                fieldId: 'orders_unique_customers',
            });
        });

        it('misses when a definition dimension is only referenced by a query filter', () => {
            const result = preAggregateUtils.findMatch(
                makeMetricQuery({
                    dimensions: ['orders_status'],
                    metrics: ['orders_unique_customers'],
                    filters: {
                        dimensions: {
                            id: 'root',
                            and: [
                                {
                                    id: 'f1',
                                    target: { fieldId: 'orders_amount' },
                                    operator: FilterOperator.GREATER_THAN,
                                    values: [10],
                                },
                            ],
                        },
                    },
                }),
                exploreWithUniqueCustomersDef({
                    dimensions: ['status', 'amount'],
                }),
            );

            expect(result.miss).toStrictEqual({
                reason: PreAggregateMissReason.NON_ADDITIVE_METRIC_REQUIRES_EXACT_MATCH,
                fieldId: 'orders_unique_customers',
            });
        });

        it('keeps the exact match when filters target selected dimensions', () => {
            const result = preAggregateUtils.findMatch(
                makeMetricQuery({
                    dimensions: ['orders_status'],
                    metrics: ['orders_unique_customers'],
                    filters: {
                        dimensions: {
                            id: 'root',
                            and: [
                                {
                                    id: 'f1',
                                    target: { fieldId: 'orders_status' },
                                    operator: FilterOperator.EQUALS,
                                    values: ['completed'],
                                },
                            ],
                        },
                    },
                }),
                exploreWithUniqueCustomersDef(),
            );

            expect(result).toStrictEqual({
                hit: true,
                preAggregateName: 'orders_unique',
                miss: null,
            });
        });

        it('misses when a definition dimension is reached only through a custom bin', () => {
            const result = preAggregateUtils.findMatch(
                makeMetricQuery({
                    dimensions: ['orders_status', 'fixed_width_bin'],
                    metrics: ['orders_unique_customers'],
                    customDimensions: [
                        makeCustomBinDimension(BinType.FIXED_WIDTH),
                    ],
                }),
                exploreWithUniqueCustomersDef({
                    dimensions: ['status', 'amount'],
                }),
            );

            expect(result.miss).toStrictEqual({
                reason: PreAggregateMissReason.NON_ADDITIVE_METRIC_REQUIRES_EXACT_MATCH,
                fieldId: 'orders_unique_customers',
            });
        });

        it('keeps the exact match for a subset of the pre-aggregate metrics', () => {
            const result = preAggregateUtils.findMatch(
                makeMetricQuery({
                    dimensions: ['orders_status'],
                    metrics: ['orders_order_count'],
                }),
                exploreWithUniqueCustomersDef(),
            );

            expect(result).toStrictEqual({
                hit: true,
                preAggregateName: 'orders_unique',
                miss: null,
            });
        });

        it('does not gate additive metrics on exactness', () => {
            const result = preAggregateUtils.findMatch(
                makeMetricQuery({
                    dimensions: ['orders_status'],
                    metrics: ['orders_order_count'],
                }),
                exploreWithUniqueCustomersDef({
                    dimensions: ['status', 'amount'],
                    metrics: ['order_count'],
                }),
            );

            expect(result).toStrictEqual({
                hit: true,
                preAggregateName: 'orders_unique',
                miss: null,
            });
        });

        it('keeps definition-filter semantics on exact matches', () => {
            const definitionFilter = {
                id: 'def-filter',
                target: { fieldRef: 'status' },
                operator: FilterOperator.EQUALS,
                values: ['completed'],
            };

            const queryWithoutFilter = makeMetricQuery({
                dimensions: ['orders_status'],
                metrics: ['orders_unique_customers'],
            });
            const queryWithFilter = makeMetricQuery({
                ...queryWithoutFilter,
                filters: {
                    dimensions: {
                        id: 'root',
                        and: [
                            {
                                id: 'f1',
                                target: { fieldId: 'orders_status' },
                                operator: FilterOperator.EQUALS,
                                values: ['completed'],
                            },
                        ],
                    },
                },
            });
            const explore = exploreWithUniqueCustomersDef({
                filters: [definitionFilter],
            });

            expect(
                preAggregateUtils.findMatch(queryWithoutFilter, explore).miss,
            ).toStrictEqual({
                reason: PreAggregateMissReason.PRE_AGGREGATE_FILTER_NOT_SATISFIED,
                fieldId: 'orders_status',
            });
            expect(
                preAggregateUtils.findMatch(queryWithFilter, explore),
            ).toStrictEqual({
                hit: true,
                preAggregateName: 'orders_unique',
                miss: null,
            });
        });

        it('reports the exact-match miss over metric-not-in-pre-aggregate from unrelated defs', () => {
            const explore = {
                ...baseExplore(),
                preAggregates: [
                    {
                        name: 'additive_only',
                        dimensions: ['status'],
                        metrics: ['order_count'],
                    },
                    {
                        name: 'orders_unique',
                        dimensions: ['status', 'amount'],
                        metrics: ['unique_customers'],
                    },
                ],
            };

            const result = preAggregateUtils.findMatch(
                makeMetricQuery({
                    dimensions: ['orders_status'],
                    metrics: ['orders_unique_customers'],
                }),
                explore,
            );

            expect(result.miss).toStrictEqual({
                reason: PreAggregateMissReason.NON_ADDITIVE_METRIC_REQUIRES_EXACT_MATCH,
                fieldId: 'orders_unique_customers',
            });
        });

        it('keeps the smallest-pre-aggregate tie-break on exact matches', () => {
            const explore = {
                ...baseExplore(),
                preAggregates: [
                    {
                        name: 'wide',
                        dimensions: ['status'],
                        metrics: ['unique_customers', 'order_count'],
                    },
                    {
                        name: 'narrow',
                        dimensions: ['status'],
                        metrics: ['unique_customers'],
                    },
                ],
            };

            const result = preAggregateUtils.findMatch(
                makeMetricQuery({
                    dimensions: ['orders_status'],
                    metrics: ['orders_unique_customers'],
                }),
                explore,
            );

            expect(result).toStrictEqual({
                hit: true,
                preAggregateName: 'narrow',
                miss: null,
            });
        });
    });

    it('reports a specific miss over metric-not-in-pre-aggregate from unrelated defs', () => {
        const base = baseExplore();
        const explore = {
            ...base,
            tables: {
                ...base.tables,
                orders: {
                    ...base.tables.orders,
                    metrics: {
                        ...base.tables.orders.metrics,
                        running_total_amount: makeMetric({
                            name: 'running_total_amount',
                            type: MetricType.RUNNING_TOTAL,
                        }),
                    },
                },
            },
            preAggregates: [
                {
                    name: 'additive_only',
                    dimensions: ['status'],
                    metrics: ['order_count'],
                },
                {
                    name: 'orders_running',
                    dimensions: ['status'],
                    metrics: ['running_total_amount'],
                },
            ],
        };

        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: ['orders_status'],
                metrics: ['orders_running_total_amount'],
            }),
            explore,
        );

        expect(result.miss).toStrictEqual({
            reason: PreAggregateMissReason.NON_ADDITIVE_METRIC,
            fieldId: 'orders_running_total_amount',
        });
    });

    it('reports the miss from the def that came closest to matching', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'unrelated',
                    dimensions: ['amount'],
                    metrics: ['order_count'],
                    timeDimension: 'order_date',
                    granularity: TimeFrames.DAY,
                },
                {
                    name: 'near_match',
                    dimensions: ['status'],
                    metrics: ['order_count'],
                    timeDimension: 'order_date',
                    granularity: TimeFrames.DAY,
                },
            ],
        };

        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: ['orders_status', 'orders_order_date_day'],
                metrics: ['orders_order_count'],
                filters: {
                    dimensions: {
                        id: 'root',
                        and: [
                            {
                                id: 'filter-1',
                                target: { fieldId: 'orders_amount' },
                                operator: FilterOperator.EQUALS,
                                values: [10],
                            },
                        ],
                    },
                },
            }),
            explore,
        );

        expect(result.miss).toStrictEqual({
            reason: PreAggregateMissReason.FILTER_DIMENSION_NOT_IN_PRE_AGGREGATE,
            fieldId: 'orders_amount',
        });
    });

    it('keeps YAML definition order between equally close misses', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'first',
                    dimensions: ['amount'],
                    metrics: ['order_count'],
                },
                {
                    name: 'second',
                    dimensions: ['order_date'],
                    metrics: ['order_count'],
                },
            ],
        };

        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: ['orders_amount', 'orders_order_date'],
                metrics: ['orders_order_count'],
            }),
            explore,
        );

        expect(result.miss).toStrictEqual({
            reason: PreAggregateMissReason.DIMENSION_NOT_IN_PRE_AGGREGATE,
            fieldId: 'orders_order_date',
        });
    });

    it('allows type:number metrics when they are explicitly included in the pre-aggregate definition', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_summary',
                    dimensions: ['status'],
                    metrics: ['custom_metric'],
                },
            ],
        };

        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: ['orders_status'],
                metrics: ['orders_custom_metric'],
            }),
            explore,
        );

        expect(result).toStrictEqual({
            hit: true,
            preAggregateName: 'orders_summary',
            miss: null,
        });
    });

    it('returns hit for decomposable average metrics in a covering pre-aggregate', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_summary',
                    dimensions: ['status'],
                    metrics: ['avg_order_amount'],
                },
            ],
        };

        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: ['orders_status'],
                metrics: ['orders_avg_order_amount'],
            }),
            explore,
        );

        expect(result).toStrictEqual({
            hit: true,
            preAggregateName: 'orders_summary',
            miss: null,
        });
    });

    it('returns filter_dimension_not_in_pre_aggregate when dimension filter is missing', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_summary',
                    dimensions: ['status'],
                    metrics: ['order_count'],
                },
            ],
        };

        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: ['orders_status'],
                metrics: ['orders_order_count'],
                filters: {
                    dimensions: {
                        id: '1',
                        and: [
                            {
                                id: '2',
                                operator: FilterOperator.EQUALS,
                                target: { fieldId: 'customers_first_name' },
                                values: ['John'],
                            },
                        ],
                    },
                },
            }),
            explore,
        );

        expect(result.miss).toStrictEqual({
            reason: PreAggregateMissReason.FILTER_DIMENSION_NOT_IN_PRE_AGGREGATE,
            fieldId: 'customers_first_name',
        });
    });

    it('misses when a model required-filter target is absent from the pre-aggregate dimensions', () => {
        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: [],
                metrics: ['orders_order_count'],
            }),
            makeExploreWithRequiredStatusFilter({
                preAggregateDimensions: ['amount'],
            }),
        );

        expect(result).toStrictEqual({
            hit: false,
            preAggregateName: null,
            miss: {
                reason: PreAggregateMissReason.FILTER_DIMENSION_NOT_IN_PRE_AGGREGATE,
                fieldId: 'orders_status',
            },
        });
    });

    it('misses when a joined model required-filter target is absent from the pre-aggregate dimensions', () => {
        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: [],
                metrics: ['orders_order_count'],
            }),
            makeExploreWithJoinedRequiredFilter({
                preAggregateDimensions: ['status'],
            }),
        );

        expect(result).toStrictEqual({
            hit: false,
            preAggregateName: null,
            miss: {
                reason: PreAggregateMissReason.FILTER_DIMENSION_NOT_IN_PRE_AGGREGATE,
                fieldId: 'customers_first_name',
            },
        });
    });

    it('hits when a model required-filter target is present in the pre-aggregate dimensions', () => {
        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: [],
                metrics: ['orders_order_count'],
            }),
            makeExploreWithRequiredStatusFilter({
                preAggregateDimensions: ['status'],
            }),
        );

        expect(result).toStrictEqual({
            hit: true,
            preAggregateName: 'orders_summary',
            miss: null,
        });
    });

    it('misses when a raw timestamp required filter would be applied to a day-grain pre-aggregate', () => {
        const explore = baseExplore();
        explore.tables.orders.requiredFilters = [
            {
                id: 'required-created-at',
                target: { fieldRef: 'created_at' },
                operator: FilterOperator.IN_BETWEEN,
                values: ['2024-02-15 12:00:00', '2024-02-16 12:00:00'],
                required: true,
            },
        ];
        explore.preAggregates = [
            {
                name: 'orders_daily',
                dimensions: [],
                metrics: ['order_count'],
                timeDimension: 'created_at',
                granularity: TimeFrames.DAY,
            },
        ];

        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: [],
                metrics: ['orders_order_count'],
            }),
            explore,
        );

        expect(result).toStrictEqual({
            hit: false,
            preAggregateName: null,
            miss: {
                reason: PreAggregateMissReason.FILTER_DIMENSION_NOT_IN_PRE_AGGREGATE,
                fieldId: 'orders_created_at',
            },
        });
    });

    it('hits when a joined model required-filter target is present in the pre-aggregate dimensions', () => {
        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: [],
                metrics: ['orders_order_count'],
            }),
            makeExploreWithJoinedRequiredFilter({
                preAggregateDimensions: ['customers.first_name'],
            }),
        );

        expect(result).toStrictEqual({
            hit: true,
            preAggregateName: 'orders_summary',
            miss: null,
        });
    });

    it('ignores model filters explicitly marked as not required', () => {
        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: [],
                metrics: ['orders_order_count'],
            }),
            makeExploreWithRequiredStatusFilter({
                preAggregateDimensions: ['amount'],
                required: false,
            }),
        );

        expect(result).toStrictEqual({
            hit: true,
            preAggregateName: 'orders_summary',
            miss: null,
        });
    });

    it('rejects explicit pre-aggregate filters on a model required-filter target', () => {
        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: [],
                metrics: ['orders_order_count'],
                filters: {
                    dimensions: {
                        id: 'query-filters',
                        and: [
                            {
                                id: 'query-status',
                                target: { fieldId: 'orders_status' },
                                operator: FilterOperator.EQUALS,
                                values: ['completed'],
                            },
                        ],
                    },
                },
            }),
            makeExploreWithRequiredStatusFilter({
                preAggregateDimensions: ['status'],
                preAggregateFilters: [
                    {
                        id: 'pre-aggregate-status',
                        target: { fieldRef: 'status' },
                        operator: FilterOperator.EQUALS,
                        values: ['completed'],
                    },
                ],
            }),
        );

        expect(result.miss).toStrictEqual({
            reason: PreAggregateMissReason.PRE_AGGREGATE_FILTER_NOT_SATISFIED,
            fieldId: 'orders_status',
        });
    });

    it('rejects explicit pre-aggregate filters on a sibling required time dimension', () => {
        const explore = baseExplore();
        explore.tables.orders.requiredFilters = [
            {
                id: 'required-created-at-week',
                target: { fieldRef: 'created_at_week' },
                operator: FilterOperator.EQUALS,
                values: ['2024-02-19'],
                required: true,
            },
        ];
        explore.preAggregates = [
            {
                name: 'orders_daily',
                dimensions: [],
                metrics: ['order_count'],
                filters: [
                    {
                        id: 'pre-aggregate-created-at',
                        target: { fieldRef: 'created_at' },
                        operator: FilterOperator.IN_BETWEEN,
                        values: ['2024-02-15 12:00:00', '2024-02-29 12:00:00'],
                    },
                ],
                timeDimension: 'created_at',
                granularity: TimeFrames.DAY,
            },
        ];

        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: [],
                metrics: ['orders_order_count'],
                filters: {
                    dimensions: {
                        id: 'query-filters',
                        and: [
                            {
                                id: 'query-created-at-week',
                                target: {
                                    fieldId: 'orders_created_at_week',
                                },
                                operator: FilterOperator.EQUALS,
                                values: ['2024-02-26'],
                            },
                        ],
                    },
                },
            }),
            explore,
        );

        expect(result.miss).toStrictEqual({
            reason: PreAggregateMissReason.PRE_AGGREGATE_FILTER_NOT_SATISFIED,
            fieldId: 'orders_created_at',
        });
    });

    it('returns granularity_too_fine when query granularity is finer than the pre-aggregate', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_monthly',
                    dimensions: ['status', 'order_date'],
                    metrics: ['order_count'],
                    timeDimension: 'order_date',
                    granularity: TimeFrames.MONTH,
                },
            ],
        };

        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: ['orders_order_date_day'],
                metrics: ['orders_order_count'],
            }),
            explore,
        );

        expect(result.miss).toStrictEqual({
            reason: PreAggregateMissReason.GRANULARITY_TOO_FINE,
            fieldId: 'orders_order_date_day',
            queryGranularity: TimeFrames.DAY,
            preAggregateGranularity: TimeFrames.MONTH,
            preAggregateTimeDimension: 'order_date',
        });
    });

    it('does not serve a raw timestamp from a day-grain pre-aggregate', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_daily',
                    dimensions: [],
                    metrics: ['order_count'],
                    timeDimension: 'created_at',
                    granularity: TimeFrames.DAY,
                },
            ],
        };

        expect(
            preAggregateUtils.findMatch(
                makeMetricQuery({
                    dimensions: ['orders_created_at'],
                    metrics: ['orders_order_count'],
                }),
                explore,
            ).miss,
        ).toStrictEqual({
            reason: PreAggregateMissReason.GRANULARITY_TOO_FINE,
            fieldId: 'orders_created_at',
            queryGranularity: TimeFrames.RAW,
            preAggregateGranularity: TimeFrames.DAY,
            preAggregateTimeDimension: 'created_at',
        });
    });

    it('accepts a nesting query granularity from a day-grain pre-aggregate', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_daily',
                    dimensions: ['order_date'],
                    metrics: ['order_count'],
                    timeDimension: 'order_date',
                    granularity: TimeFrames.DAY,
                },
            ],
        };

        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: ['orders_order_date_month'],
                metrics: ['orders_order_count'],
            }),
            explore,
        );

        expect(result.hit).toBe(true);
    });

    it('accepts named intervals derivable from a day-grain pre-aggregate', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_daily',
                    dimensions: ['order_date'],
                    metrics: ['order_count'],
                    timeDimension: 'order_date',
                    granularity: TimeFrames.DAY,
                },
            ],
        };

        expect(
            preAggregateUtils.findMatch(
                makeMetricQuery({
                    dimensions: ['orders_order_date_month_name'],
                    metrics: ['orders_order_count'],
                }),
                explore,
            ),
        ).toStrictEqual({
            hit: true,
            preAggregateName: 'orders_daily',
            miss: null,
        });
    });

    it('does not derive calendar months from a week-grain pre-aggregate', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_weekly',
                    dimensions: ['order_date'],
                    metrics: ['order_count'],
                    timeDimension: 'order_date',
                    granularity: TimeFrames.WEEK,
                },
            ],
        };

        expect(
            preAggregateUtils.findMatch(
                makeMetricQuery({
                    dimensions: ['orders_order_date_month'],
                    metrics: ['orders_order_count'],
                }),
                explore,
            ).miss,
        ).toStrictEqual({
            reason: PreAggregateMissReason.TIME_FRAME_NOT_DERIVABLE,
            fieldId: 'orders_order_date_month',
            queryGranularity: TimeFrames.MONTH,
            preAggregateGranularity: TimeFrames.WEEK,
            preAggregateTimeDimension: 'order_date',
        });
    });

    it('does not derive week numbers from a week-grain pre-aggregate', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_weekly',
                    dimensions: ['order_date'],
                    metrics: ['order_count'],
                    timeDimension: 'order_date',
                    granularity: TimeFrames.WEEK,
                },
            ],
        };

        expect(
            preAggregateUtils.findMatch(
                makeMetricQuery({
                    dimensions: ['orders_order_date_week_num'],
                    metrics: ['orders_order_count'],
                }),
                explore,
            ).miss,
        ).toStrictEqual({
            reason: PreAggregateMissReason.TIME_FRAME_NOT_DERIVABLE,
            fieldId: 'orders_order_date_week_num',
            queryGranularity: TimeFrames.WEEK_NUM,
            preAggregateGranularity: TimeFrames.WEEK,
            preAggregateTimeDimension: 'order_date',
        });
    });

    it('treats a raw date filter as day grain', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_daily',
                    dimensions: ['order_date'],
                    metrics: ['order_count'],
                    timeDimension: 'order_date',
                    granularity: TimeFrames.DAY,
                },
            ],
        };

        expect(
            preAggregateUtils.findMatch(
                makeMetricQuery({
                    dimensions: ['orders_order_date_day'],
                    metrics: ['orders_order_count'],
                    filters: {
                        dimensions: {
                            id: 'date-filter',
                            and: [
                                {
                                    id: 'raw-date-filter',
                                    target: {
                                        fieldId: 'orders_order_date',
                                    },
                                    operator: FilterOperator.EQUALS,
                                    values: ['2024-01-01'],
                                },
                            ],
                        },
                    },
                }),
                explore,
            ),
        ).toStrictEqual({
            hit: true,
            preAggregateName: 'orders_daily',
            miss: null,
        });
    });

    it.each([
        BinType.FIXED_WIDTH,
        BinType.CUSTOM_RANGE,
        BinType.CUSTOM_GROUP,
        BinType.FIXED_NUMBER,
    ])(
        'returns hit for %s custom bin dimensions when their dependency is in the pre-aggregate',
        (binType) => {
            const customBinDimension = makeCustomBinDimension(binType);
            const explore = {
                ...baseExplore(),
                preAggregates: [
                    {
                        name: 'orders_summary',
                        dimensions: ['status', 'amount'],
                        metrics: ['order_count'],
                    },
                ],
            };

            const result = preAggregateUtils.findMatch(
                makeMetricQuery({
                    dimensions: [customBinDimension.id, 'orders_status'],
                    metrics: ['orders_order_count'],
                    customDimensions: [customBinDimension],
                }),
                explore,
            );

            expect(result).toStrictEqual({
                hit: true,
                preAggregateName: 'orders_summary',
                miss: null,
            });
        },
    );

    it('returns dimension_not_in_pre_aggregate when a custom bin dependency is missing', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_summary',
                    dimensions: ['status'],
                    metrics: ['order_count'],
                },
            ],
        };

        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: ['fixed_width_bin', 'orders_status'],
                metrics: ['orders_order_count'],
                customDimensions: [makeCustomBinDimension(BinType.FIXED_WIDTH)],
            }),
            explore,
        );

        expect(result.miss).toStrictEqual({
            reason: PreAggregateMissReason.DIMENSION_NOT_IN_PRE_AGGREGATE,
            fieldId: 'fixed_width_bin',
        });
    });

    it('returns custom_dimension_present when a custom SQL dimension exists', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_summary',
                    dimensions: ['status'],
                    metrics: ['order_count'],
                },
            ],
        };

        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: ['orders_status'],
                metrics: ['orders_order_count'],
                customDimensions: [
                    {
                        id: 'custom_1',
                        type: CustomDimensionType.SQL,
                        name: 'Custom',
                        table: 'orders',
                        sql: '1',
                        dimensionType: DimensionType.NUMBER,
                    },
                ],
            }),
            explore,
        );

        expect(result.miss).toStrictEqual({
            reason: PreAggregateMissReason.CUSTOM_DIMENSION_PRESENT,
        });
    });

    it('returns hit when only template table calculations exist', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_summary',
                    dimensions: ['status'],
                    metrics: ['order_count'],
                },
            ],
        };

        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: ['orders_status'],
                metrics: ['orders_order_count'],
                tableCalculations: [
                    {
                        name: 'calc_1',
                        displayName: 'Calc',
                        template: {
                            type: TableCalculationTemplateType.PERCENT_OF_COLUMN_TOTAL,
                            fieldId: 'orders_order_count',
                        },
                    },
                ],
            }),
            explore,
        );

        expect(result).toStrictEqual({
            hit: true,
            preAggregateName: 'orders_summary',
            miss: null,
        });
    });

    it('returns hit when only formula table calculations exist', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_summary',
                    dimensions: ['status'],
                    metrics: ['order_count'],
                },
            ],
        };

        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: ['orders_status'],
                metrics: ['orders_order_count'],
                tableCalculations: [
                    {
                        name: 'calc_1',
                        displayName: 'Calc',
                        formula: '=orders_order_count * 2',
                    },
                ],
            }),
            explore,
        );

        expect(result).toStrictEqual({
            hit: true,
            preAggregateName: 'orders_summary',
            miss: null,
        });
    });

    it('returns table_calculation_present when a SQL table calculation exists', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_summary',
                    dimensions: ['status'],
                    metrics: ['order_count'],
                },
            ],
        };

        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: ['orders_status'],
                metrics: ['orders_order_count'],
                tableCalculations: [
                    {
                        name: 'calc_1',
                        displayName: 'Calc',
                        sql: '1',
                    },
                ],
            }),
            explore,
        );

        expect(result.miss).toStrictEqual({
            reason: PreAggregateMissReason.TABLE_CALCULATION_PRESENT,
            fieldId: 'calc_1',
        });
    });

    it('returns table_calculation_present when SQL and semantic table calculations are mixed', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_summary',
                    dimensions: ['status'],
                    metrics: ['order_count'],
                },
            ],
        };

        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: ['orders_status'],
                metrics: ['orders_order_count'],
                tableCalculations: [
                    {
                        name: 'calc_template',
                        displayName: 'Template calc',
                        template: {
                            type: TableCalculationTemplateType.PERCENT_OF_COLUMN_TOTAL,
                            fieldId: 'orders_order_count',
                        },
                    },
                    {
                        name: 'calc_sql',
                        displayName: 'SQL calc',
                        sql: '1',
                    },
                ],
            }),
            explore,
        );

        expect(result.miss).toStrictEqual({
            reason: PreAggregateMissReason.TABLE_CALCULATION_PRESENT,
            fieldId: 'calc_sql',
        });
    });

    it('returns custom_metric_present when additional metrics exist', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_summary',
                    dimensions: ['status'],
                    metrics: ['order_count'],
                },
            ],
        };

        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: ['orders_status'],
                metrics: ['orders_order_count'],
                additionalMetrics: [
                    {
                        name: 'custom',
                        table: 'orders',
                        type: MetricType.SUM,
                        sql: '${TABLE}.amount',
                    },
                ],
            }),
            explore,
        );

        expect(result.miss).toStrictEqual({
            reason: PreAggregateMissReason.CUSTOM_METRIC_PRESENT,
            fieldId: 'orders_custom',
        });
    });

    it('picks the smallest matching pre-aggregate', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_large',
                    dimensions: ['status', 'order_date'],
                    metrics: ['order_count'],
                },
                {
                    name: 'orders_small',
                    dimensions: ['status'],
                    metrics: ['order_count'],
                },
            ],
        };

        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: ['orders_status'],
                metrics: ['orders_order_count'],
            }),
            explore,
        );

        expect(result).toStrictEqual({
            hit: true,
            preAggregateName: 'orders_small',
            miss: null,
        });
    });

    it('uses metrics count as tie-breaker when dimensions count is equal', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_wider_metrics',
                    dimensions: ['status'],
                    metrics: ['order_count', 'total_order_amount'],
                },
                {
                    name: 'orders_narrow_metrics',
                    dimensions: ['status'],
                    metrics: ['order_count'],
                },
            ],
        };

        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: ['orders_status'],
                metrics: ['orders_order_count'],
            }),
            explore,
        );

        expect(result).toStrictEqual({
            hit: true,
            preAggregateName: 'orders_narrow_metrics',
            miss: null,
        });
    });

    it('prefers the coarsest matching granularity when dimensions count is equal', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_daily',
                    dimensions: ['status'],
                    metrics: ['order_count'],
                    timeDimension: 'order_date',
                    granularity: TimeFrames.DAY,
                },
                {
                    name: 'orders_monthly',
                    dimensions: ['status'],
                    metrics: ['order_count'],
                    timeDimension: 'order_date',
                    granularity: TimeFrames.MONTH,
                },
            ],
        };

        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: ['orders_order_date_quarter', 'orders_status'],
                metrics: ['orders_order_count'],
            }),
            explore,
        );

        expect(result).toStrictEqual({
            hit: true,
            preAggregateName: 'orders_monthly',
            miss: null,
        });
    });

    it('prefers a def without time rollup over a time rollup when both match', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_daily',
                    dimensions: ['status'],
                    metrics: ['order_count'],
                    timeDimension: 'order_date',
                    granularity: TimeFrames.DAY,
                },
                {
                    name: 'orders_by_status',
                    dimensions: ['status'],
                    metrics: ['order_count'],
                },
            ],
        };

        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: ['orders_status'],
                metrics: ['orders_order_count'],
            }),
            explore,
        );

        expect(result).toStrictEqual({
            hit: true,
            preAggregateName: 'orders_by_status',
            miss: null,
        });
    });

    it('matches joined dimension references in dot notation', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'customer_rollup',
                    dimensions: ['customers.first_name'],
                    metrics: ['order_count'],
                },
            ],
        };

        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: ['customers_first_name'],
                metrics: ['orders_order_count'],
            }),
            explore,
        );

        expect(result.hit).toBe(true);
    });

    it('extracts nested filter group dimensions', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'customer_rollup',
                    dimensions: ['status', 'customers.first_name'],
                    metrics: ['order_count'],
                },
            ],
        };

        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: ['orders_status'],
                metrics: ['orders_order_count'],
                filters: {
                    dimensions: {
                        id: 'root',
                        and: [
                            {
                                id: 'or1',
                                or: [
                                    {
                                        id: 'f1',
                                        operator: FilterOperator.EQUALS,
                                        target: {
                                            fieldId: 'customers_first_name',
                                        },
                                        values: ['A'],
                                    },
                                    {
                                        id: 'f2',
                                        operator: FilterOperator.EQUALS,
                                        target: { fieldId: 'orders_status' },
                                        values: ['completed'],
                                    },
                                ],
                            },
                        ],
                    },
                },
            }),
            explore,
        );

        expect(result.hit).toBe(true);
    });

    it('allows dimensions-only queries when dimensions match', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'status_rollup',
                    dimensions: ['status'],
                    metrics: ['order_count'],
                },
            ],
        };

        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: ['orders_status'],
                metrics: [],
            }),
            explore,
        );

        expect(result.hit).toBe(true);
    });

    it('allows metrics-only queries when metrics match', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'metric_rollup',
                    dimensions: ['status'],
                    metrics: ['order_count'],
                },
            ],
        };

        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: [],
                metrics: ['orders_order_count'],
            }),
            explore,
        );

        expect(result.hit).toBe(true);
    });
});

describe('findMatch sql_filter coverage', () => {
    const makeExploreWithSqlFilter = ({
        uncompiledSqlWhere,
        preAggregateDimensions,
    }: {
        uncompiledSqlWhere: string;
        preAggregateDimensions: string[];
    }): Explore => {
        const explore = baseExplore();
        return {
            ...explore,
            tables: {
                ...explore.tables,
                orders: {
                    ...explore.tables.orders,
                    uncompiledSqlWhere,
                    sqlWhere: uncompiledSqlWhere,
                },
            },
            preAggregates: [
                {
                    name: 'orders_summary',
                    dimensions: preAggregateDimensions,
                    metrics: ['order_count'],
                },
            ],
        };
    };

    it('misses when sql_filter references a joined field that is not a definition dimension', () => {
        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: ['orders_status'],
                metrics: ['orders_order_count'],
            }),
            makeExploreWithSqlFilter({
                uncompiledSqlWhere:
                    '${customers.first_name} = ${lightdash.attributes.name}',
                preAggregateDimensions: ['status'],
            }),
        );

        expect(result).toStrictEqual({
            hit: false,
            preAggregateName: null,
            miss: {
                reason: PreAggregateMissReason.SQL_FILTER_FIELD_NOT_IN_PRE_AGGREGATE,
                fieldId: 'customers_first_name',
            },
        });
    });

    it('misses when sql_filter references a base-table field that is not a definition dimension', () => {
        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: ['orders_status'],
                metrics: ['orders_order_count'],
            }),
            makeExploreWithSqlFilter({
                uncompiledSqlWhere: '${amount} > 10',
                preAggregateDimensions: ['status'],
            }),
        );

        expect(result).toStrictEqual({
            hit: false,
            preAggregateName: null,
            miss: {
                reason: PreAggregateMissReason.SQL_FILTER_FIELD_NOT_IN_PRE_AGGREGATE,
                fieldId: 'orders_amount',
            },
        });
    });

    it('hits when the sql_filter field is a definition dimension', () => {
        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: ['orders_status'],
                metrics: ['orders_order_count'],
            }),
            makeExploreWithSqlFilter({
                uncompiledSqlWhere:
                    '${customers.first_name} = ${lightdash.attributes.name}',
                preAggregateDimensions: ['status', 'customers.first_name'],
            }),
        );

        expect(result).toStrictEqual({
            hit: true,
            preAggregateName: 'orders_summary',
            miss: null,
        });
    });

    it('ignores ${TABLE} and ${lightdash.*} references in sql_filter', () => {
        const result = preAggregateUtils.findMatch(
            makeMetricQuery({
                dimensions: ['orders_status'],
                metrics: ['orders_order_count'],
            }),
            makeExploreWithSqlFilter({
                uncompiledSqlWhere:
                    "${TABLE}.raw_col = 1 AND ${lightdash.attributes.segment} = 'gold'",
                preAggregateDimensions: ['status'],
            }),
        );

        expect(result).toStrictEqual({
            hit: true,
            preAggregateName: 'orders_summary',
            miss: null,
        });
    });
});
