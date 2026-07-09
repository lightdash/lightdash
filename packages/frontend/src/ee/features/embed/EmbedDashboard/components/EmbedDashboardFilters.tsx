import { getItemId, type DashboardFilterRule } from '@lightdash/common';
import { Button, Flex, Tooltip } from '@mantine-8/core';
import { IconRotate2 } from '@tabler/icons-react';
import { useCallback, useState, type FC } from 'react';
import FiltersProvider from '../../../../../components/common/Filters/FiltersProvider';
import MantineIcon from '../../../../../components/common/MantineIcon';
import ActiveFilters from '../../../../../features/dashboardFilters/ActiveFilters';
import AddFilterButton from '../../../../../features/dashboardFilters/AddFilterButton';
import useDashboardContext from '../../../../../providers/Dashboard/useDashboardContext';
import useTracking from '../../../../../providers/Tracking/useTracking';
import { EventName } from '../../../../../types/Events';
import { embedContractClass } from '../../styles/embedClassContract';

type Props = {
    canAddFilters?: boolean;
};

const EmbedDashboardFilters: FC<Props> = ({ canAddFilters = false }) => {
    const { track } = useTracking();
    const [openPopoverId, setPopoverId] = useState<string>();

    const projectUuid = useDashboardContext((c) => c.projectUuid);
    const activeTab = useDashboardContext((c) => c.activeTab);
    const allFilters = useDashboardContext((c) => c.allFilters);
    const allFilterableFieldsMap = useDashboardContext(
        (c) => c.allFilterableFieldsMap,
    );
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
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

    const haveFiltersChanged = useDashboardContext(
        (c) =>
            c.haveFiltersChanged ||
            c.dashboardTemporaryFilters.dimensions.length > 0 ||
            c.dashboardTemporaryFilters.metrics.length > 0,
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

    const handleSaveNew = useCallback(
        (value: DashboardFilterRule) => {
            track({
                name: EventName.ADD_FILTER_CLICKED,
                properties: {
                    mode: 'embed',
                },
            });

            const isMetricFilter = allFilterableMetrics?.some(
                (m) => getItemId(m) === value.target.fieldId,
            );
            if (isMetricFilter) {
                addMetricDashboardFilter(value, true);
            } else {
                addDimensionDashboardFilter(value, true);
            }
        },
        [
            addDimensionDashboardFilter,
            addMetricDashboardFilter,
            allFilterableMetrics,
            track,
        ],
    );

    // AddFilterButton renders its own attached reset button once filters have
    // changed, so the standalone reset pill below would duplicate it.
    const showResetFiltersButton = !canAddFilters && haveFiltersChanged;

    return (
        <FiltersProvider
            projectUuid={projectUuid}
            itemsMap={allFilterableFieldsMap}
            startOfWeek={undefined}
            dashboardFilters={allFilters}
            dashboardTiles={dashboardTiles}
            filterableFieldsByTileUuid={filterableFieldsByTileUuid}
            activeTabUuid={activeTab?.uuid}
        >
            <Flex gap="xs" wrap="wrap" w="100%" justify="flex-start">
                {canAddFilters && (
                    <AddFilterButton
                        isEditMode={false}
                        activeTabUuid={activeTab?.uuid}
                        openPopoverId={openPopoverId}
                        onPopoverOpen={handlePopoverOpen}
                        onPopoverClose={handlePopoverClose}
                        onSave={handleSaveNew}
                        onResetDashboardFilters={resetDashboardFilters}
                        triggerClassName={embedContractClass(
                            'ld-dashboard-add-filter',
                        )}
                        dropdownClassName={embedContractClass(
                            'ld-dashboard-add-filter-dropdown',
                        )}
                        unsavedFiltersTooltip="Filters you add are not saved"
                    />
                )}
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
                    activeTabUuid={activeTab?.uuid}
                    triggerClassName={embedContractClass('ld-dashboard-filter')}
                    dropdownClassName={embedContractClass(
                        'ld-dashboard-filter-dropdown',
                    )}
                />
            </Flex>
        </FiltersProvider>
    );
};

export default EmbedDashboardFilters;
