import {
    type DashboardFieldTarget,
    type DashboardFilterRule,
    type FilterOperator,
} from '@lightdash/common';
import { useCallback, useState, type FC } from 'react';
import { useParams } from 'react-router';
import FiltersProvider from '../../components/common/Filters/FiltersProvider';
import { useProject } from '../../hooks/useProject';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import ActiveFilters from './ActiveFilters';
import AddFilterButton from './AddFilterButton';

interface Props {
    isEditMode: boolean;
    activeTabUuid: string | undefined;
}

const DashboardFiltersV2: FC<Props> = ({ isEditMode, activeTabUuid }) => {
    const { track } = useTracking();
    const { projectUuid } = useParams<{ projectUuid: string }>();
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
                properties: {
                    mode: isEditMode ? 'edit' : 'viewer',
                },
            });
            addDimensionDashboardFilter(value, !isEditMode);
        },
        [addDimensionDashboardFilter, isEditMode, track],
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
        >
            <AddFilterButton
                isEditMode={isEditMode}
                openPopoverId={openPopoverId}
                onPopoverOpen={handlePopoverOpen}
                onPopoverClose={handlePopoverClose}
                onSave={handleSaveNew}
                onResetDashboardFilters={resetDashboardFilters}
            />

            <ActiveFilters
                isEditMode={isEditMode}
                activeTabUuid={activeTabUuid}
                openPopoverId={openPopoverId}
                onPopoverOpen={handlePopoverOpen}
                onPopoverClose={handlePopoverClose}
            />
        </FiltersProvider>
    );
};

export default DashboardFiltersV2;
