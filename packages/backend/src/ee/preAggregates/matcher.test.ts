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
    type FilterGroup,
    type FilterRule,
    type MetricQuery,
    type ModelRequiredFilterRule,
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

const getExploreWithRequiredFilters = ({
    requiredFilters,
    preAggregates,
}: {
    requiredFilters: ModelRequiredFilterRule[];
    preAggregates: PreAggregateDef[];
}): Explore => {
    const explore = baseExplore();

    return {
        ...explore,
        tables: {
            ...explore.tables,
            orders: {
                ...explore.tables.orders,
                requiredFilters,
            },
        },
        preAggregates,
    };
};

const makeStatusFilterRule = (values: string[]): FilterRule => ({
    id: 'query-status-filter',
    operator: FilterOperator.EQUALS,
    target: { fieldId: 'orders_status' },
    values,
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

    describe('model required filter coverage', () => {
        const makeRequiredStatusFilter = (
            values: string[],
            required = true,
        ): ModelRequiredFilterRule => ({
            id: 'required-status-filter',
            target: { fieldRef: 'status' },
            operator: FilterOperator.EQUALS,
            values,
            required,
        });

        const statusRollup: PreAggregateDef = {
            name: 'orders_status_rollup',
            dimensions: ['status'],
            metrics: ['order_count'],
        };

        const makeAndFilterGroup = (...rules: FilterRule[]): FilterGroup => ({
            id: 'query-filters',
            and: rules,
        });

        const findStatusMatch = ({
            requiredValues,
            required,
            dimensionFilters,
        }: {
            requiredValues: string[];
            required: boolean;
            dimensionFilters: FilterGroup;
        }) =>
            preAggregateUtils.findMatch(
                makeMetricQuery({
                    dimensions: ['orders_status'],
                    metrics: ['orders_order_count'],
                    filters: { dimensions: dimensionFilters },
                }),
                getExploreWithRequiredFilters({
                    requiredFilters: [
                        makeRequiredStatusFilter(requiredValues, required),
                    ],
                    preAggregates: [statusRollup],
                }),
            );

        it('matches a filterless query when the same required fallback restricts materialization', () => {
            const explore = getExploreWithRequiredFilters({
                requiredFilters: [makeRequiredStatusFilter(['completed'])],
                preAggregates: [
                    {
                        name: 'orders_rollup',
                        dimensions: [],
                        metrics: ['order_count'],
                    },
                ],
            });

            const result = preAggregateUtils.findMatch(
                makeMetricQuery({
                    dimensions: [],
                    metrics: ['orders_order_count'],
                }),
                explore,
            );

            expect(result).toStrictEqual({
                hit: true,
                preAggregateName: 'orders_rollup',
                miss: null,
            });
        });

        it.each([
            {
                description: 'equivalent explicit query filter',
                requiredValues: ['completed', 'shipped'],
                required: true,
                dimensionFilters: makeAndFilterGroup(
                    makeStatusFilterRule(['completed', 'shipped']),
                ),
                expectedHit: true,
            },
            {
                description: 'narrower explicit query filter',
                requiredValues: ['completed', 'shipped'],
                required: true,
                dimensionFilters: makeAndFilterGroup(
                    makeStatusFilterRule(['completed']),
                ),
                expectedHit: true,
            },
            {
                description: 'broader same-field query filter',
                requiredValues: ['completed'],
                required: true,
                dimensionFilters: makeAndFilterGroup(
                    makeStatusFilterRule(['completed', 'shipped']),
                ),
                expectedHit: false,
            },
            {
                description: 'required:false model filter',
                requiredValues: ['completed'],
                required: false,
                dimensionFilters: makeAndFilterGroup(
                    makeStatusFilterRule(['completed', 'shipped']),
                ),
                expectedHit: true,
            },
            {
                description: 'disabled same-target query filter',
                requiredValues: ['completed'],
                required: true,
                dimensionFilters: makeAndFilterGroup({
                    ...makeStatusFilterRule(['completed']),
                    disabled: true,
                }),
                expectedHit: false,
            },
            {
                description: 'OR branch that broadens the query',
                requiredValues: ['completed'],
                required: true,
                dimensionFilters: {
                    id: 'query-filters',
                    or: [
                        makeStatusFilterRule(['completed']),
                        {
                            ...makeStatusFilterRule(['shipped']),
                            id: 'query-shipped-filter',
                        },
                    ],
                },
                expectedHit: false,
            },
        ])('$description', (testCase) => {
            const result = findStatusMatch(testCase);

            expect(result.hit).toBe(testCase.expectedHit);
            if (!testCase.expectedHit) {
                expect(result.miss).toStrictEqual({
                    reason: PreAggregateMissReason.PRE_AGGREGATE_FILTER_NOT_SATISFIED,
                    fieldId: 'orders_status',
                });
            }
        });

        it.each([
            { queryDays: 9, expectedHit: true },
            { queryDays: 10, expectedHit: true },
            { queryDays: 11, expectedHit: false },
        ])(
            'matches a required 10-day materialization against a past-$queryDays-days query',
            ({ queryDays, expectedHit }) => {
                const explore = getExploreWithRequiredFilters({
                    requiredFilters: [
                        {
                            id: 'required-order-date-filter',
                            target: { fieldRef: 'order_date_day' },
                            operator: FilterOperator.IN_THE_PAST,
                            values: [10],
                            settings: { unitOfTime: UnitOfTime.days },
                            required: true,
                        },
                    ],
                    preAggregates: [
                        {
                            name: 'orders_daily',
                            dimensions: ['order_date'],
                            metrics: ['order_count'],
                            timeDimension: 'order_date',
                            granularity: TimeFrames.DAY,
                        },
                    ],
                });

                const result = preAggregateUtils.findMatch(
                    makeMetricQuery({
                        dimensions: [],
                        metrics: ['orders_order_count'],
                        filters: {
                            dimensions: {
                                id: 'query-filters',
                                and: [
                                    {
                                        id: 'query-date-filter',
                                        target: {
                                            fieldId: 'orders_order_date_day',
                                        },
                                        operator: FilterOperator.IN_THE_PAST,
                                        values: [queryDays],
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

                expect(result).toStrictEqual(
                    expectedHit
                        ? {
                              hit: true,
                              preAggregateName: 'orders_daily',
                              miss: null,
                          }
                        : {
                              hit: false,
                              preAggregateName: null,
                              miss: {
                                  reason: PreAggregateMissReason.PRE_AGGREGATE_FILTER_NOT_SATISFIED,
                                  fieldId: 'orders_order_date_day',
                              },
                          },
                );
            },
        );

        it('misses when a sibling time filter suppresses but cannot satisfy the required fallback', () => {
            const explore = getExploreWithRequiredFilters({
                requiredFilters: [
                    {
                        id: 'required-order-date-filter',
                        target: { fieldRef: 'order_date_day' },
                        operator: FilterOperator.IN_THE_PAST,
                        values: [3],
                        settings: { unitOfTime: UnitOfTime.days },
                        required: true,
                    },
                ],
                preAggregates: [
                    {
                        name: 'orders_daily',
                        dimensions: ['order_date'],
                        metrics: ['order_count'],
                        timeDimension: 'order_date',
                        granularity: TimeFrames.DAY,
                    },
                ],
            });

            const result = preAggregateUtils.findMatch(
                makeMetricQuery({
                    dimensions: ['orders_order_date_month'],
                    metrics: ['orders_order_count'],
                    filters: {
                        dimensions: {
                            id: 'query-filters',
                            and: [
                                {
                                    id: 'query-date-filter',
                                    target: {
                                        fieldId: 'orders_order_date_month',
                                    },
                                    operator: FilterOperator.IN_THE_PAST,
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
                fieldId: 'orders_order_date_day',
            });
        });

        it('matches identical joined-table required fallbacks', () => {
            const explore = getExploreWithRequiredFilters({
                requiredFilters: [
                    {
                        id: 'required-customer-filter',
                        target: {
                            fieldRef: 'customers.first_name',
                            tableName: 'customers',
                        },
                        operator: FilterOperator.EQUALS,
                        values: ['Alice'],
                        required: true,
                    },
                ],
                preAggregates: [
                    {
                        name: 'orders_rollup',
                        dimensions: [],
                        metrics: ['order_count'],
                    },
                ],
            });

            const result = preAggregateUtils.findMatch(
                makeMetricQuery({
                    dimensions: [],
                    metrics: ['orders_order_count'],
                }),
                explore,
            );

            expect(result).toStrictEqual({
                hit: true,
                preAggregateName: 'orders_rollup',
                miss: null,
            });
        });

        it('does not let a query fallback satisfy an explicit pre-aggregate filter', () => {
            const explore = getExploreWithRequiredFilters({
                requiredFilters: [makeRequiredStatusFilter(['completed'])],
                preAggregates: [
                    {
                        name: 'orders_status_rollup',
                        dimensions: [],
                        metrics: ['order_count'],
                        filters: [
                            {
                                id: 'rollup-status-filter',
                                target: { fieldRef: 'status' },
                                operator: FilterOperator.EQUALS,
                                values: ['completed', 'shipped'],
                            },
                        ],
                    },
                ],
            });

            const result = preAggregateUtils.findMatch(
                makeMetricQuery({
                    dimensions: [],
                    metrics: ['orders_order_count'],
                }),
                explore,
            );

            expect(result.miss).toStrictEqual({
                reason: PreAggregateMissReason.PRE_AGGREGATE_FILTER_NOT_SATISFIED,
                fieldId: 'orders_status',
            });
        });

        describe('required filter deferral (required_filter_dimensions)', () => {
            // Effective defs are built with the same resolution code the
            // explore-generation seam uses, mirroring what the matcher sees.
            const resolveDefs = (explore: Explore): Explore => ({
                ...explore,
                preAggregates: (explore.preAggregates ?? []).map(
                    (preAggregateDef) =>
                        preAggregateUtils.resolvePreAggregateDef({
                            sourceExplore: explore,
                            preAggregateDef,
                        }),
                ),
            });

            const deferredStatusExplore = () =>
                resolveDefs(
                    getExploreWithRequiredFilters({
                        requiredFilters: [
                            makeRequiredStatusFilter(['completed']),
                        ],
                        preAggregates: [
                            {
                                name: 'orders_deferred_rollup',
                                dimensions: ['status'],
                                metrics: ['order_count'],
                                requiredFilterDimensions: ['status'],
                            },
                        ],
                    }),
                );

            it('matches a filterless query against a deferred rollup', () => {
                const result = preAggregateUtils.findMatch(
                    makeMetricQuery({
                        dimensions: ['orders_status'],
                        metrics: ['orders_order_count'],
                    }),
                    deferredStatusExplore(),
                );

                expect(result).toStrictEqual({
                    hit: true,
                    preAggregateName: 'orders_deferred_rollup',
                    miss: null,
                });
            });

            it('matches a query that overrides the deferred required filter with any value', () => {
                const result = preAggregateUtils.findMatch(
                    makeMetricQuery({
                        dimensions: ['orders_status'],
                        metrics: ['orders_order_count'],
                        filters: {
                            dimensions: makeAndFilterGroup(
                                makeStatusFilterRule(['shipped']),
                            ),
                        },
                    }),
                    deferredStatusExplore(),
                );

                expect(result).toStrictEqual({
                    hit: true,
                    preAggregateName: 'orders_deferred_rollup',
                    miss: null,
                });
            });

            it('still misses the overriding query when the required filter is not deferred', () => {
                const result = preAggregateUtils.findMatch(
                    makeMetricQuery({
                        dimensions: ['orders_status'],
                        metrics: ['orders_order_count'],
                        filters: {
                            dimensions: makeAndFilterGroup(
                                makeStatusFilterRule(['shipped']),
                            ),
                        },
                    }),
                    getExploreWithRequiredFilters({
                        requiredFilters: [
                            makeRequiredStatusFilter(['completed']),
                        ],
                        preAggregates: [
                            {
                                name: 'orders_baked_rollup',
                                dimensions: ['status'],
                                metrics: ['order_count'],
                            },
                        ],
                    }),
                );

                expect(result.miss).toStrictEqual({
                    reason: PreAggregateMissReason.PRE_AGGREGATE_FILTER_NOT_SATISFIED,
                    fieldId: 'orders_status',
                });
            });

            it('matches queries beyond the required window when the time filter is deferred', () => {
                const explore = resolveDefs(
                    getExploreWithRequiredFilters({
                        requiredFilters: [
                            {
                                id: 'required-order-date-filter',
                                target: { fieldRef: 'order_date_day' },
                                operator: FilterOperator.IN_THE_PAST,
                                values: [10],
                                settings: { unitOfTime: UnitOfTime.days },
                                required: true,
                            },
                        ],
                        preAggregates: [
                            {
                                name: 'orders_daily',
                                dimensions: ['order_date'],
                                metrics: ['order_count'],
                                timeDimension: 'order_date',
                                granularity: TimeFrames.DAY,
                                requiredFilterDimensions: ['order_date'],
                            },
                        ],
                    }),
                );

                const beyondWindowResult = preAggregateUtils.findMatch(
                    makeMetricQuery({
                        dimensions: [],
                        metrics: ['orders_order_count'],
                        filters: {
                            dimensions: {
                                id: 'query-filters',
                                and: [
                                    {
                                        id: 'query-date-filter',
                                        target: {
                                            fieldId: 'orders_order_date_day',
                                        },
                                        operator: FilterOperator.IN_THE_PAST,
                                        values: [30],
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
                expect(beyondWindowResult.hit).toBe(true);

                const filterlessResult = preAggregateUtils.findMatch(
                    makeMetricQuery({
                        dimensions: [],
                        metrics: ['orders_order_count'],
                    }),
                    explore,
                );
                expect(filterlessResult.hit).toBe(true);
            });

            describe('deferred fallback against an explicit pre-aggregate filter', () => {
                const boundedDeferredExplore = (requiredMonths: number) =>
                    resolveDefs(
                        getExploreWithRequiredFilters({
                            requiredFilters: [
                                {
                                    id: 'required-order-date-filter',
                                    target: { fieldRef: 'order_date_day' },
                                    operator: FilterOperator.IN_THE_PAST,
                                    values: [requiredMonths],
                                    settings: { unitOfTime: UnitOfTime.months },
                                    required: true,
                                },
                            ],
                            preAggregates: [
                                {
                                    name: 'orders_bounded_daily',
                                    dimensions: ['order_date'],
                                    metrics: ['order_count'],
                                    filters: [
                                        {
                                            id: 'rollup-date-filter',
                                            target: { fieldRef: 'order_date' },
                                            operator:
                                                FilterOperator.IN_THE_PAST,
                                            values: [12],
                                            settings: {
                                                unitOfTime: UnitOfTime.months,
                                            },
                                        },
                                    ],
                                    timeDimension: 'order_date',
                                    granularity: TimeFrames.DAY,
                                    requiredFilterDimensions: ['order_date'],
                                },
                            ],
                        }),
                    );

                it('matches a filterless query when the deferred fallback narrows the explicit bound', () => {
                    const result = preAggregateUtils.findMatch(
                        makeMetricQuery({
                            dimensions: [],
                            metrics: ['orders_order_count'],
                        }),
                        boundedDeferredExplore(3),
                    );

                    expect(result).toStrictEqual({
                        hit: true,
                        preAggregateName: 'orders_bounded_daily',
                        miss: null,
                    });
                });

                it('misses a filterless query when the deferred fallback exceeds the explicit bound', () => {
                    const result = preAggregateUtils.findMatch(
                        makeMetricQuery({
                            dimensions: [],
                            metrics: ['orders_order_count'],
                        }),
                        boundedDeferredExplore(15),
                    );

                    expect(result.miss).toStrictEqual({
                        reason: PreAggregateMissReason.PRE_AGGREGATE_FILTER_NOT_SATISFIED,
                        fieldId: 'orders_order_date',
                    });
                });

                it('still misses a filterless query when the required filter is not deferred', () => {
                    const result = preAggregateUtils.findMatch(
                        makeMetricQuery({
                            dimensions: [],
                            metrics: ['orders_order_count'],
                        }),
                        getExploreWithRequiredFilters({
                            requiredFilters: [
                                {
                                    id: 'required-order-date-filter',
                                    target: { fieldRef: 'order_date_day' },
                                    operator: FilterOperator.IN_THE_PAST,
                                    values: [3],
                                    settings: { unitOfTime: UnitOfTime.months },
                                    required: true,
                                },
                            ],
                            preAggregates: [
                                {
                                    name: 'orders_bounded_daily',
                                    dimensions: ['order_date'],
                                    metrics: ['order_count'],
                                    filters: [
                                        {
                                            id: 'rollup-date-filter',
                                            target: { fieldRef: 'order_date' },
                                            operator:
                                                FilterOperator.IN_THE_PAST,
                                            values: [12],
                                            settings: {
                                                unitOfTime: UnitOfTime.months,
                                            },
                                        },
                                    ],
                                    timeDimension: 'order_date',
                                    granularity: TimeFrames.DAY,
                                },
                            ],
                        }),
                    );

                    expect(result.miss).toStrictEqual({
                        reason: PreAggregateMissReason.PRE_AGGREGATE_FILTER_NOT_SATISFIED,
                        fieldId: 'orders_order_date',
                    });
                });
            });
        });

        it('rejects an unsafe same-shape candidate before the selection tie-break', () => {
            const explore = getExploreWithRequiredFilters({
                requiredFilters: [makeRequiredStatusFilter(['completed'])],
                preAggregates: [
                    {
                        name: 'unsafe_required_rollup',
                        dimensions: ['status'],
                        metrics: ['order_count'],
                    },
                    {
                        name: 'safe_explicit_rollup',
                        dimensions: ['status'],
                        metrics: ['order_count'],
                        filters: [
                            {
                                id: 'rollup-status-filter',
                                target: { fieldRef: 'status' },
                                operator: FilterOperator.EQUALS,
                                values: ['completed', 'shipped'],
                            },
                        ],
                    },
                ],
            });

            const result = preAggregateUtils.findMatch(
                makeMetricQuery({
                    dimensions: ['orders_status'],
                    metrics: ['orders_order_count'],
                    filters: {
                        dimensions: {
                            id: 'query-filters',
                            and: [makeStatusFilterRule(['shipped'])],
                        },
                    },
                }),
                explore,
            );

            expect(result).toStrictEqual({
                hit: true,
                preAggregateName: 'safe_explicit_rollup',
                miss: null,
            });
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

    it('returns non_additive_metric for non-reaggregatable metrics', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_summary',
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

        expect(result.miss).toStrictEqual({
            reason: PreAggregateMissReason.NON_ADDITIVE_METRIC,
            fieldId: 'orders_unique_customers',
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

    it('returns granularity_too_fine when query granularity is finer than rollup', () => {
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

    it('returns granularity_too_fine when a filter-only time field is finer than rollup', () => {
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
                dimensions: ['orders_status'],
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
                                settings: { unitOfTime: UnitOfTime.days },
                            },
                        ],
                    },
                },
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

    it('accepts a filter-only time field at the rollup granularity', () => {
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
                dimensions: ['orders_status'],
                metrics: ['orders_order_count'],
                filters: {
                    dimensions: {
                        id: 'query-filters',
                        and: [
                            {
                                id: 'query-date-filter',
                                operator: FilterOperator.IN_THE_PAST,
                                target: { fieldId: 'orders_order_date_month' },
                                values: [3],
                                settings: { unitOfTime: UnitOfTime.months },
                            },
                        ],
                    },
                },
            }),
            explore,
        );

        expect(result).toStrictEqual({
            hit: true,
            preAggregateName: 'orders_monthly',
            miss: null,
        });
    });

    it('accepts coarser query granularity than rollup', () => {
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
