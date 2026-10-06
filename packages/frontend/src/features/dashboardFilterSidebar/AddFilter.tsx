import {
    getItemId,
    type DashboardFieldTarget,
    type DashboardFilterRule,
    type FilterOperator,
} from '@lightdash/common';
import { useCallback, useState, type FC } from 'react';
import FiltersProvider from '../../components/common/Filters/FiltersProvider';
import { useProject } from '../../hooks/useProject';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import AddFilterButton from '../dashboardFilters/AddFilterButton';

type Props = {
    activeTabUuid: string | undefined;
};

// Edit-mode copy of the shipped add-filter wiring in features/dashboardFilters.
export const AddFilter: FC<Props> = ({ activeTabUuid }) => {
    const { track } = useTracking();
    const projectUuid = useProjectUuid();
    const [openPopoverId, setPopoverId] = useState<string>();
    const project = useProject(projectUuid);
    const allFilters = useDashboardContext((c) => c.allFilters);
    const resetDashboardFilters = useDashboardContext(
        (c) => c.resetDashboardFilters,
    );
    const allFilterableFieldsMap = useDashboardContext(
        (c) => c.allFilterableFieldsMap,
    );
    const addDimensionDashboardFilter = useDashboardContext(
        (c) => c.addDimensionDashboardFilter,
    );
    const addMetricDashboardFilter = useDashboardContext(
        (c) => c.addMetricDashboardFilter,
    );
    const allFilterableMetrics = useDashboardContext(
        (c) => c.allFilterableMetrics,
    );
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const parameterValues = useDashboardContext((c) => c.parameterValues);
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );

    const handleSaveNew = useCallback(
        (
            value: DashboardFilterRule<
                FilterOperator,
                DashboardFieldTarget,
                any,
                any
            >,
        ) => {
            track({
                name: EventName.ADD_FILTER_CLICKED,
                properties: { mode: 'edit' },
            });
            const isMetricFilter = allFilterableMetrics?.some(
                (m) => getItemId(m) === value.target.fieldId,
            );
            if (isMetricFilter) {
                addMetricDashboardFilter(value, false);
            } else {
                addDimensionDashboardFilter(value, false);
            }
        },
        [
            addDimensionDashboardFilter,
            addMetricDashboardFilter,
            allFilterableMetrics,
            track,
        ],
    );

    const handlePopoverOpen = useCallback((id: string) => {
        setPopoverId(id);
    }, []);
    const handlePopoverClose = useCallback(() => {
        setPopoverId(undefined);
    }, []);

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
            <AddFilterButton
                isEditMode
                activeTabUuid={activeTabUuid}
                openPopoverId={openPopoverId}
                onPopoverOpen={handlePopoverOpen}
                onPopoverClose={handlePopoverClose}
                onSave={handleSaveNew}
                onResetDashboardFilters={resetDashboardFilters}
            />
        </FiltersProvider>
    );
};
