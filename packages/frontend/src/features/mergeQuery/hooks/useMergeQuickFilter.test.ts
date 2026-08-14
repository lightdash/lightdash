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
    it('applies a shared join key to every source field', () => {
        const result = applyMergeQuickFilter({
            filtersBySourceId: { a: {}, b: {}, c: {} },
            field,
            origin: {
                kind: 'joinKey',
                fieldIdBySourceId: {
                    a: 'customers_customer_id',
                    b: 'orders_customer_id',
                    c: 'accounts_customer_id',
                },
            },
            value: 1,
            operator: FilterOperator.EQUALS,
            focus: { kind: 'source', sourceId: 'a' },
        });

        expect(result).not.toBeNull();
        expect(targetIds(result!.filtersBySourceId.a)).toEqual([
            'customers_customer_id',
        ]);
        expect(targetIds(result!.filtersBySourceId.b)).toEqual([
            'orders_customer_id',
        ]);
        expect(targetIds(result!.filtersBySourceId.c)).toEqual([
            'accounts_customer_id',
        ]);
    });

    it('applies a source field only to its owning source', () => {
        const result = applyMergeQuickFilter({
            filtersBySourceId: { a: {}, subscriptions: {} },
            field,
            origin: {
                kind: 'source',
                sourceId: 'subscriptions',
                sourceFieldId: 'subscriptions_count',
            },
            value: 2,
            operator: FilterOperator.NOT_EQUALS,
            focus: { kind: 'source', sourceId: 'a' },
        });

        expect(result).not.toBeNull();
        expect(targetIds(result!.filtersBySourceId.a)).toEqual([]);
        expect(targetIds(result!.filtersBySourceId.subscriptions)).toEqual([
            'subscriptions_count',
        ]);
        expect(result!.focus).toEqual({
            kind: 'source',
            sourceId: 'subscriptions',
        });
    });

    it('does not offer a source-less table calculation filter', () => {
        expect(
            applyMergeQuickFilter({
                filtersBySourceId: { a: {}, b: {} },
                field,
                origin: { kind: 'tableCalculation' },
                focus: { kind: 'source', sourceId: 'a' },
            }),
        ).toBeNull();
    });
});
