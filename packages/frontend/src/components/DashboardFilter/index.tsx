import {
    type DashboardFieldTarget,
    type DashboardFilterRule,
    type FilterableDimension,
    type FilterOperator,
} from '@lightdash/common';
import { Flex } from '@mantine/core';
import { useCallback, useState, type FC } from 'react';
import { useParams } from 'react-router';
import { useProject } from '../../hooks/useProject';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import FiltersProvider from '../common/Filters/FiltersProvider';
import ActiveFilters from './ActiveFilters';
import AddFilterButton from './AddFilterButton';

interface Props {
    isEditMode: boolean;
    activeTabUuid: string | undefined;
}

const DashboardFilter: FC<Props> = ({ isEditMode, activeTabUuid }) => {
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
        <FiltersProvider<Record<string, FilterableDimension>>
            projectUuid={projectUuid}
            itemsMap={allFilterableFieldsMap}
            startOfWeek={
                project.data?.warehouseConnection?.startOfWeek ?? undefined
            }
            dashboardFilters={allFilters}
        >
            <Flex gap="xs" wrap="wrap" mb="xs">
                <AddFilterButton
                    isEditMode={isEditMode}
                    openPopoverId={openPopoverId}
                    activeTabUuid={activeTabUuid}
                    onPopoverOpen={handlePopoverOpen}
                    onPopoverClose={handlePopoverClose}
                    onSave={handleSaveNew}
                />

                <ActiveFilters
                    isEditMode={isEditMode}
                    activeTabUuid={activeTabUuid}
                    openPopoverId={openPopoverId}
                    onPopoverOpen={handlePopoverOpen}
                    onPopoverClose={handlePopoverClose}
                    onResetDashboardFilters={resetDashboardFilters}
                />
            </Flex>
        </FiltersProvider>
    );
};

export default DashboardFilter;
