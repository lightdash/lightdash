import { describe, expect, it } from 'vitest';
import { getMergeFieldProvenance } from './getMergeFieldProvenance';

const labels = { a: 'Customers', b: 'Orders' };

describe('getMergeFieldProvenance', () => {
    it('names the owning query for a source field', () => {
        expect(
            getMergeFieldProvenance(
                {
                    kind: 'source',
                    sourceId: 'b',
                    sourceFieldId: 'orders_order_count',
                },
                labels,
            ),
        ).toBe('From Orders');
    });

    it('names both queries for a shared join key', () => {
        expect(
            getMergeFieldProvenance(
                {
                    kind: 'joinKey',
                    fieldIdBySourceId: {
                        a: 'customers_customer_id',
                        b: 'orders_customer_id',
                    },
                },
                labels,
            ),
        ).toBe('Shared join key: Customers ↔ Orders');
    });

    it('explains merged table calculations', () => {
        expect(
            getMergeFieldProvenance({ kind: 'tableCalculation' }, labels),
        ).toBe('Calculated after merging both queries');
    });
});
