import {
    DimensionType,
    FieldType,
    FilterOperator,
    FilterType,
    MetricType,
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getFieldKind,
    getFilterRuleType,
    getSqlColumnOptions,
    getSqlColumnType,
} from './fieldKinds';

const makeField = (
    name: string,
    type: DimensionType,
    table = 'orders',
): DashboardFilterableField =>
    ({
        fieldType: FieldType.DIMENSION,
        type,
        name,
        label: name,
        table,
        tableLabel: table === 'orders' ? 'Orders' : 'Customers',
        sql: '',
        hidden: false,
    }) as unknown as DashboardFilterableField;

const created = makeField('created', DimensionType.DATE);
const shipped = makeField('shipped', DimensionType.TIMESTAMP);
const status = makeField('status', DimensionType.STRING);
const isPaid = makeField('is_paid', DimensionType.BOOLEAN);
const amount = makeField('amount', DimensionType.NUMBER);
const revenue = {
    ...amount,
    fieldType: FieldType.METRIC,
    type: MetricType.SUM,
    name: 'revenue',
} as unknown as DashboardFilterableField;

describe('getFieldKind', () => {
    it('maps dimension types to kinds', () => {
        expect(getFieldKind(created)).toBe(FilterType.DATE);
        expect(getFieldKind(shipped)).toBe(FilterType.DATE);
        expect(getFieldKind(status)).toBe(FilterType.STRING);
        expect(getFieldKind(isPaid)).toBe(FilterType.BOOLEAN);
        expect(getFieldKind(amount)).toBe(FilterType.NUMBER);
    });
});

describe('getSqlColumnOptions', () => {
    it('lists each column name once across the SQL chart tiles', () => {
        expect(
            getSqlColumnOptions({
                'tile-1': {
                    columns: [
                        { reference: 'country', type: DimensionType.STRING },
                        { reference: 'total', type: DimensionType.NUMBER },
                    ],
                },
                'tile-2': {
                    columns: [
                        { reference: 'country', type: DimensionType.STRING },
                    ],
                },
            }).map((column) => column.reference),
        ).toEqual(['country', 'total']);
    });
});

describe('getSqlColumnType', () => {
    const rule = (fallbackType?: DimensionType): DashboardFilterRule => ({
        id: 'filter',
        label: undefined,
        operator: FilterOperator.EQUALS,
        target: {
            fieldId: 'total',
            tableName: 'sql_chart',
            isSqlColumn: true,
            fallbackType,
        },
        values: [],
    });

    it('reads the type a tile reports for the column', () => {
        expect(
            getSqlColumnType(rule(DimensionType.STRING), {
                'tile-1': {
                    columns: [
                        { reference: 'total', type: DimensionType.NUMBER },
                    ],
                },
            }),
        ).toBe(DimensionType.NUMBER);
    });

    it('falls back to the type the target carries, then to text', () => {
        expect(getSqlColumnType(rule(DimensionType.DATE), {})).toBe(
            DimensionType.DATE,
        );
        expect(getSqlColumnType(rule(), {})).toBe(DimensionType.STRING);
    });
});

describe('getFilterRuleType', () => {
    it("is the field's type when the filter has a field", () => {
        expect(getFilterRuleType(amount, null)).toBe(FilterType.NUMBER);
        expect(getFilterRuleType(revenue, null)).toBe(FilterType.NUMBER);
    });

    it("is the SQL column's type when it has none, else text", () => {
        expect(getFilterRuleType(null, DimensionType.TIMESTAMP)).toBe(
            FilterType.DATE,
        );
        expect(getFilterRuleType(null, null)).toBe(FilterType.STRING);
    });
});
