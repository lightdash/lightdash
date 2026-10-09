import {
    DimensionType,
    FieldType,
    FilterOperator,
    FilterType,
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getDefaultField,
    getFilterRuleWithDisabledState,
    getSqlColumnFilterType,
    getUniqueSqlColumns,
} from './index';

const makeField = (
    table: string,
    name: string,
    type: DimensionType,
): DashboardFilterableField =>
    ({
        fieldType: FieldType.DIMENSION,
        type,
        name,
        label: name,
        table,
        tableLabel: table,
        sql: '',
        hidden: false,
    }) as unknown as DashboardFilterableField;

describe('getDefaultField', () => {
    const selected = makeField('orders', 'status', DimensionType.STRING);
    const sameName = makeField('payments', 'status', DimensionType.STRING);
    const sameType = makeField('payments', 'method', DimensionType.STRING);
    const otherType = makeField('payments', 'amount', DimensionType.NUMBER);

    it('prefers the exact field, then the same type and name, then the same type', () => {
        expect(getDefaultField([sameType, sameName, selected], selected)).toBe(
            selected,
        );
        expect(getDefaultField([sameType, sameName], selected)).toBe(sameName);
        expect(getDefaultField([otherType, sameType], selected)).toBe(sameType);
    });

    it('finds nothing among fields of another type', () => {
        expect(getDefaultField([otherType], selected)).toBeUndefined();
    });
});

describe('getUniqueSqlColumns', () => {
    it('lists each column name once across the SQL chart tiles, the last tile winning', () => {
        expect(
            getUniqueSqlColumns({
                'tile-1': {
                    columns: [
                        { reference: 'country', type: DimensionType.STRING },
                        { reference: 'total', type: DimensionType.NUMBER },
                    ],
                },
                'tile-2': {
                    columns: [
                        { reference: 'total', type: DimensionType.STRING },
                    ],
                },
            }),
        ).toEqual([
            { reference: 'country', type: DimensionType.STRING },
            { reference: 'total', type: DimensionType.STRING },
        ]);
    });
});

describe('getSqlColumnFilterType', () => {
    const columns = [{ reference: 'total', type: DimensionType.NUMBER }];

    it('reads the type a tile reports for the column', () => {
        expect(
            getSqlColumnFilterType(columns, 'total', DimensionType.STRING),
        ).toBe(FilterType.NUMBER);
    });

    it('falls back to the type the target carries, then to text', () => {
        expect(
            getSqlColumnFilterType(columns, 'gone', DimensionType.DATE),
        ).toBe(FilterType.DATE);
        expect(getSqlColumnFilterType([], 'gone', undefined)).toBe(
            FilterType.STRING,
        );
    });
});

describe('getFilterRuleWithDisabledState', () => {
    const rule = (
        overrides: Partial<DashboardFilterRule>,
    ): DashboardFilterRule => ({
        id: 'filter-1',
        label: undefined,
        operator: FilterOperator.EQUALS,
        target: { fieldId: 'orders_status', tableName: 'orders' },
        values: [],
        ...overrides,
    });

    it('enables a disabled rule that has a value', () => {
        expect(
            getFilterRuleWithDisabledState(
                rule({ disabled: true, values: ['done'] }),
                true,
            ).disabled,
        ).toBe(false);
    });

    it('keeps a rule with no value as it was in edit mode', () => {
        expect(
            getFilterRuleWithDisabledState(rule({ disabled: true }), true)
                .disabled,
        ).toBe(true);
        expect(
            getFilterRuleWithDisabledState(rule({ disabled: false }), true)
                .disabled,
        ).toBe(false);
    });

    it('disables a required rule with no value in edit mode', () => {
        expect(
            getFilterRuleWithDisabledState(rule({ required: true }), true)
                .disabled,
        ).toBe(true);
        expect(
            getFilterRuleWithDisabledState(rule({ requiredGroupId: 'g' }), true)
                .disabled,
        ).toBe(true);
    });

    it('disables a rule with no value in view mode unless it is required', () => {
        expect(getFilterRuleWithDisabledState(rule({}), false).disabled).toBe(
            true,
        );
        expect(
            getFilterRuleWithDisabledState(rule({ required: true }), false)
                .disabled,
        ).toBe(false);
    });
});
