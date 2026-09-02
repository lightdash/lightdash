import { describe, expect, it } from 'vitest';

type SearchFilters = {
    type?: string;
    verifiedOnly?: boolean;
};

/**
 * Mirrors how OmnibarFilters maps the Item type menu into SearchFilters when
 * Verified is selected — Verified is not a SearchItemType.
 */
function applyItemTypeSelection(
    filters: SearchFilters | undefined,
    selection: { kind: 'verified' } | { kind: 'type'; type: string },
): SearchFilters {
    if (selection.kind === 'verified') {
        return {
            ...filters,
            type: undefined,
            verifiedOnly: filters?.verifiedOnly === true ? undefined : true,
        };
    }
    return {
        ...filters,
        verifiedOnly: undefined,
        type: selection.type === filters?.type ? undefined : selection.type,
    };
}

describe('omnibar verified Item type filter', () => {
    it('sets verifiedOnly and clears type when Verified is selected', () => {
        expect(
            applyItemTypeSelection({ type: 'dashboard' }, { kind: 'verified' }),
        ).toEqual({ type: undefined, verifiedOnly: true });
    });

    it('clears verifiedOnly when selecting a concrete type', () => {
        expect(
            applyItemTypeSelection(
                { verifiedOnly: true },
                { kind: 'type', type: 'chart' },
            ),
        ).toEqual({ verifiedOnly: undefined, type: 'chart' });
    });

    it('toggles Verified off when selected again', () => {
        expect(
            applyItemTypeSelection(
                { verifiedOnly: true },
                { kind: 'verified' },
            ),
        ).toEqual({ type: undefined, verifiedOnly: undefined });
    });
});
