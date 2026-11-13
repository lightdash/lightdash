import { interpolateUiString, type UiStringResolver } from '@lightdash/common';

// "1 tile", "3 tiles": one registry key per English plural form
export const formatTileCount = (
    getUiString: UiStringResolver,
    count: number,
): string =>
    interpolateUiString(
        getUiString(
            count === 1
                ? 'controls.tileCount.singular'
                : 'controls.tileCount.plural',
        ),
        { count },
    );

// "2 of 5" and "tiles": the count and its noun, which the field bar sets apart
export const formatTilesOf = (
    getUiString: UiStringResolver,
    applied: number,
    total: number,
): { count: string; noun: string } => ({
    count: interpolateUiString(getUiString('controls.countOf'), {
        applied,
        total,
    }),
    noun: getUiString(
        total === 1
            ? 'filters.fieldBar.tilesOf.singular'
            : 'filters.fieldBar.tilesOf.plural',
    ),
});

/** "Applies to 2 of 5 tiles", "Applies to 5 tiles" for all of them, "Applies to no tiles". */
export const formatAppliesToTiles = (
    getUiString: UiStringResolver,
    applied: number,
    total: number,
): string => {
    if (applied === 0) return getUiString('controls.dateZoom.appliesToNoTiles');
    const tilesOf = formatTilesOf(getUiString, applied, total);
    return interpolateUiString(getUiString('controls.appliesTo'), {
        tiles:
            applied === total
                ? formatTileCount(getUiString, total)
                : `${tilesOf.count} ${tilesOf.noun}`,
    });
};

/** A section's members: "N filters", or "N controls" once parameter controls are among them. */
export const formatSectionCount = (
    getUiString: UiStringResolver,
    filterCount: number,
    parameterCount: number,
): string => {
    const count = filterCount + parameterCount;
    const keys =
        parameterCount > 0
            ? ([
                  'controls.sectionControlCount.singular',
                  'controls.sectionControlCount.plural',
              ] as const)
            : ([
                  'controls.sectionCount.singular',
                  'controls.sectionCount.plural',
              ] as const);
    return interpolateUiString(getUiString(count === 1 ? keys[0] : keys[1]), {
        count,
    });
};
