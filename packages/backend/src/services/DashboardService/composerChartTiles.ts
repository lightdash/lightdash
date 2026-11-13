import {
    isDashboardComposerChartTile,
    NotSupportedError,
    type DashboardDAO,
} from '@lightdash/common';

// A composer tile must name a chart its dashboard owns; duplicate has no chart copy yet.
export const assertDashboardIsDuplicable = (
    dashboard: Pick<DashboardDAO, 'tiles'>,
) => {
    if (dashboard.tiles.some(isDashboardComposerChartTile)) {
        throw new NotSupportedError(
            'Dashboards with composer charts cannot be duplicated yet',
        );
    }
};
