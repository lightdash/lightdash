import {
    type DashboardFieldTarget,
    type DashboardFilterRule,
    type FilterOperator,
} from '@lightdash/common';
import { Flex } from '@mantine/core';
import { useCallback, useState, type FC } from 'react';
import { useDashboardContext } from '../../providers/DashboardProvider';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';
import ActiveFilters from './ActiveFilters';
import Filter from './Filter';

interface Props {
    isEditMode: boolean;
    activeTabUuid: string | undefined;
}

const DashboardFilter: FC<Props> = ({ isEditMode, activeTabUuid }) => {
    const { track } = useTracking();
    const [openPopoverId, setPopoverId] = useState<string>();

    const addDimensionDashboardFilter = useDashboardContext(
        (c) => c.addDimensionDashboardFilter,
    );
    const hasChartTiles = useDashboardContext((c) => c.hasChartTiles);

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

    if (!hasChartTiles) return null;

    return (
        <Flex gap="xs" wrap="wrap" mb="xs">
            <Filter
                isCreatingNew
                isEditMode={isEditMode}
                openPopoverId={openPopoverId}
                activeTabUuid={activeTabUuid}
                onPopoverOpen={handlePopoverOpen}
                onPopoverClose={handlePopoverClose}
                onSave={handleSaveNew}
            />

            <ActiveFilters
                isEditMode={isEditMode}
                openPopoverId={openPopoverId}
                onPopoverOpen={handlePopoverOpen}
                onPopoverClose={handlePopoverClose}
            />
        </Flex>
    );
};

export default DashboardFilter;
