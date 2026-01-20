import { type DashboardFilterRule } from '@lightdash/common';
import {
    Button,
    Divider,
    Group,
    Popover,
    Text,
    Tooltip,
} from '@mantine-8/core';
import { useDisclosure, useId } from '@mantine-8/hooks';
import { IconRotate2 } from '@tabler/icons-react';
import { type FC, useCallback, useMemo } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import FilterConfiguration from './FilterConfiguration';

type Props = {
    isEditMode: boolean;
    openPopoverId: string | undefined;
    onPopoverOpen: (popoverId: string) => void;
    onPopoverClose: () => void;
    onSave: (value: DashboardFilterRule) => void;
    onResetDashboardFilters: () => void;
};

const AddFilterButton: FC<Props> = ({
    isEditMode,
    openPopoverId,
    onPopoverOpen,
    onPopoverClose,
    onSave,
    onResetDashboardFilters,
}) => {
    const popoverId = useId();
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const dashboardTabs = useDashboardContext((c) => c.dashboardTabs);
    const allFilterableFields = useDashboardContext(
        (c) => c.allFilterableFields,
    );
    const sqlChartTilesMetadata = useDashboardContext(
        (c) => c.sqlChartTilesMetadata,
    );
    const disabled = useMemo(() => {
        return (
            !allFilterableFields &&
            Object.keys(sqlChartTilesMetadata).length === 0
        );
    }, [allFilterableFields, sqlChartTilesMetadata]);
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const isLoadingDashboardFilters = useDashboardContext(
        (c) => c.isLoadingDashboardFilters,
    );
    const isFetchingDashboardFilters = useDashboardContext(
        (c) => c.isFetchingDashboardFilters,
    );

    const haveFiltersChanged = useDashboardContext(
        (c) =>
            c.haveFiltersChanged ||
            c.dashboardTemporaryFilters.dimensions.length > 0,
    );

    const setHaveFiltersChanged = useDashboardContext(
        (c) => c.setHaveFiltersChanged,
    );

    const isPopoverOpen = openPopoverId === popoverId;

    const [isSubPopoverOpen, { close: closeSubPopover, open: openSubPopover }] =
        useDisclosure();

    const handleClose = useCallback(() => {
        if (isPopoverOpen) onPopoverClose();
        closeSubPopover();
    }, [isPopoverOpen, onPopoverClose, closeSubPopover]);

    const handleSaveChanges = useCallback(
        (newRule: DashboardFilterRule) => {
            onSave(newRule);
            handleClose();
        },
        [onSave, handleClose],
    );

    const showResetFiltersButton = !isEditMode && haveFiltersChanged;

    return (
        <Group gap={0}>
            <Popover
                position="bottom-start"
                trapFocus
                opened={isPopoverOpen}
                closeOnEscape={!isSubPopoverOpen}
                closeOnClickOutside={!isSubPopoverOpen}
                onClose={handleClose}
                onDismiss={!isSubPopoverOpen ? handleClose : undefined}
                disabled={disabled}
                transitionProps={{ transition: 'pop-top-left' }}
                withArrow
                shadow="md"
                offset={1}
                arrowOffset={14}
                withinPortal
            >
                <Popover.Target>
                    <Tooltip
                        disabled={isPopoverOpen || isEditMode}
                        position="top-start"
                        withinPortal
                        offset={0}
                        arrowOffset={16}
                        label={
                            <Text fz="xs">
                                Only filters added in{' '}
                                <Text span fw={600}>
                                    'edit'
                                </Text>{' '}
                                mode will be saved
                            </Text>
                        }
                    >
                        <Button
                            size="xs"
                            variant="default"
                            radius="md"
                            disabled={disabled}
                            loading={
                                isLoadingDashboardFilters ||
                                isFetchingDashboardFilters
                            }
                            styles={{
                                root: {
                                    borderStyle: 'dashed',
                                    borderRadius: '100px',
                                    ...(showResetFiltersButton
                                        ? {
                                              borderRightWidth: '0px',
                                              borderTopRightRadius: '0px',
                                              borderBottomRightRadius: '0px',
                                          }
                                        : {
                                              borderRightStyle: 'dashed',
                                              borderRightWidth: '1px',
                                              borderTopRightRadius: '100px',
                                              borderBottomRightRadius: '100px',
                                          }),
                                },
                            }}
                            onClick={() =>
                                isPopoverOpen
                                    ? handleClose()
                                    : onPopoverOpen(popoverId)
                            }
                        >
                            Add filter
                        </Button>
                    </Tooltip>
                </Popover.Target>

                <Popover.Dropdown>
                    {dashboardTiles && (
                        <FilterConfiguration
                            isCreatingNew={true}
                            isEditMode={isEditMode}
                            fields={allFilterableFields || []}
                            tiles={dashboardTiles}
                            tabs={dashboardTabs}
                            availableTileFilters={
                                filterableFieldsByTileUuid ?? {}
                            }
                            onSave={handleSaveChanges}
                            popoverProps={{
                                onOpen: openSubPopover,
                                onClose: closeSubPopover,
                            }}
                        />
                    )}
                </Popover.Dropdown>
            </Popover>

            {showResetFiltersButton && (
                <>
                    <Divider orientation="vertical" />

                    <Tooltip label="Reset all filters" withinPortal>
                        <Button
                            aria-label="Reset all filters"
                            size="xs"
                            variant="default"
                            radius="md"
                            color="gray"
                            onClick={() => {
                                setHaveFiltersChanged(false);
                                onResetDashboardFilters();
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
                </>
            )}
        </Group>
    );
};

export default AddFilterButton;
