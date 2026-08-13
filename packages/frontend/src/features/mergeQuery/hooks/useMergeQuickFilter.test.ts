import {
    DimensionType,
    FieldType,
    FilterOperator,
    getTotalFilterRules,
    type Dimension,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { applyMergeQuickFilter } from './useMergeQuickFilter';

const field: Dimension = {
    fieldType: FieldType.DIMENSION,
    type: DimensionType.NUMBER,
    table: 'merge',
    tableLabel: 'Merged results',
    name: 'join_key_0',
    label: 'Customer id',
    sql: '',
    hidden: false,
};

const targetIds = (filters: Parameters<typeof getTotalFilterRules>[0]) =>
    getTotalFilterRules(filters).map((rule) => rule.target.fieldId);

describe('applyMergeQuickFilter', () => {
    it('applies a shared join key to both source fields', () => {
        const result = applyMergeQuickFilter({
            filtersA: {},
            filtersB: {},
            field,
            origin: {
                kind: 'joinKey',
                fieldIdBySourceId: {
                    a: 'customers_customer_id',
                    b: 'orders_customer_id',
                },
            },
            value: 1,
            operator: FilterOperator.EQUALS,
            focus: 'a',
        });

        expect(result).not.toBeNull();
        expect(targetIds(result!.filtersA)).toEqual(['customers_customer_id']);
        expect(targetIds(result!.filtersB)).toEqual(['orders_customer_id']);
    });

    it('applies a source field only to its owning query', () => {
        const result = applyMergeQuickFilter({
            filtersA: {},
            filtersB: {},
            field,
            origin: {
                kind: 'source',
                sourceId: 'b',
                sourceFieldId: 'orders_order_count',
            },
            value: 2,
            operator: FilterOperator.NOT_EQUALS,
            focus: 'a',
        });

        expect(result).not.toBeNull();
        expect(targetIds(result!.filtersA)).toEqual([]);
        expect(targetIds(result!.filtersB)).toEqual(['orders_order_count']);
        expect(result!.focus).toBe('b');
    });

    it('does not offer a source-less table calculation filter', () => {
        expect(
            applyMergeQuickFilter({
                filtersA: {},
                filtersB: {},
                field,
                origin: { kind: 'tableCalculation' },
                focus: 'a',
            }),
        ).toBeNull();
    });
});
