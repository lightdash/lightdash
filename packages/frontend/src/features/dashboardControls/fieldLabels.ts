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

export const formatFieldCount = (
    getUiString: UiStringResolver,
    count: number,
): string =>
    interpolateUiString(
        getUiString(
            count === 1
                ? 'filters.rail.fieldCount.singular'
                : 'filters.rail.fieldCount.plural',
        ),
        { count },
    );
