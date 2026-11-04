import { interpolateUiString, type UiStringResolver } from '@lightdash/common';

// "1 tile", "3 tiles": one registry key per English plural form
export const formatTileCount = (
    getUiString: UiStringResolver,
    count: number,
): string =>
    interpolateUiString(
        getUiString(
            count === 1
                ? 'filters.rail.tileCount.singular'
                : 'filters.rail.tileCount.plural',
        ),
        { count },
    );

// "2 of 5" and "tiles": the count and its noun, which the field bar sets apart
export const formatTilesOf = (
    getUiString: UiStringResolver,
    applied: number,
    total: number,
): { count: string; noun: string } => ({
    count: interpolateUiString(getUiString('filters.rail.countOf'), {
        applied,
        total,
    }),
    noun: getUiString(
        total === 1
            ? 'filters.fieldBar.tilesOf.singular'
            : 'filters.fieldBar.tilesOf.plural',
    ),
});

export const formatSectionCount = (
    getUiString: UiStringResolver,
    count: number,
): string =>
    interpolateUiString(
        getUiString(
            count === 1
                ? 'filters.rail.sectionCount.singular'
                : 'filters.rail.sectionCount.plural',
        ),
        { count },
    );
