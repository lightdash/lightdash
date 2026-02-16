import { type DashboardChartTile } from '@lightdash/common';
import { IconFilePencil } from '@tabler/icons-react';
import { type FC } from 'react';
import { useParams } from 'react-router';
import useDashboardStorage from '../../hooks/dashboard/useDashboardStorage';
import useApp from '../../providers/App/useApp';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import LinkMenuItem, { type LinkMenuItemProps } from '../common/LinkMenuItem';
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
    const activeTab = useDashboardContext((c) => c.activeTab);
    const dashboardTabs = useDashboardContext((c) => c.dashboardTabs);

    const { storeDashboard } = useDashboardStorage();

    const { projectUuid, dashboardUuid } = useParams<{
        projectUuid: string;
        dashboardUuid: string;
    }>();

    const userCanManageExplore = user.data?.ability?.can('manage', 'Explore');

    if (!tile.properties.savedChartUuid || !userCanManageExplore) return null;

    return (
        <LinkMenuItem
            leftSection={<MantineIcon icon={IconFilePencil} />}
            onClick={() => {
                if (tile.properties.belongsToDashboard) {
                    storeDashboard(
                        dashboardTiles,
                        filtersFromContext,
                        haveTilesChanged,
                        haveFiltersChanged,
                        dashboard?.uuid,
                        dashboard?.name,
                        activeTab?.uuid,
                        dashboardTabs,
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
