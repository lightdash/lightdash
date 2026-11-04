import { TableSelectionType } from '../types/api';
import { ExploreType } from '../types/explore';
import { isExploreIncludedInTableSelection } from './tableSelection';

describe('isExploreIncludedInTableSelection', () => {
    const orders = { name: 'orders', tags: ['finance'] };
    const customers = { name: 'customers', tags: [] as string[] };
    const untagged = { name: 'events' };
    const virtualView = {
        name: 'my_virtual_view',
        tags: [] as string[],
        type: ExploreType.VIRTUAL,
    };

    it('includes everything when selection is ALL', () => {
        const selection = { type: TableSelectionType.ALL, value: null };
        expect(isExploreIncludedInTableSelection(orders, selection)).toBe(true);
        expect(isExploreIncludedInTableSelection(untagged, selection)).toBe(
            true,
        );
    });

    it('filters by tag intersection for WITH_TAGS', () => {
        const selection = {
            type: TableSelectionType.WITH_TAGS,
            value: ['finance'],
        };
        expect(isExploreIncludedInTableSelection(orders, selection)).toBe(true);
        expect(isExploreIncludedInTableSelection(customers, selection)).toBe(
            false,
        );
        expect(isExploreIncludedInTableSelection(untagged, selection)).toBe(
            false,
        );
    });

    it('filters by name for WITH_NAMES', () => {
        const selection = {
            type: TableSelectionType.WITH_NAMES,
            value: ['customers'],
        };
        expect(isExploreIncludedInTableSelection(customers, selection)).toBe(
            true,
        );
        expect(isExploreIncludedInTableSelection(orders, selection)).toBe(
            false,
        );
    });

    it('always includes user-managed explores (virtual views, external sources)', () => {
        expect(
            isExploreIncludedInTableSelection(virtualView, {
                type: TableSelectionType.WITH_TAGS,
                value: ['finance'],
            }),
        ).toBe(true);
        expect(
            isExploreIncludedInTableSelection(virtualView, {
                type: TableSelectionType.WITH_NAMES,
                value: ['orders'],
            }),
        ).toBe(true);
    });

    it('treats a null selection value as matching nothing', () => {
        expect(
            isExploreIncludedInTableSelection(orders, {
                type: TableSelectionType.WITH_TAGS,
                value: null,
            }),
        ).toBe(false);
        expect(
            isExploreIncludedInTableSelection(orders, {
                type: TableSelectionType.WITH_NAMES,
                value: null,
            }),
        ).toBe(false);
    });
});
