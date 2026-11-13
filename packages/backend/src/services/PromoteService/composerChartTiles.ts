import {
    isDashboardComposerChartTile,
    NotSupportedError,
    type DashboardDAO,
} from '@lightdash/common';

// Promotion copies tiles by chart uuid; composer charts have no copy path yet.
export const assertDashboardIsPromotable = (
    dashboard: Pick<DashboardDAO, 'tiles'>,
) => {
    if (dashboard.tiles.some(isDashboardComposerChartTile)) {
        throw new NotSupportedError(
            'Dashboards with composer charts cannot be promoted yet',
        );
    }
};
