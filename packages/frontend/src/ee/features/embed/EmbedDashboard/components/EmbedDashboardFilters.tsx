import {
    FilterInteractivityValues,
    getFilterInteractivityValue,
    type Dashboard,
    type DashboardFilterInteractivityOptions,
    type DashboardFilters,
} from '@lightdash/common';
import { Flex } from '@mantine/core';
import { mapValues } from 'lodash';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import ActiveFilters from '../../../../../components/DashboardFilter/ActiveFilters';
import FiltersProvider from '../../../../../components/common/Filters/FiltersProvider';
import useDashboardContext from '../../../../../providers/Dashboard/useDashboardContext';

type Props = {
    dashboardFilters: DashboardFilters;
    dashboardTiles: Dashboard['tiles'];
    filterInteractivityOptions: DashboardFilterInteractivityOptions;
};

const EmbedDashboardFilters: FC<Props> = ({
    dashboardFilters,
    dashboardTiles,
    filterInteractivityOptions,
}) => {
    const [openPopoverId, setPopoverId] = useState<string>();

    const setDashboardFilters = useDashboardContext(
        (c) => c.setDashboardFilters,
    );

    const allowedFilters = useMemo(() => {
        const filterInteractivityValue = getFilterInteractivityValue(
            filterInteractivityOptions.enabled,
        );

        if (filterInteractivityValue === FilterInteractivityValues.all) {
            return dashboardFilters;
        }

        return mapValues(dashboardFilters, (filters) => {
            return filters.filter((filter) =>
                filterInteractivityOptions.allowedFilters?.includes(filter.id),
            );
        });
    }, [dashboardFilters, filterInteractivityOptions]);

    const setDashboardTiles = useDashboardContext((c) => c.setDashboardTiles);
    const projectUuid = useDashboardContext((c) => c.projectUuid);

    useEffect(() => {
        setDashboardFilters(allowedFilters);
        setDashboardTiles(dashboardTiles);
    }, [
        allowedFilters,
        setDashboardFilters,
        setDashboardTiles,
        dashboardTiles,
    ]);

    const handlePopoverOpen = useCallback((id: string) => {
        setPopoverId(id);
    }, []);

    const handlePopoverClose = useCallback(() => {
        setPopoverId(undefined);
    }, []);

    // FIXME fieldsWithSuggestions is required
    return (
        <FiltersProvider
            projectUuid={projectUuid}
            itemsMap={{}}
            startOfWeek={undefined}
        >
            <Flex gap="xs" wrap="wrap" w="100%" justify="flex-start">
                <ActiveFilters
                    isEditMode={false}
                    onPopoverOpen={handlePopoverOpen}
                    onPopoverClose={handlePopoverClose}
                    openPopoverId={openPopoverId}
                    activeTabUuid={undefined}
                />
            </Flex>
        </FiltersProvider>
    );
};

export default EmbedDashboardFilters;
