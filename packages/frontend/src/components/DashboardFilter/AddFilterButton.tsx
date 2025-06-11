import { type DashboardFilterRule } from '@lightdash/common';
import { Button, Popover, Text, Tooltip } from '@mantine/core';
import { useDisclosure, useId } from '@mantine/hooks';
import { IconFilter } from '@tabler/icons-react';
import { type FC, useCallback, useMemo } from 'react';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import MantineIcon from '../common/MantineIcon';
import FilterConfiguration from './FilterConfiguration';

type Props = {
    isEditMode: boolean;
    openPopoverId: string | undefined;
    activeTabUuid: string | undefined;
    onPopoverOpen: (popoverId: string) => void;
    onPopoverClose: () => void;
    onSave: (value: DashboardFilterRule) => void;
};

const AddFilterButton: FC<Props> = ({
    isEditMode,
    openPopoverId,
    activeTabUuid,
    onPopoverOpen,
    onPopoverClose,
    onSave,
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

    return (
        <>
            <Popover
                position="bottom-start"
                trapFocus
                opened={isPopoverOpen}
                closeOnEscape={!isSubPopoverOpen}
                closeOnClickOutside={!isSubPopoverOpen}
                onClose={handleClose}
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
                            leftIcon={
                                <MantineIcon color="blue" icon={IconFilter} />
                            }
                            disabled={disabled}
                            loading={
                                isLoadingDashboardFilters ||
                                isFetchingDashboardFilters
                            }
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
                            activeTabUuid={activeTabUuid}
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
        </>
    );
};

export default AddFilterButton;
