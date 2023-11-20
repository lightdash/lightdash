import {
    DashboardFieldTarget,
    DashboardFilterRule,
    FilterOperator,
} from '@lightdash/common';
import { Flex } from '@mantine/core';
import { FC } from 'react';
import { useParams } from 'react-router-dom';
import { useProject } from '../../hooks/useProject';
import { useDashboardContext } from '../../providers/DashboardProvider';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';
import { FiltersProvider } from '../common/Filters/FiltersProvider';
import ActiveFilters from './ActiveFilters';
import Filter from './Filter';

interface Props {
    isEditMode: boolean;
}

const DashboardFilter: FC<Props> = ({ isEditMode }) => {
    const { track } = useTracking();
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const project = useProject(projectUuid);

    const allFilters = useDashboardContext((c) => c.allFilters);
    const fieldsWithSuggestions = useDashboardContext(
        (c) => c.fieldsWithSuggestions,
    );
    const addDimensionDashboardFilter = useDashboardContext(
        (c) => c.addDimensionDashboardFilter,
    );
    const hasChartTiles = useDashboardContext((c) => c.hasChartTiles);

    const handleSaveNew = (
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
    };

    if (!hasChartTiles) return null;

    return (
        // TODO is this provider necessary?
        <FiltersProvider
            projectUuid={projectUuid}
            fieldsMap={fieldsWithSuggestions}
            startOfWeek={
                project.data?.warehouseConnection?.startOfWeek ?? undefined
            }
            dashboardFilters={allFilters}
        >
            <Flex gap={3} mb={8} ml={8} wrap="wrap">
                <Filter
                    isCreatingNew
                    isEditMode={isEditMode}
                    onSave={handleSaveNew}
                />

                <ActiveFilters isEditMode={isEditMode} />
            </Flex>
        </FiltersProvider>
    );
};

export default DashboardFilter;
