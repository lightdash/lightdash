import { resolveMergeColumnOrder } from './resolveMergeColumnOrder';

describe('resolveMergeColumnOrder', () => {
    it('keeps saved order, removes deselected fields, and appends new fields', () => {
        expect(
            resolveMergeColumnOrder(
                ['merge_month', 'orders_total', 'payments_count'],
                ['removed_field', 'payments_count', 'merge_month'],
            ),
        ).toEqual(['payments_count', 'merge_month', 'orders_total']);
    });

    it('uses query order before a merged order has been saved', () => {
        expect(
            resolveMergeColumnOrder(
                ['merge_month', 'orders_total'],
                ['orders_month', 'orders_total_unmerged'],
            ),
        ).toEqual(['merge_month', 'orders_total']);
    });

    it('deduplicates malformed saved order', () => {
        expect(
            resolveMergeColumnOrder(
                ['merge_month'],
                ['merge_month', 'merge_month'],
            ),
        ).toEqual(['merge_month']);
    });
});
