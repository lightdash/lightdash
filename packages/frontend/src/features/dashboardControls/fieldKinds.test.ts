import {
    DimensionType,
    FieldType,
    FilterType,
    type DashboardFilterableField,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { filterFieldsByKind, getFieldKind } from './fieldKinds';

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

describe('getFieldKind', () => {
    it('maps dimension types to kinds', () => {
        expect(getFieldKind(created)).toBe(FilterType.DATE);
        expect(getFieldKind(shipped)).toBe(FilterType.DATE);
        expect(getFieldKind(status)).toBe(FilterType.STRING);
        expect(getFieldKind(isPaid)).toBe(FilterType.BOOLEAN);
        expect(getFieldKind(amount)).toBe(FilterType.NUMBER);
    });
});

describe('filterFieldsByKind', () => {
    const all = [created, shipped, status, isPaid, amount];

    it('returns every field when no kind is chosen', () => {
        expect(filterFieldsByKind(all, null)).toEqual(all);
    });

    it('keeps only fields of the chosen kind', () => {
        expect(filterFieldsByKind(all, FilterType.STRING)).toEqual([status]);
    });
});
