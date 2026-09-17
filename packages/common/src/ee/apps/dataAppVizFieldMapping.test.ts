import { getDataAppVizFieldIds } from './dataAppVizFieldMapping';

describe('getDataAppVizFieldIds', () => {
    it('normalizes absent, scalar, and ordered multi-value bindings', () => {
        expect(getDataAppVizFieldIds(undefined)).toEqual([]);
        expect(getDataAppVizFieldIds('orders_total')).toEqual(['orders_total']);
        expect(
            getDataAppVizFieldIds([
                'orders_total',
                'orders_count',
                'orders_total',
            ]),
        ).toEqual(['orders_total', 'orders_count']);
    });
});
