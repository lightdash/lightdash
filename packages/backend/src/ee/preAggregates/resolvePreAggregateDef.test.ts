import {
    DimensionType,
    FieldType,
    FilterOperator,
    MetricType,
    preAggregateUtils,
    SupportedDbtAdapter,
    TimeFrames,
    UnitOfTime,
    type CompiledDimension,
    type CompiledMetric,
    type Explore,
    type ModelRequiredFilterRule,
    type PreAggregateDef,
} from '@lightdash/common';

const makeDimension = ({
    name,
    table = 'orders',
    type = DimensionType.STRING,
    timeInterval,
    timeIntervalBaseDimensionName,
    isIntervalBase,
}: {
    name: string;
    table?: string;
    type?: DimensionType;
    timeInterval?: TimeFrames;
    timeIntervalBaseDimensionName?: string;
    isIntervalBase?: boolean;
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
    ...(isIntervalBase !== undefined ? { isIntervalBase } : {}),
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

const getExplore = (requiredFilters: ModelRequiredFilterRule[]): Explore => ({
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
                    isIntervalBase: true,
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
                shipped_date: makeDimension({
                    name: 'shipped_date',
                    type: DimensionType.DATE,
                    isIntervalBase: true,
                }),
                shipped_date_day: makeDimension({
                    name: 'shipped_date_day',
                    type: DimensionType.DATE,
                    timeInterval: TimeFrames.DAY,
                    timeIntervalBaseDimensionName: 'shipped_date',
                }),
            },
            metrics: {
                order_count: makeMetric({
                    name: 'order_count',
                    type: MetricType.COUNT,
                }),
            },
            lineageGraph: {},
            requiredFilters,
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

const requiredStatusFilter: ModelRequiredFilterRule = {
    id: 'required-status-filter',
    target: { fieldRef: 'status' },
    operator: FilterOperator.EQUALS,
    values: ['completed'],
    required: true,
};

const requiredDateDayFilter: ModelRequiredFilterRule = {
    id: 'required-date-filter',
    target: { fieldRef: 'order_date_day' },
    operator: FilterOperator.IN_THE_PAST,
    values: [10],
    settings: { unitOfTime: UnitOfTime.days },
    required: true,
};

const makeDef = (partial: Partial<PreAggregateDef>): PreAggregateDef => ({
    name: 'orders_rollup',
    dimensions: ['order_date'],
    metrics: ['order_count'],
    timeDimension: 'order_date',
    granularity: TimeFrames.DAY,
    ...partial,
});

describe('resolvePreAggregateDef', () => {
    it('returns the definition as-is when required_filter_dimensions is omitted', () => {
        const preAggregateDef = makeDef({});

        const result = preAggregateUtils.resolvePreAggregateDef({
            sourceExplore: getExplore([requiredStatusFilter]),
            preAggregateDef,
        });

        expect(result).toBe(preAggregateDef);
    });

    it('unions a non-time target into dimensions and keeps the deferral marker', () => {
        const result = preAggregateUtils.resolvePreAggregateDef({
            sourceExplore: getExplore([requiredStatusFilter]),
            preAggregateDef: makeDef({
                requiredFilterDimensions: ['status'],
            }),
        });

        expect(result.dimensions).toStrictEqual(['order_date', 'status']);
        expect(result.requiredFilterDimensions).toStrictEqual(['status']);
    });

    it('does not duplicate a target already declared under another reference form', () => {
        const result = preAggregateUtils.resolvePreAggregateDef({
            sourceExplore: getExplore([requiredStatusFilter]),
            preAggregateDef: makeDef({
                dimensions: ['order_date', 'orders.status'],
                requiredFilterDimensions: ['status'],
            }),
        });

        expect(result.dimensions).toStrictEqual([
            'order_date',
            'orders.status',
        ]);
    });

    it('is idempotent', () => {
        const sourceExplore = getExplore([requiredStatusFilter]);
        const resolved = preAggregateUtils.resolvePreAggregateDef({
            sourceExplore,
            preAggregateDef: makeDef({
                requiredFilterDimensions: ['status'],
            }),
        });

        expect(
            preAggregateUtils.resolvePreAggregateDef({
                sourceExplore,
                preAggregateDef: resolved,
            }),
        ).toStrictEqual(resolved);
    });

    it('unions a joined-table target into dimensions', () => {
        const result = preAggregateUtils.resolvePreAggregateDef({
            sourceExplore: getExplore([
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
            ]),
            preAggregateDef: makeDef({
                requiredFilterDimensions: ['customers.first_name'],
            }),
        });

        expect(result.dimensions).toStrictEqual([
            'order_date',
            'customers.first_name',
        ]);
    });

    it('accepts a time target at exactly the configured granularity without changing the grain', () => {
        const preAggregateDef = makeDef({
            requiredFilterDimensions: ['order_date'],
        });

        const result = preAggregateUtils.resolvePreAggregateDef({
            sourceExplore: getExplore([requiredDateDayFilter]),
            preAggregateDef,
        });

        expect(result).toBe(preAggregateDef);
    });

    it('throws for an unknown dimension entry', () => {
        expect(() =>
            preAggregateUtils.resolvePreAggregateDef({
                sourceExplore: getExplore([requiredStatusFilter]),
                preAggregateDef: makeDef({
                    requiredFilterDimensions: ['nonexistent'],
                }),
            }),
        ).toThrow(
            'Pre-aggregate "orders_rollup" references unknown dimension "nonexistent" in "required_filter_dimensions"',
        );
    });

    it('throws for an entry that matches no required filter', () => {
        expect(() =>
            preAggregateUtils.resolvePreAggregateDef({
                sourceExplore: getExplore([requiredDateDayFilter]),
                preAggregateDef: makeDef({
                    requiredFilterDimensions: ['status'],
                }),
            }),
        ).toThrow(
            'Pre-aggregate "orders_rollup" required_filter_dimensions entry "status" does not match any required filter on the model',
        );
    });

    it('throws for an entry that targets a required:false filter', () => {
        expect(() =>
            preAggregateUtils.resolvePreAggregateDef({
                sourceExplore: getExplore([
                    { ...requiredStatusFilter, required: false },
                ]),
                preAggregateDef: makeDef({
                    requiredFilterDimensions: ['status'],
                }),
            }),
        ).toThrow(
            'Pre-aggregate "orders_rollup" required_filter_dimensions entry "status" targets a filter with "required: false", which is never enforced — there is nothing to defer',
        );
    });

    it('throws for a time target when the pre-aggregate has no time dimension', () => {
        expect(() =>
            preAggregateUtils.resolvePreAggregateDef({
                sourceExplore: getExplore([requiredDateDayFilter]),
                preAggregateDef: makeDef({
                    dimensions: ['status'],
                    timeDimension: undefined,
                    granularity: undefined,
                    requiredFilterDimensions: ['order_date'],
                }),
            }),
        ).toThrow(
            'Pre-aggregate "orders_rollup" cannot defer the time-based required filter on "order_date" without "time_dimension" and "granularity"',
        );
    });

    it('throws for a time target on a different family than the configured time dimension', () => {
        expect(() =>
            preAggregateUtils.resolvePreAggregateDef({
                sourceExplore: getExplore([
                    {
                        ...requiredDateDayFilter,
                        target: { fieldRef: 'shipped_date_day' },
                    },
                ]),
                preAggregateDef: makeDef({
                    requiredFilterDimensions: ['shipped_date'],
                }),
            }),
        ).toThrow(
            'Pre-aggregate "orders_rollup" can only defer time-based required filters on its time dimension "order_date", but "shipped_date" targets a different time dimension',
        );
    });

    it('throws for a required filter that targets the raw time dimension', () => {
        expect(() =>
            preAggregateUtils.resolvePreAggregateDef({
                sourceExplore: getExplore([
                    {
                        ...requiredDateDayFilter,
                        target: { fieldRef: 'order_date' },
                    },
                ]),
                preAggregateDef: makeDef({
                    requiredFilterDimensions: ['order_date'],
                }),
            }),
        ).toThrow(
            'Pre-aggregate "orders_rollup" cannot defer the required filter on "order_date": it targets the raw time dimension. Point the required filter at "order_date_day" or align the granularities',
        );
    });

    it('throws for a required filter at a different granularity than the pre-aggregate', () => {
        expect(() =>
            preAggregateUtils.resolvePreAggregateDef({
                sourceExplore: getExplore([
                    {
                        ...requiredDateDayFilter,
                        target: { fieldRef: 'order_date_month' },
                    },
                ]),
                preAggregateDef: makeDef({
                    requiredFilterDimensions: ['order_date'],
                }),
            }),
        ).toThrow(
            'Pre-aggregate "orders_rollup" cannot defer the required filter on "order_date_month": it uses MONTH granularity but the pre-aggregate materializes DAY. Align the granularities to defer it',
        );
    });
});
