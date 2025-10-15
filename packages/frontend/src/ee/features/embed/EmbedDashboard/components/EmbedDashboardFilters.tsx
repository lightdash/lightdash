import { type Dashboard } from '@lightdash/common';
import { Flex } from '@mantine/core';
import { useCallback, useEffect, useState, type FC } from 'react';
import ActiveFilters from '../../../../../components/DashboardFilter/ActiveFilters';
import FiltersProvider from '../../../../../components/common/Filters/FiltersProvider';
import useDashboardContext from '../../../../../providers/Dashboard/useDashboardContext';

type Props = {
    dashboardTiles: Dashboard['tiles'];
};

const EmbedDashboardFilters: FC<Props> = ({ dashboardTiles }) => {
    const [openPopoverId, setPopoverId] = useState<string>();

    const resetDashboardFilters = useDashboardContext(
        (c) => c.resetDashboardFilters,
    );

    const setDashboardTiles = useDashboardContext((c) => c.setDashboardTiles);
    const projectUuid = useDashboardContext((c) => c.projectUuid);

    useEffect(() => {
        setDashboardTiles(dashboardTiles);
    }, [setDashboardTiles, dashboardTiles]);

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
                    onResetDashboardFilters={resetDashboardFilters}
                />
            </Flex>
        </FiltersProvider>
    );
};

export default EmbedDashboardFilters;
