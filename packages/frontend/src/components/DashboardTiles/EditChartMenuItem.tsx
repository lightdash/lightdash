import { DashboardChartTile } from '@lightdash/common';
import { useParams } from 'react-router-dom';
import useDashboardStorage from '../../hooks/dashboard/useDashboardStorage';
import { useApp } from '../../providers/AppProvider';
import { useDashboardContext } from '../../providers/DashboardProvider';
import LinkMenuItem from '../common/LinkMenuItem';

function EditChartMenuItem(props: {
    tile: DashboardChartTile;
    isEditMode: boolean;
}) {
    const { tile, isEditMode } = props;
    const { user } = useApp();
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const filtersFromContext = useDashboardContext((c) => c.dashboardFilters);
    const haveTilesChanged = useDashboardContext((c) => c.haveTilesChanged);
    const haveFiltersChanged = useDashboardContext((c) => c.haveFiltersChanged);
    const dashboard = useDashboardContext((c) => c.dashboard);

    const { storeDashboard } = useDashboardStorage();

    const { projectUuid, dashboardUuid } = useParams<{
        projectUuid: string;
        dashboardUuid: string;
    }>();

    const userCanManageExplore = user.data?.ability?.can('manage', 'Explore');

    if (!tile.properties.savedChartUuid || !userCanManageExplore) return null;

    return (
        <LinkMenuItem
            icon="document-open"
            text="Edit chart"
            disabled={isEditMode}
            onClick={() => {
                if (tile.properties.belongsToDashboard) {
                    storeDashboard(
                        dashboardTiles,
                        filtersFromContext,
                        haveTilesChanged,
                        haveFiltersChanged,
                        dashboard?.uuid,
                        dashboard?.name,
                    );
                }
            }}
            href={`/projects/${projectUuid}/saved/${tile.properties.savedChartUuid}/edit?fromDashboard=${dashboardUuid}`}
        />
    );
}

export default EditChartMenuItem;
