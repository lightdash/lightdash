import { Flex } from '@mantine/core';
import { useCallback, useState, type FC } from 'react';
import ActiveFilters from '../../../../../components/DashboardFilter/ActiveFilters';
import FiltersProvider from '../../../../../components/common/Filters/FiltersProvider';
import useDashboardContext from '../../../../../providers/Dashboard/useDashboardContext';

const EmbedDashboardFilters: FC = () => {
    const [openPopoverId, setPopoverId] = useState<string>();

    const resetDashboardFilters = useDashboardContext(
        (c) => c.resetDashboardFilters,
    );

    const projectUuid = useDashboardContext((c) => c.projectUuid);

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
