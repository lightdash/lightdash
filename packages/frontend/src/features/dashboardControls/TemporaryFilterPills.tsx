import { useCallback, useState, type FC } from 'react';
import FiltersProvider from '../../components/common/Filters/FiltersProvider';
import { useProject } from '../../hooks/useProject';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { TemporaryFilters } from '../dashboardFilters/ActiveFilters/TemporaryFilters';

type Props = {
    activeTabUuid: string | undefined;
};

// Rules added from a tile or the URL are never saved. The shipped pills show
// and edit them in their own popover, which needs the shipped provider
const TemporaryPills: FC<Props> = ({ activeTabUuid }) => {
    const projectUuid = useProjectUuid();
    const project = useProject(projectUuid);
    const [openPopoverId, setOpenPopoverId] = useState<string>();
    const closePopover = useCallback(() => setOpenPopoverId(undefined), []);

    const allFilters = useDashboardContext((c) => c.allFilters);
    const allFilterableFieldsMap = useDashboardContext(
        (c) => c.allFilterableFieldsMap,
    );
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const parameterValues = useDashboardContext((c) => c.parameterValues);
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );

    return (
        <FiltersProvider
            projectUuid={projectUuid}
            itemsMap={allFilterableFieldsMap}
            startOfWeek={
                project.data?.warehouseConnection?.startOfWeek ?? undefined
            }
            dashboardFilters={allFilters}
            dashboardTiles={dashboardTiles}
            filterableFieldsByTileUuid={filterableFieldsByTileUuid}
            activeTabUuid={activeTabUuid}
            parameterValues={parameterValues}
        >
            <TemporaryFilters
                isEditMode
                activeTabUuid={activeTabUuid}
                openPopoverId={openPopoverId}
                onPopoverOpen={setOpenPopoverId}
                onPopoverClose={closePopover}
            />
        </FiltersProvider>
    );
};

export const TemporaryFilterPills: FC<Props> = (props) => {
    const hasTemporaryFilters = useDashboardContext(
        (c) =>
            c.dashboardTemporaryFilters.dimensions.length > 0 ||
            c.dashboardTemporaryFilters.metrics.length > 0,
    );
    return hasTemporaryFilters ? <TemporaryPills {...props} /> : null;
};
