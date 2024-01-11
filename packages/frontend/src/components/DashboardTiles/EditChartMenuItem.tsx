import { DashboardChartTile } from '@lightdash/common';
import { IconFilePencil } from '@tabler/icons-react';
import { FC } from 'react';
import { useParams } from 'react-router-dom';
import useDashboardStorage from '../../hooks/dashboard/useDashboardStorage';
import { useApp } from '../../providers/AppProvider';
import { useDashboardContext } from '../../providers/DashboardProvider';
import LinkMenuItem, { LinkMenuItemProps } from '../common/LinkMenuItem';
import MantineIcon from '../common/MantineIcon';

type Props = LinkMenuItemProps & {
    tile: DashboardChartTile;
};

const EditChartMenuItem: FC<Props> = ({ tile, ...props }) => {
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
            icon={<MantineIcon icon={IconFilePencil} />}
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
            {...props}
        >
            Edit chart
        </LinkMenuItem>
    );
};

export default EditChartMenuItem;
