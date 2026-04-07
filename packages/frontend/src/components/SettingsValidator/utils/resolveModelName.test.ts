import { resolveModelNameFromField } from './resolveModelName';

describe('resolveModelNameFromField', () => {
    const exploreNames = [
        'orders',
        'orders_status_history',
        'orders_line_items',
    ];

    /**
     * PROD-5676: When the chart's base table ("orders") is a prefix of the
     * actual model ("orders_status_history"), the function must return the
     * specific model — not the base table.
     */
    test('should resolve the specific model, not the base table prefix', () => {
        expect(
            resolveModelNameFromField(
                'orders_status_history_created_at',
                'orders',
                exploreNames,
            ),
        ).toBe('orders_status_history');
    });

    test('should not match unrelated models that share a prefix', () => {
        expect(
            resolveModelNameFromField(
                'orders_line_items_quantity',
                'orders',
                exploreNames,
            ),
        ).toBe('orders_line_items');
    });

    test('should resolve base table fields correctly', () => {
        expect(
            resolveModelNameFromField('orders_status', 'orders', exploreNames),
        ).toBe('orders');
    });

    test('should resolve a joined model when base table is unrelated', () => {
        expect(
            resolveModelNameFromField('payments_created_at', 'customers', [
                'customers',
                'payments',
            ]),
        ).toBe('payments');
    });

    test('should return empty string when fieldName is empty', () => {
        expect(resolveModelNameFromField('', 'orders', exploreNames)).toBe('');
    });

    test('should fall back to base table when explores are not loaded yet', () => {
        expect(
            resolveModelNameFromField('orders_status', 'orders', undefined),
        ).toBe('orders');
    });
});
