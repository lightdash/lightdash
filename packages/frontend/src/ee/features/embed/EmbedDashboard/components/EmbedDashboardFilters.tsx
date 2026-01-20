import { Button, Flex, Tooltip } from '@mantine-8/core';
import { IconRotate2 } from '@tabler/icons-react';
import { useCallback, useState, type FC } from 'react';
import FiltersProvider from '../../../../../components/common/Filters/FiltersProvider';
import MantineIcon from '../../../../../components/common/MantineIcon';
import ActiveFilters from '../../../../../features/dashboardFilters/ActiveFilters';
import useDashboardContext from '../../../../../providers/Dashboard/useDashboardContext';

const EmbedDashboardFilters: FC = () => {
    const [openPopoverId, setPopoverId] = useState<string>();

    const projectUuid = useDashboardContext((c) => c.projectUuid);

    const haveFiltersChanged = useDashboardContext(
        (c) =>
            c.haveFiltersChanged ||
            c.dashboardTemporaryFilters.dimensions.length > 0,
    );
    const setHaveFiltersChanged = useDashboardContext(
        (c) => c.setHaveFiltersChanged,
    );

    const resetDashboardFilters = useDashboardContext(
        (c) => c.resetDashboardFilters,
    );

    const handlePopoverOpen = useCallback((id: string) => {
        setPopoverId(id);
    }, []);

    const handlePopoverClose = useCallback(() => {
        setPopoverId(undefined);
    }, []);

    const showResetFiltersButton = haveFiltersChanged;

    // FIXME fieldsWithSuggestions is required
    return (
        <FiltersProvider
            projectUuid={projectUuid}
            itemsMap={{}}
            startOfWeek={undefined}
        >
            <Flex gap="xs" wrap="wrap" w="100%" justify="flex-start">
                {showResetFiltersButton && (
                    // TODO: create a common component for this
                    <Tooltip label="Reset all filters" withinPortal>
                        <Button
                            aria-label="Reset all filters"
                            size="xs"
                            variant="default"
                            radius="md"
                            color="gray"
                            onClick={() => {
                                setHaveFiltersChanged(false);
                                resetDashboardFilters();
                            }}
                            styles={{
                                root: {
                                    borderLeft: '0px',
                                    borderStartStartRadius: '0px',
                                    borderEndStartRadius: '0px',
                                    borderStartEndRadius: '100px',
                                    borderEndEndRadius: '100px',
                                    borderStyle: 'dashed',
                                },
                            }}
                        >
                            <MantineIcon icon={IconRotate2} />
                        </Button>
                    </Tooltip>
                )}
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
