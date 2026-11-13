import {
    isDashboardComposerChartTile,
    ParameterError,
    type DashboardComposerChartTile,
    type DashboardTile,
} from '@lightdash/common';

export const isNotComposerChartTile = (
    tile: DashboardTile,
): tile is Exclude<DashboardTile, DashboardComposerChartTile> =>
    !isDashboardComposerChartTile(tile);

// Upload replaces every tile, so it would delete composer tiles it cannot express.
export const assertNoComposerChartTilesToReplace = (
    slug: string,
    existingTiles: DashboardTile[],
) => {
    if (existingTiles.some(isDashboardComposerChartTile)) {
        throw new ParameterError(
            `Dashboard "${slug}" has composer chart tiles, which content as code does not support yet`,
        );
    }
};
