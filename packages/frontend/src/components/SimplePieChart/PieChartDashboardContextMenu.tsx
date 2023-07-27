import { FC } from 'react';
import useDashboardFiltersForExplore from '../../hooks/dashboard/useDashboardFiltersForExplore';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import PieChartContextMenu, {
    PieChartContextMenuProps,
} from './PieChartContextMenu';

type Props = PieChartContextMenuProps & {
    tileUuid: string;
};

const PieChartsDashboardContextMenu: FC<Props> = ({
    tileUuid,
    ...contextMenuProps
}) => {
    const { explore } = useVisualizationContext();

    const dashboardFiltersThatApplyToChart = useDashboardFiltersForExplore(
        tileUuid,
        explore,
    );

    return (
        <PieChartContextMenu
            dashboardFilters={dashboardFiltersThatApplyToChart}
            {...contextMenuProps}
        />
    );
};

export default PieChartsDashboardContextMenu;
