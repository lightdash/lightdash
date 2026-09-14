/// <reference types="vitest/globals" />
import {
    DateGranularity,
    DimensionType,
    FieldType,
    FilterOperator,
    MetricType,
    TimeFrames,
    type Dimension,
    type FilterGroup,
    type FilterRule,
    type Metric,
} from '@lightdash/common';
import {
    combineUnderlyingDataFilters,
    getUnderlyingDataFilterParts,
} from './underlyingDataFilters';

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
const amountMetric = metric('amount');

// Recursively collect FilterRules from a possibly-nested group.
const flattenRules = (group: FilterGroup | undefined): FilterRule[] => {
    if (!group) return [];
    const items = 'and' in group ? group.and : group.or;
    return items.flatMap((item) =>
        'target' in item ? [item as FilterRule] : flattenRules(item),
    );
};

describe('getUnderlyingDataFilterParts', () => {
    const baseArgs = {
        pivotReference: undefined,
        dateZoom: undefined,
        allDimensions: [statusDim],
        resolvedTimezone: undefined,
    };

    test('metric click: one equals filter per valid dimension in fieldValues', () => {
        const parts = getUnderlyingDataFilterParts({
            ...baseArgs,
            item: amountMetric,
            value: { raw: 100, formatted: '100' },
            fieldValues: {
                orders_status: { raw: 'completed', formatted: 'completed' },
                orders_amount: { raw: 100, formatted: '100' }, // metric — skipped
                not_a_dimension: { raw: 'x', formatted: 'x' }, // unknown — skipped
            },
        });
        expect(parts.pointFilterRules).toHaveLength(1);
        expect(parts.pointFilterRules[0]).toMatchObject({
            target: { fieldId: 'orders_status' },
            operator: FilterOperator.EQUALS,
            values: ['completed'],
        });
        expect(parts.metricFilterRules).toHaveLength(0);
    });

    test('metric click: null dimension value becomes isNull with no values', () => {
        const parts = getUnderlyingDataFilterParts({
            ...baseArgs,
            item: amountMetric,
            value: { raw: 100, formatted: '100' },
            fieldValues: {
                orders_status: { raw: null, formatted: '∅' },
            },
        });
        expect(parts.pointFilterRules).toHaveLength(1);
        expect(parts.pointFilterRules[0]).toMatchObject({
            target: { fieldId: 'orders_status' },
            operator: FilterOperator.NULL,
        });
        expect(parts.pointFilterRules[0].values).toBeUndefined();
    });

    test('dimension click: single filter on the clicked dimension itself', () => {
        const parts = getUnderlyingDataFilterParts({
            ...baseArgs,
            item: statusDim,
            value: { raw: 'completed', formatted: 'completed' },
            fieldValues: {
                orders_status: { raw: 'completed', formatted: 'completed' },
                orders_other: { raw: 'y', formatted: 'y' },
            },
        });
        expect(parts.pointFilterRules).toHaveLength(1);
        expect(parts.pointFilterRules[0]).toMatchObject({
            target: { fieldId: 'orders_status' },
            operator: FilterOperator.EQUALS,
            values: ['completed'],
        });
    });

    test('date-zoomed dimension becomes a [start, nextStart) range, not equals', () => {
        const dateDim = dimension('order_date_month', {
            type: DimensionType.DATE,
        });
        const parts = getUnderlyingDataFilterParts({
            ...baseArgs,
            allDimensions: [dateDim],
            item: amountMetric,
            value: { raw: 100, formatted: '100' },
            fieldValues: {
                orders_order_date_month: {
                    raw: '2024-11-01T00:00:00Z',
                    formatted: 'November 2024',
                },
            },
            dateZoom: {
                granularity: DateGranularity.MONTH,
                xAxisFieldId: 'orders_order_date_month',
            },
        });
        expect(parts.pointFilterRules).toHaveLength(2);
        expect(parts.pointFilterRules[0]).toMatchObject({
            target: { fieldId: 'orders_order_date_month' },
            operator: FilterOperator.GREATER_THAN_OR_EQUAL,
            values: ['2024-11-01T00:00:00Z'],
        });
        expect(parts.pointFilterRules[1]).toMatchObject({
            target: { fieldId: 'orders_order_date_month' },
            operator: FilterOperator.LESS_THAN,
            values: ['2024-12-01T00:00:00Z'],
        });
    });

    test('DATE-base interval dimension value passes through unshifted', () => {
        const intervalDim = dimension('created_at_month', {
            type: DimensionType.DATE,
            timeInterval: TimeFrames.MONTH,
            timeIntervalBaseDimensionType: DimensionType.DATE,
        } as Partial<Dimension>);
        const parts = getUnderlyingDataFilterParts({
            ...baseArgs,
            allDimensions: [intervalDim],
            item: amountMetric,
            value: { raw: 100, formatted: '100' },
            fieldValues: {
                orders_created_at_month: {
                    raw: '2024-11-01T00:00:00Z',
                    formatted: 'November 2024',
                },
            },
            resolvedTimezone: 'Asia/Tokyo',
        });
        expect(parts.pointFilterRules[0]).toMatchObject({
            operator: FilterOperator.EQUALS,
            values: ['2024-11-01T00:00:00Z'],
        });
    });

    test('pivotReference values become equals filters', () => {
        const parts = getUnderlyingDataFilterParts({
            ...baseArgs,
            item: amountMetric,
            value: { raw: 100, formatted: '100' },
            fieldValues: {},
            pivotReference: {
                field: 'orders_amount',
                pivotValues: [{ field: 'orders_region', value: 'EMEA' }],
            },
        });
        expect(parts.pointFilterRules).toHaveLength(1);
        expect(parts.pointFilterRules[0]).toMatchObject({
            target: { fieldId: 'orders_region' },
            operator: FilterOperator.EQUALS,
            values: ['EMEA'],
        });
    });

    test('metric intrinsic filters are converted to fieldIds in metricFilterRules', () => {
        const filteredMetric = metric('amount', [
            {
                id: 'mf1',
                target: { fieldRef: 'orders.status' },
                operator: FilterOperator.EQUALS,
                values: ['completed'],
            },
        ]);
        const parts = getUnderlyingDataFilterParts({
            ...baseArgs,
            item: filteredMetric,
            value: { raw: 100, formatted: '100' },
            fieldValues: {},
        });
        expect(parts.metricFilterRules).toHaveLength(1);
        expect(parts.metricFilterRules[0]).toMatchObject({
            target: { fieldId: 'orders_status' },
            operator: FilterOperator.EQUALS,
            values: ['completed'],
        });
    });
});

describe('combineUnderlyingDataFilters', () => {
    const pointRule: FilterRule = {
        id: 'p1',
        target: { fieldId: 'orders_status' },
        operator: FilterOperator.EQUALS,
        values: ['completed'],
    };

    test('merges explore dimension filters + point rules + metric rules into one AND group', () => {
        const exploreDimensionFilters: FilterGroup = {
            id: 'g1',
            and: [
                {
                    id: 'e1',
                    target: { fieldId: 'orders_region' },
                    operator: FilterOperator.EQUALS,
                    values: ['EMEA'],
                },
            ],
        };
        const result = combineUnderlyingDataFilters({
            filterParts: {
                pointFilterRules: [pointRule],
                metricFilterRules: [],
            },
            exploreDimensionFilters,
            allFields: [statusDim, dimension('region')],
        });
        const rules = flattenRules(result.dimensions);
        expect(rules).toHaveLength(2);
        expect(rules).toContainEqual(
            expect.objectContaining({ target: { fieldId: 'orders_region' } }),
        );
        expect(rules).toContainEqual(
            expect.objectContaining({ target: { fieldId: 'orders_status' } }),
        );
    });

    test('keeps a metric intrinsic filter targeting an UNSELECTED dimension when it is in allFields', () => {
        const metricRule: FilterRule = {
            id: 'm1',
            target: { fieldId: 'orders_is_completed' },
            operator: FilterOperator.EQUALS,
            values: [true],
        };
        const result = combineUnderlyingDataFilters({
            filterParts: {
                pointFilterRules: [pointRule],
                metricFilterRules: [metricRule],
            },
            exploreDimensionFilters: undefined,
            // orders_is_completed is NOT in the query selection but IS a
            // dimension of the explore — must survive classification.
            allFields: [statusDim, dimension('is_completed')],
        });
        const rules = flattenRules(result.dimensions);
        expect(rules).toContainEqual(
            expect.objectContaining({
                target: { fieldId: 'orders_is_completed' },
            }),
        );
    });

    test('drops rules whose target is absent from allFields (documents core behavior)', () => {
        const strayRule: FilterRule = {
            id: 's1',
            target: { fieldId: 'orders_ghost' },
            operator: FilterOperator.EQUALS,
            values: ['x'],
        };
        const result = combineUnderlyingDataFilters({
            filterParts: {
                pointFilterRules: [pointRule, strayRule],
                metricFilterRules: [],
            },
            exploreDimensionFilters: undefined,
            allFields: [statusDim],
        });
        const rules = flattenRules(result.dimensions);
        expect(rules).toHaveLength(1);
        expect(rules[0]).toMatchObject({
            target: { fieldId: 'orders_status' },
        });
    });
});
