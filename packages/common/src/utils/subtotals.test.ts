import { getSubtotalDimensionGroups } from './subtotals';

describe('getSubtotalDimensionGroups', () => {
    it('builds one nesting prefix per dimension except the most detailed', () => {
        expect(
            getSubtotalDimensionGroups(
                ['product', 'store', 'category'],
                ['store', 'category', 'product', 'revenue'],
                [],
            ),
        ).toEqual([['store'], ['store', 'category']]);
    });

    it('leaves pivot dimensions out of the groups', () => {
        expect(
            getSubtotalDimensionGroups(
                ['store', 'category', 'product'],
                ['store', 'category', 'product'],
                ['category'],
            ),
        ).toEqual([['store']]);
    });

    it('returns no groups for a single dimension', () => {
        expect(getSubtotalDimensionGroups(['store'], ['store'], [])).toEqual(
            [],
        );
    });
});
