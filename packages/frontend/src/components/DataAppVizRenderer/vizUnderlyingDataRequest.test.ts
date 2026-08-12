/// <reference types="vitest/globals" />
import {
    DateGranularity,
    DimensionType,
    FieldType,
    FilterOperator,
    MetricType,
    QueryExecutionContext,
    type Dimension,
    type Explore,
    type FilterGroup,
    type FilterRule,
    type ItemsMap,
    type Metric,
    type MetricQuery,
    type TableCalculation,
} from '@lightdash/common';
import {
    buildVizUnderlyingDataRequest,
    type VizUnderlyingDataRewriteArgs,
} from './vizUnderlyingDataRequest';

const dimension = (
    name: string,
    overrides: Partial<Dimension> = {},
): Dimension =>
    ({
        fieldType: FieldType.DIMENSION,
        type: DimensionType.STRING,
        name,
        label: name,
        table: 'orders',
        tableLabel: 'Orders',
        sql: `\${TABLE}.${name}`,
        hidden: false,
        ...overrides,
    }) as Dimension;

const metric = (name: string, filters?: Metric['filters']): Metric =>
    ({
        fieldType: FieldType.METRIC,
        type: MetricType.SUM,
        name,
        label: name,
        table: 'orders',
        tableLabel: 'Orders',
        sql: `\${TABLE}.${name}`,
        hidden: false,
        ...(filters ? { filters } : {}),
    }) as Metric;

const statusDim = dimension('status');
const isCompletedDim = dimension('is_completed');
const orderDateMonthDim = dimension('order_date_month', {
    type: DimensionType.DATE,
});
const amountMetric = metric('amount');
const ratioCalc = {
    name: 'calc_ratio',
    displayName: 'Ratio',
    sql: '${orders.amount} / 100',
} as TableCalculation;

const explore = {
    name: 'orders',
    label: 'Orders',
    baseTable: 'orders',
    joinedTables: [],
    tables: {
        orders: {
            name: 'orders',
            label: 'Orders',
            database: 'db',
            schema: 'public',
            sqlTable: 'orders',
            dimensions: {
                status: statusDim,
                is_completed: isCompletedDim,
                order_date_month: orderDateMonthDim,
            },
            metrics: { amount: amountMetric },
            lineageGraph: {},
        },
    },
} as unknown as Explore;

const itemsMap: ItemsMap = {
    orders_status: statusDim,
    orders_order_date_month: orderDateMonthDim,
    orders_amount: amountMetric,
    calc_ratio: ratioCalc,
};

const metricQuery: MetricQuery = {
    exploreName: 'orders',
    dimensions: ['orders_status'],
    metrics: ['orders_amount'],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
};

const baseArgs: VizUnderlyingDataRewriteArgs = {
    projectUuid: 'project-1',
    queryUuid: 'query-1',
    fieldMapping: { value: 'orders_amount', category: 'orders_status' },
    itemsMap,
    metricQuery,
    explore,
    resolvedTimezone: undefined,
    parameters: undefined,
    dateZoom: undefined,
};

const row = {
    orders_status: { value: { raw: 'completed', formatted: 'Completed' } },
    orders_amount: { value: { raw: 100, formatted: '$100' } },
};

// Recursively collect FilterRules from a possibly-nested group.
const flattenRules = (group: FilterGroup | undefined): FilterRule[] => {
    if (!group) return [];
    const items = 'and' in group ? group.and : group.or;
    return items.flatMap((item) =>
        'target' in item ? [item as FilterRule] : flattenRules(item),
    );
};

describe('buildVizUnderlyingDataRequest', () => {
    test('rejects a non-object intent', () => {
        expect(() => buildVizUnderlyingDataRequest(null, baseArgs)).toThrow(
            /invalid/i,
        );
        expect(() =>
            buildVizUnderlyingDataRequest({ metric: 42, row }, baseArgs),
        ).toThrow(/invalid/i);
    });

    test('rejects a metric name not in the reconciled mapping', () => {
        expect(() =>
            buildVizUnderlyingDataRequest({ row, metric: 'nope' }, baseArgs),
        ).toThrow(/not bound/i);
    });

    test('metric binding: itemId + dimension equality filters from the row', () => {
        const { method, path, body } = buildVizUnderlyingDataRequest(
            { row, metric: 'value' },
            baseArgs,
        );
        expect(method).toBe('POST');
        expect(path).toBe('/api/v2/projects/project-1/query/underlying-data');
        expect(body.context).toBe(QueryExecutionContext.VIEW_UNDERLYING_DATA);
        expect(body.underlyingDataSourceQueryUuid).toBe('query-1');
        expect(body.underlyingDataItemId).toBe('orders_amount');
        const rules = flattenRules(body.filters.dimensions as FilterGroup);
        expect(rules).toHaveLength(1);
        expect(rules[0]).toMatchObject({
            target: { fieldId: 'orders_status' },
            operator: FilterOperator.EQUALS,
            values: ['completed'],
        });
    });

    test('table-calculation binding: itemId omitted, dimension scoping still applies', () => {
        const { body } = buildVizUnderlyingDataRequest(
            { row, metric: 'value' },
            {
                ...baseArgs,
                fieldMapping: { value: 'calc_ratio' },
            },
        );
        expect(body.underlyingDataItemId).toBeUndefined();
        const rules = flattenRules(body.filters.dimensions as FilterGroup);
        expect(rules).toContainEqual(
            expect.objectContaining({
                target: { fieldId: 'orders_status' },
                values: ['completed'],
            }),
        );
    });

    test('stale persisted binding: unmapped field throws instead of resolving', () => {
        // The reconciled mapping dropped "value" (e.g. schema rebuild) even if
        // a persisted config still names it.
        expect(() =>
            buildVizUnderlyingDataRequest(
                { row, metric: 'value' },
                { ...baseArgs, fieldMapping: { category: 'orders_status' } },
            ),
        ).toThrow(/not bound/i);
    });

    test('date zoom: zoomed dim becomes a range filter and dateZoom rides in the body', () => {
        const dateZoom = {
            granularity: DateGranularity.MONTH,
            xAxisFieldId: 'orders_order_date_month',
        };
        const { body } = buildVizUnderlyingDataRequest(
            {
                row: {
                    ...row,
                    orders_order_date_month: {
                        value: {
                            raw: '2024-11-01T00:00:00Z',
                            formatted: 'November 2024',
                        },
                    },
                },
                metric: 'value',
            },
            { ...baseArgs, dateZoom },
        );
        expect(body.dateZoom).toEqual(dateZoom);
        const rules = flattenRules(body.filters.dimensions as FilterGroup);
        const dateRules = rules.filter(
            (rule) => rule.target.fieldId === 'orders_order_date_month',
        );
        expect(dateRules).toHaveLength(2);
        expect(dateRules[0].operator).toBe(
            FilterOperator.GREATER_THAN_OR_EQUAL,
        );
        expect(dateRules[1].operator).toBe(FilterOperator.LESS_THAN);
    });

    test('metric intrinsic filter targeting an unselected dimension survives', () => {
        const filteredMetric = metric('amount', [
            {
                id: 'mf1',
                target: { fieldRef: 'orders.is_completed' },
                operator: FilterOperator.EQUALS,
                values: [true],
            },
        ]);
        const { body } = buildVizUnderlyingDataRequest(
            { row, metric: 'value' },
            {
                ...baseArgs,
                itemsMap: { ...itemsMap, orders_amount: filteredMetric },
            },
        );
        // orders_is_completed is not in metricQuery.dimensions, but IS in the
        // explore — the rule must survive field classification.
        const rules = flattenRules(body.filters.dimensions as FilterGroup);
        expect(rules).toContainEqual(
            expect.objectContaining({
                target: { fieldId: 'orders_is_completed' },
                values: [true],
            }),
        );
    });

    test('parameters and limit pass through; absent ones are omitted', () => {
        const withBoth = buildVizUnderlyingDataRequest(
            { row, metric: 'value', limit: 250 },
            { ...baseArgs, parameters: { region: 'EMEA' } },
        );
        expect(withBoth.body.limit).toBe(250);
        expect(withBoth.body.parameters).toEqual({ region: 'EMEA' });

        const withNeither = buildVizUnderlyingDataRequest(
            { row, metric: 'value' },
            baseArgs,
        );
        expect('limit' in withNeither.body).toBe(false);
        expect('parameters' in withNeither.body).toBe(false);
    });
});
