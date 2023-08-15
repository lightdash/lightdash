import { FC } from 'react';
import useDashboardFiltersForExplore from '../../../hooks/dashboard/useDashboardFiltersForExplore';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import ValueCellMenu, { ValueCellMenuProps } from './ValueCellMenu';

type Props = ValueCellMenuProps & {
    tileUuid: string;
};

const DashboardValueCellMenu: FC<Props> = ({
    tileUuid,
    ...contextMenuProps
}) => {
    const { explore } = useVisualizationContext();

    const dashboardFiltersThatApplyToChart = useDashboardFiltersForExplore(
        tileUuid,
        explore,
    );

    return (
        <ValueCellMenu
            dashboardFilters={dashboardFiltersThatApplyToChart}
            {...contextMenuProps}
        />
    );
};

export default DashboardValueCellMenu;
