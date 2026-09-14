import { describe, expect, it } from 'vitest';
import { getMergeSourceFieldValues } from './useMergeSourceCell';

describe('getMergeSourceFieldValues', () => {
    it('rekeys owned fields and shared keys to their source ids', () => {
        const value = (raw: unknown) => ({ raw, formatted: String(raw) });
        const fieldValues = getMergeSourceFieldValues(
            {
                merge_join_key_0: {
                    kind: 'joinKey',
                    fieldIdBySourceId: {
                        a: 'customers_customer_id',
                        b: 'orders_customer_id',
                    },
                },
                b_orders_order_count: {
                    kind: 'source',
                    sourceId: 'b',
                    sourceFieldId: 'orders_order_count',
                },
                a_customers_name: {
                    kind: 'source',
                    sourceId: 'a',
                    sourceFieldId: 'customers_name',
                },
            },
            {
                merge_join_key_0: value(1),
                b_orders_order_count: value(2),
                a_customers_name: value('Ada'),
            },
            'b',
        );

        expect(fieldValues).toEqual({
            orders_customer_id: value(1),
            orders_order_count: value(2),
        });
    });
});
