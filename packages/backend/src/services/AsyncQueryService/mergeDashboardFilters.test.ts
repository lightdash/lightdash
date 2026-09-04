import {
    DimensionType,
    ExploreType,
    FieldType,
    FilterOperator,
    getFilterRulesFromGroup,
    isMergeMetricSource,
    MergeJoinType,
    MetricType,
    SupportedDbtAdapter,
    type DashboardFilterRule,
    type DashboardFilters,
    type Explore,
    type MergeQuery,
    type MergeQuerySource,
    type MetricQuery,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    applyDashboardFiltersToMergeQuery,
    applyFilterOverridesToMergeQuery,
    getMergeOutputFieldIds,
} from './mergeDashboardFilters';

const buildExplore = (
    name: string,
    tables: Record<string, { dimensions: string[]; metrics: string[] }>,
): Explore => ({
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    name,
    label: name,
    tags: [],
    baseTable: name,
    type: ExploreType.DEFAULT,
    joinedTables: Object.keys(tables)
        .filter((table) => table !== name)
        .map((table) => ({
            table,
            sqlOn: '',
            compiledSqlOn: '',
            type: undefined,
        })),
    tables: Object.fromEntries(
        Object.entries(tables).map(([table, { dimensions, metrics }]) => [
            table,
            {
                name: table,
                label: table,
                database: 'db',
                schema: 'schema',
                sqlTable: table,
                lineageGraph: {},
                dimensions: Object.fromEntries(
                    dimensions.map((dimension) => [
                        dimension,
                        {
                            fieldType: FieldType.DIMENSION,
                            type: DimensionType.STRING,
                            name: dimension,
                            label: dimension,
                            table,
                            tableLabel: table,
                            sql: '',
                            compiledSql: '',
                            hidden: false,
                            tablesReferences: [table],
                        },
                    ]),
                ),
                metrics: Object.fromEntries(
                    metrics.map((metric) => [
                        metric,
                        {
                            fieldType: FieldType.METRIC,
                            type: MetricType.SUM,
                            name: metric,
                            label: metric,
                            table,
                            tableLabel: table,
                            sql: '',
                            compiledSql: '',
                            hidden: false,
                            tablesReferences: [table],
                        },
                    ]),
                ),
            },
        ]),
    ),
});

const ordersExplore = buildExplore('orders', {
    orders: {
        dimensions: ['order_date_month', 'status'],
        metrics: ['total_order_amount'],
    },
});

const paymentsExplore = buildExplore('payments', {
    payments: {
        dimensions: ['payment_method'],
        metrics: ['unique_payment_count'],
    },
    orders: { dimensions: ['order_date_month', 'status'], metrics: [] },
});

const ordersByMonth: MetricQuery = {
    exploreName: 'orders',
    dimensions: ['orders_order_date_month'],
    metrics: ['orders_total_order_amount'],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
};

const paymentsByMonth: MetricQuery = {
    exploreName: 'payments',
    dimensions: ['orders_order_date_month'],
    metrics: ['payments_unique_payment_count'],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
};

const mergeQuery: MergeQuery = {
    sources: [
        { id: 'orders', metricQuery: ordersByMonth },
        { id: 'payments', metricQuery: paymentsByMonth },
    ],
    joinKey: [
        {
            name: 'order_month',
            fieldIdBySourceId: {
                orders: 'orders_order_date_month',
                payments: 'orders_order_date_month',
            },
        },
    ],
    joinType: MergeJoinType.FULL,
    tableCalculations: [],
    limit: 500,
};

const exploreBySourceId = { orders: ordersExplore, payments: paymentsExplore };

const TILE = 'tile-1';

const rule = (
    id: string,
    fieldId: string,
    tableName: string,
    extra: Partial<DashboardFilterRule> = {},
): DashboardFilterRule => ({
    id,
    target: { fieldId, tableName },
    operator: FilterOperator.EQUALS,
    values: ['completed'],
    label: undefined,
    ...extra,
});

const filters = (partial: Partial<DashboardFilters>): DashboardFilters => ({
    dimensions: [],
    metrics: [],
    tableCalculations: [],
    ...partial,
});

const sourceById = (query: MergeQuery, id: string): MergeQuerySource => {
    const source = query.sources.find((s) => s.id === id);
    if (source === undefined) throw new Error(`No source ${id}`);
    return source;
};

const dimensionFilterFieldIds = (query: MergeQuery, id: string): string[] => {
    const source = sourceById(query, id);
    if (!isMergeMetricSource(source)) throw new Error('Not a metric source');
    return getFilterRulesFromGroup(source.metricQuery.filters.dimensions).map(
        (r) => r.target.fieldId,
    );
};

const metricFilterFieldIds = (query: MergeQuery, id: string): string[] => {
    const source = sourceById(query, id);
    if (!isMergeMetricSource(source)) throw new Error('Not a metric source');
    return getFilterRulesFromGroup(source.metricQuery.filters.metrics).map(
        (r) => r.target.fieldId,
    );
};

describe('applyDashboardFiltersToMergeQuery', () => {
    it('pushes a field both sources have into both, before the join', () => {
        const status = rule('status', 'orders_status', 'orders');
        const result = applyDashboardFiltersToMergeQuery({
            tileUuid: TILE,
            mergeQuery,
            dashboardFilters: filters({ dimensions: [status] }),
            exploreBySourceId,
        });

        expect(dimensionFilterFieldIds(result.mergeQuery, 'orders')).toEqual([
            'orders_status',
        ]);
        expect(dimensionFilterFieldIds(result.mergeQuery, 'payments')).toEqual([
            'orders_status',
        ]);
        expect(result.appliedDashboardFilters.dimensions).toEqual([status]);
        expect(result.appliedDashboardFiltersBySourceId).toEqual({
            orders: filters({ dimensions: [status] }),
            payments: filters({ dimensions: [status] }),
        });
        expect(result.refusedDashboardFilters).toEqual([]);
        // The merge itself is untouched apart from the sources.
        expect(result.mergeQuery.joinKey).toBe(mergeQuery.joinKey);
    });

    it('applies a join-key filter to every side so the join stays aligned', () => {
        const month = rule('month', 'orders_order_date_month', 'orders');
        const result = applyDashboardFiltersToMergeQuery({
            tileUuid: TILE,
            mergeQuery,
            dashboardFilters: filters({ dimensions: [month] }),
            exploreBySourceId,
        });

        expect(dimensionFilterFieldIds(result.mergeQuery, 'orders')).toEqual([
            'orders_order_date_month',
        ]);
        expect(dimensionFilterFieldIds(result.mergeQuery, 'payments')).toEqual([
            'orders_order_date_month',
        ]);
    });

    it('applies a field only one source has to that source alone', () => {
        const method = rule('method', 'payments_payment_method', 'payments');
        const result = applyDashboardFiltersToMergeQuery({
            tileUuid: TILE,
            mergeQuery,
            dashboardFilters: filters({ dimensions: [method] }),
            exploreBySourceId,
        });

        expect(dimensionFilterFieldIds(result.mergeQuery, 'orders')).toEqual(
            [],
        );
        expect(dimensionFilterFieldIds(result.mergeQuery, 'payments')).toEqual([
            'payments_payment_method',
        ]);
        expect(result.appliedDashboardFilters.dimensions).toEqual([method]);
        expect(
            result.appliedDashboardFiltersBySourceId.orders.dimensions,
        ).toEqual([]);
        expect(
            result.appliedDashboardFiltersBySourceId.payments.dimensions,
        ).toEqual([method]);
    });

    it('applies a filter on a field no source selects, as any tile does', () => {
        const status = rule('status', 'orders_status', 'orders');
        const result = applyDashboardFiltersToMergeQuery({
            tileUuid: TILE,
            mergeQuery,
            dashboardFilters: filters({ dimensions: [status] }),
            exploreBySourceId,
        });
        const orders = sourceById(result.mergeQuery, 'orders');
        if (!isMergeMetricSource(orders))
            throw new Error('Not a metric source');
        expect(orders.metricQuery.dimensions).toEqual([
            'orders_order_date_month',
        ]);
        expect(dimensionFilterFieldIds(result.mergeQuery, 'orders')).toEqual([
            'orders_status',
        ]);
    });

    it('drops a field neither source has without refusing', () => {
        const segment = rule('segment', 'customers_segment', 'customers');
        const result = applyDashboardFiltersToMergeQuery({
            tileUuid: TILE,
            mergeQuery,
            dashboardFilters: filters({ dimensions: [segment] }),
            exploreBySourceId,
        });

        expect(result.mergeQuery.sources).toEqual(mergeQuery.sources);
        expect(result.appliedDashboardFilters).toEqual(filters({}));
        expect(result.refusedDashboardFilters).toEqual([]);
    });

    it('refuses a filter that names a merged output column instead of ignoring it', () => {
        const merged = rule(
            'merged',
            'orders_orders_total_order_amount',
            'orders',
        );
        const key = rule('key', 'merge_order_month', 'merge');
        const result = applyDashboardFiltersToMergeQuery({
            tileUuid: TILE,
            mergeQuery,
            dashboardFilters: filters({ dimensions: [merged, key] }),
            exploreBySourceId,
        });

        expect(result.refusedDashboardFilters).toEqual([merged, key]);
        expect(result.appliedDashboardFilters).toEqual(filters({}));
    });

    it('pushes a metric filter into the source as a HAVING filter', () => {
        const amount = rule('amount', 'orders_total_order_amount', 'orders', {
            operator: FilterOperator.GREATER_THAN,
            values: [10],
        });
        const result = applyDashboardFiltersToMergeQuery({
            tileUuid: TILE,
            mergeQuery,
            dashboardFilters: filters({ metrics: [amount] }),
            exploreBySourceId,
        });

        expect(metricFilterFieldIds(result.mergeQuery, 'orders')).toEqual([
            'orders_total_order_amount',
        ]);
        expect(dimensionFilterFieldIds(result.mergeQuery, 'orders')).toEqual(
            [],
        );
        expect(metricFilterFieldIds(result.mergeQuery, 'payments')).toEqual([]);
        expect(result.appliedDashboardFilters.metrics).toEqual([amount]);
    });

    it('honours tile targets: an opted-out tile gets nothing, an override retargets', () => {
        const optedOut = rule('out', 'orders_status', 'orders', {
            tileTargets: { [TILE]: false },
        });
        const retargeted = rule('retarget', 'orders_status', 'orders', {
            tileTargets: {
                [TILE]: {
                    fieldId: 'payments_payment_method',
                    tableName: 'payments',
                },
            },
        });
        const result = applyDashboardFiltersToMergeQuery({
            tileUuid: TILE,
            mergeQuery,
            dashboardFilters: filters({ dimensions: [optedOut, retargeted] }),
            exploreBySourceId,
        });

        expect(dimensionFilterFieldIds(result.mergeQuery, 'orders')).toEqual(
            [],
        );
        expect(dimensionFilterFieldIds(result.mergeQuery, 'payments')).toEqual([
            'payments_payment_method',
        ]);
        expect(
            result.appliedDashboardFilters.dimensions.map((r) => r.id),
        ).toEqual(['retarget']);
    });

    it('ignores tile targets when the filters were not authored for a tile', () => {
        const optedOut = rule('out', 'orders_status', 'orders', {
            tileTargets: { [TILE]: false },
        });
        const result = applyDashboardFiltersToMergeQuery({
            tileUuid: null,
            mergeQuery,
            dashboardFilters: filters({ dimensions: [optedOut] }),
            exploreBySourceId,
        });

        expect(dimensionFilterFieldIds(result.mergeQuery, 'orders')).toEqual([
            'orders_status',
        ]);
    });

    it('leaves a result source untouched', () => {
        const withResult: MergeQuery = {
            ...mergeQuery,
            sources: [
                { id: 'orders', metricQuery: ordersByMonth },
                { id: 'payments', queryUuid: 'query-uuid' },
            ],
        };
        const status = rule('status', 'orders_status', 'orders');
        const result = applyDashboardFiltersToMergeQuery({
            tileUuid: TILE,
            mergeQuery: withResult,
            dashboardFilters: filters({ dimensions: [status] }),
            exploreBySourceId: { orders: ordersExplore },
        });

        expect(sourceById(result.mergeQuery, 'payments')).toEqual({
            id: 'payments',
            queryUuid: 'query-uuid',
        });
        expect(dimensionFilterFieldIds(result.mergeQuery, 'orders')).toEqual([
            'orders_status',
        ]);
        expect(Object.keys(result.appliedDashboardFiltersBySourceId)).toEqual([
            'orders',
        ]);
    });
});

describe('getMergeOutputFieldIds', () => {
    it('names join keys, source values and merge calculations as compilation does', () => {
        const ids = getMergeOutputFieldIds({
            ...mergeQuery,
            tableCalculations: [{ name: 'ratio', displayName: '', sql: '1' }],
        });
        expect([...ids]).toEqual([
            'merge_order_month',
            'orders_orders_total_order_amount',
            'payments_payments_unique_payment_count',
            'merge_ratio',
        ]);
    });
});

describe('applyFilterOverridesToMergeQuery', () => {
    const statusRule = {
        id: 'status',
        target: { fieldId: 'orders_status' },
        operator: FilterOperator.EQUALS,
        values: ['completed'],
    };
    const methodRule = {
        id: 'method',
        target: { fieldId: 'payments_payment_method' },
        operator: FilterOperator.EQUALS,
        values: ['card'],
    };
    const unknownRule = {
        id: 'unknown',
        target: { fieldId: 'customers_segment' },
        operator: FilterOperator.EQUALS,
        values: ['enterprise'],
    };

    it('ANDs the overrides onto every source that has the field, whole on the primary', () => {
        const result = applyFilterOverridesToMergeQuery({
            mergeQuery,
            filterOverrides: {
                dimensions: {
                    id: 'root',
                    and: [statusRule, methodRule, unknownRule],
                },
            },
            exploreBySourceId,
        });

        // The primary keeps the group whole, so an unknown field still fails
        // the run where the chart alone would.
        expect(dimensionFilterFieldIds(result, 'orders')).toEqual([
            'orders_status',
            'payments_payment_method',
            'customers_segment',
        ]);
        expect(dimensionFilterFieldIds(result, 'payments')).toEqual([
            'orders_status',
            'payments_payment_method',
        ]);
    });

    it('drops an OR group a source cannot evaluate rather than narrowing it', () => {
        const result = applyFilterOverridesToMergeQuery({
            mergeQuery,
            filterOverrides: {
                dimensions: {
                    id: 'root',
                    and: [
                        {
                            id: 'either',
                            or: [statusRule, unknownRule],
                        },
                        methodRule,
                    ],
                },
            },
            exploreBySourceId,
        });

        expect(dimensionFilterFieldIds(result, 'payments')).toEqual([
            'payments_payment_method',
        ]);
        expect(dimensionFilterFieldIds(result, 'orders')).toEqual([
            'orders_status',
            'customers_segment',
            'payments_payment_method',
        ]);
    });

    it('leaves a source untouched when nothing resolves there', () => {
        const result = applyFilterOverridesToMergeQuery({
            mergeQuery,
            filterOverrides: {
                dimensions: { id: 'root', and: [unknownRule] },
            },
            exploreBySourceId,
        });

        expect(sourceById(result, 'payments')).toBe(mergeQuery.sources[1]);
    });
});
