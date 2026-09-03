import {
    canMutateVerifiedContent,
    type DashboardChartTile,
    type SavedChart,
} from '@lightdash/common';
import { Menu } from '@mantine/core';
import { IconFilePencil } from '@tabler/icons-react';
import { type FC } from 'react';
import useDashboardStorage from '../../hooks/dashboard/useDashboardStorage';
import { useProjectUrlIdentifier } from '../../hooks/useProjectRoute';
import useApp from '../../providers/App/useApp';
import { useDashboardChartEdit } from '../../providers/Dashboard/useDashboardChartEdit';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import LinkMenuItem, { type LinkMenuItemProps } from '../common/LinkMenuItem';
import MantineIcon from '../common/MantineIcon';

type Props = LinkMenuItemProps & {
    tile: DashboardChartTile;
    chartSlug?: string;
    /**
     * The loaded chart. Only supplied where the tile has one, which is what
     * makes editing in place possible instead of navigating.
     */
    chart?: SavedChart;
};

const EditChartMenuItem: FC<Props> = ({ tile, chartSlug, chart, ...props }) => {
    const { user } = useApp();
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const filtersFromContext = useDashboardContext((c) => c.dashboardFilters);
    const haveTilesChanged = useDashboardContext((c) => c.haveTilesChanged);
    const haveFiltersChanged = useDashboardContext((c) => c.haveFiltersChanged);
    const dashboard = useDashboardContext((c) => c.dashboard);
    const activeTab = useDashboardContext((c) => c.activeTab);
    const dashboardTabs = useDashboardContext((c) => c.dashboardTabs);

    const { storeDashboard } = useDashboardStorage();
    const onEditChart = useDashboardChartEdit();

    const projectUrlIdentifier = useProjectUrlIdentifier();

    const userCanManageExplore = user.data?.ability?.can('manage', 'Explore');

    // Otherwise the menu opens an editor that only fails on save.
    const userCanMutateThisChart =
        !chart ||
        !user.data ||
        canMutateVerifiedContent(
            user.data.ability,
            {
                organizationUuid: chart.organizationUuid,
                projectUuid: chart.projectUuid,
            },
            chart.verification,
            user.data.userUuid,
        );

    if (!tile.properties.savedChartUuid || !userCanManageExplore) return null;

    // Edit over the dashboard when the host offers it and the chart is loaded.
    if (onEditChart && chart && userCanMutateThisChart) {
        return (
            <Menu.Item
                leftSection={<MantineIcon icon={IconFilePencil} />}
                onClick={() => onEditChart(chart)}
                disabled={props.disabled}
            >
                Edit chart
            </Menu.Item>
        );
    }

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
                        dashboard?.slug,
                    );
                }
            }}
            href={`/projects/${projectUrlIdentifier}/saved/${chartSlug ?? tile.properties.savedChartUuid}/edit?fromDashboard=${dashboard?.uuid}`}
            {...props}
        >
            Edit chart
        </LinkMenuItem>
    );
};

export default EditChartMenuItem;
