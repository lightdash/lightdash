import {
    DimensionType,
    FieldType,
    FilterType,
    type DashboardFilterableField,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    countFieldsByKind,
    countPickableByKind,
    filterFieldsByKind,
    filterParametersByKind,
    getFieldKind,
    groupFieldsByExplore,
    matchesParameterSearch,
    type PickableParameter,
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
const name = makeField('name', DimensionType.STRING, 'customers');

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

    it('counts fields per kind', () => {
        expect(countFieldsByKind(all)).toEqual({
            date: 2,
            string: 1,
            number: 1,
            boolean: 1,
        });
    });
});

describe('groupFieldsByExplore', () => {
    it('groups by table and sorts by max chart count, then label', () => {
        const counts: Record<string, number> = { created: 1, name: 3 };
        const groups = groupFieldsByExplore(
            [created, status, name],
            (field) => counts[field.name] ?? 0,
        );
        expect(groups.map((group) => group.label)).toEqual([
            'Customers',
            'Orders',
        ]);
        expect(groups[1]).toMatchObject({
            table: 'orders',
            chartCount: 1,
            fields: [created, status],
        });
    });
});

const region: PickableParameter = {
    key: 'region',
    label: 'Region',
    kind: FilterType.STRING,
    chartCount: 2,
};
const threshold: PickableParameter = {
    key: 'threshold',
    label: 'Minimum revenue',
    kind: FilterType.NUMBER,
    chartCount: 1,
};

describe('parameters in the picker', () => {
    it('filters parameters by kind and keeps all with no kind', () => {
        expect(filterParametersByKind([region, threshold], null)).toEqual([
            region,
            threshold,
        ]);
        expect(
            filterParametersByKind([region, threshold], FilterType.NUMBER),
        ).toEqual([threshold]);
    });

    it('adds parameters to the kind tile counts', () => {
        const counts = countPickableByKind(
            [makeField('status', DimensionType.STRING)],
            [region, threshold],
        );
        expect(counts).toEqual({ string: 2, number: 1, date: 0, boolean: 0 });
    });

    it('matches search on label or key, never on empty text', () => {
        expect(matchesParameterSearch(threshold, 'reven')).toBe(true);
        expect(matchesParameterSearch(threshold, 'THRESH')).toBe(true);
        expect(matchesParameterSearch(threshold, 'region')).toBe(false);
        expect(matchesParameterSearch(threshold, '  ')).toBe(false);
    });
});
