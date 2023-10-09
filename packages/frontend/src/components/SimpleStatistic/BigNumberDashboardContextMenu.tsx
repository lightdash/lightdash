import { FC } from 'react';
import useDashboardFiltersForExplore from '../../hooks/dashboard/useDashboardFiltersForExplore';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import BigNumberContextMenu, {
    BigNumberContextMenuProps,
} from './BigNumberContextMenu';

type Props = BigNumberContextMenuProps & {
    tileUuid: string;
};

const BigNumberDashboardContextMenu: FC<Props> = ({
    tileUuid,
    ...contextMenuProps
}) => {
    const { explore } = useVisualizationContext();

    const dashboardFiltersThatApplyToChart = useDashboardFiltersForExplore(
        tileUuid,
        explore,
    );

    return (
        <BigNumberContextMenu
            dashboardFilters={dashboardFiltersThatApplyToChart}
            {...contextMenuProps}
        />
    );
};

export default BigNumberDashboardContextMenu;
