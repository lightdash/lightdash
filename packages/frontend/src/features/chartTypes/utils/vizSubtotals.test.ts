import {
    DimensionType,
    FieldType,
    MetricType,
    type DataAppVizSchema,
    type ItemsMap,
    type ResultRow,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    filterRowsToParent,
    getVizHierarchyDimensions,
    hasVizSubtotalValues,
    parseVizSubtotalIntent,
} from './vizSubtotals';

const schema = (
    overrides: Partial<DataAppVizSchema> = {},
): DataAppVizSchema => ({
    fields: [
        {
            name: 'levels',
            label: 'Levels',
            type: 'dimension',
            required: true,
            multiple: true,
        },
        { name: 'single', label: 'Single', type: 'dimension', required: false },
        {
            name: 'values',
            label: 'Values',
            type: 'metric',
            required: true,
            multiple: true,
        },
    ],
    configOptions: [],
    colorPalette: null,
    hierarchy: { field: 'levels' },
    ...overrides,
});

const DIMENSIONS = ['orders_country', 'orders_city', 'orders_street'];

const cell = (raw: unknown) => ({ value: { raw, formatted: String(raw) } });

describe('getVizHierarchyDimensions', () => {
    it('returns the dimensions bound to the hierarchy slot in order', () => {
        expect(
            getVizHierarchyDimensions(schema(), { levels: DIMENSIONS }),
        ).toEqual(DIMENSIONS);
    });

    it.each([
        ['no schema', undefined, { levels: DIMENSIONS }],
        [
            'no hierarchy declared',
            schema({ hierarchy: undefined }),
            { levels: DIMENSIONS },
        ],
        [
            'an undeclared slot',
            schema({ hierarchy: { field: 'ghost' } }),
            { ghost: DIMENSIONS },
        ],
        [
            'a non-multiple slot',
            schema({ hierarchy: { field: 'single' } }),
            { single: 'orders_country' },
        ],
        [
            'a non-dimension slot',
            schema({ hierarchy: { field: 'values' } }),
            { values: ['orders_count'] },
        ],
        ['an unbound slot', schema(), {}],
        ['an empty binding', schema(), { levels: [] }],
        ['a blank binding', schema(), { levels: ['orders_country', ' '] }],
        [
            'duplicate bindings',
            schema(),
            { levels: ['orders_country', 'orders_country'] },
        ],
    ])('returns null for %s', (_label, vizSchema, mapping) => {
        expect(getVizHierarchyDimensions(vizSchema, mapping)).toBeNull();
    });
});

describe('hasVizSubtotalValues', () => {
    const dimension = {
        fieldType: FieldType.DIMENSION,
        type: DimensionType.STRING,
        name: 'country',
        label: 'Country',
        table: 'orders',
        tableLabel: 'Orders',
        sql: '${TABLE}.country',
        hidden: false,
    } satisfies ItemsMap[string];
    const metric = {
        fieldType: FieldType.METRIC,
        type: MetricType.COUNT,
        name: 'count',
        label: 'Count',
        table: 'orders',
        tableLabel: 'Orders',
        sql: '${TABLE}.id',
        hidden: false,
    } satisfies ItemsMap[string];
    const tableCalculation = {
        name: 'share',
        displayName: 'Share',
        sql: '${orders.count} / 2',
    } satisfies ItemsMap[string];

    it.each([
        ['a metric', { orders_country: dimension, orders_count: metric }],
        [
            'a table calculation',
            { orders_country: dimension, share: tableCalculation },
        ],
    ])('is true for a query with %s', (_label, itemsMap) => {
        expect(hasVizSubtotalValues(itemsMap)).toBe(true);
    });

    it('is false for a query with dimensions only', () => {
        expect(hasVizSubtotalValues({ orders_country: dimension })).toBe(false);
    });
});

describe('parseVizSubtotalIntent', () => {
    it('resolves the top level', () => {
        expect(
            parseVizSubtotalIntent(DIMENSIONS, { level: 0, parentValues: [] }),
        ).toEqual({
            subtotalDimensions: ['orders_country'],
            parentValues: [],
        });
    });

    it('resolves a deeper level to the dimension prefix', () => {
        expect(
            parseVizSubtotalIntent(DIMENSIONS, {
                level: 2,
                parentValues: ['Portugal', null],
            }),
        ).toEqual({
            subtotalDimensions: DIMENSIONS,
            parentValues: ['Portugal', null],
        });
    });

    it.each([
        [
            'a parent path shorter than the level',
            { level: 1, parentValues: [] },
        ],
        [
            'a parent path longer than the level',
            { level: 0, parentValues: ['Portugal'] },
        ],
        [
            'an out-of-range level',
            { level: 3, parentValues: ['Portugal', 'Lisbon', 'Rua A'] },
        ],
        ['a negative level', { level: -1, parentValues: [] }],
        ['a fractional level', { level: 0.5, parentValues: [] }],
        ['extra keys', { level: 0, parentValues: [], dimensions: ['x'] }],
        [
            'non-primitive parent values',
            { level: 1, parentValues: [{ raw: 'Portugal' }] },
        ],
        ['a missing parent path', { level: 0 }],
        ['a non-object intent', 'level 0'],
    ])('rejects %s', (_label, intent) => {
        expect(() => parseVizSubtotalIntent(DIMENSIONS, intent)).toThrow();
    });
});

describe('filterRowsToParent', () => {
    const row = (
        country: unknown,
        city: unknown,
        status: string,
        count: number,
    ): ResultRow =>
        ({
            orders_country: cell(country),
            orders_city: cell(city),
            orders_status: cell(status),
            orders_count: cell(count),
        }) as ResultRow;

    const rows = [
        row('Portugal', 'Lisbon', 'open', 1),
        row('Portugal', 'Lisbon', 'closed', 2),
        row('Portugal', 'Porto', 'open', 3),
        row('Spain', 'Lisbon', 'open', 4),
        row(null, 'Lisbon', 'open', 5),
        row(1, 'Lisbon', 'open', 6),
    ];

    it('keeps every row without a parent', () => {
        expect(filterRowsToParent(rows, DIMENSIONS, [])).toEqual(rows);
    });

    it('keeps every series row of the matching parent', () => {
        expect(
            filterRowsToParent(rows, DIMENSIONS, ['Portugal', 'Lisbon']),
        ).toEqual([rows[0], rows[1]]);
    });

    it('matches on every parent in the path', () => {
        expect(filterRowsToParent(rows, DIMENSIONS, ['Portugal'])).toEqual([
            rows[0],
            rows[1],
            rows[2],
        ]);
    });

    it('matches null and missing values for a null parent', () => {
        const missing = { orders_city: cell('Faro') } as ResultRow;
        expect(
            filterRowsToParent([...rows, missing], DIMENSIONS, [null]),
        ).toEqual([rows[4], missing]);
    });

    it('compares values strictly', () => {
        expect(filterRowsToParent(rows, DIMENSIONS, ['1'])).toEqual([]);
        expect(filterRowsToParent(rows, DIMENSIONS, [1])).toEqual([rows[5]]);
    });
});
