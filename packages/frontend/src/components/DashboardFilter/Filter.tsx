import {
    applyDefaultTileTargets,
    DashboardFilterRule,
    FilterableField,
} from '@lightdash/common';
import { Button, CloseButton, Popover, Text, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconFilter } from '@tabler/icons-react';
import { FC, useCallback, useMemo } from 'react';
import { useDashboardContext } from '../../providers/DashboardProvider/useDashboardContext';
import {
    getConditionalRuleLabel,
    getFilterRuleTables,
} from '../common/Filters/FilterInputs';
import MantineIcon from '../common/MantineIcon';
import FilterConfiguration from './FilterConfiguration';

type Props = {
    isEditMode: boolean;
    isCreatingNew?: boolean;
    isTemporary?: boolean;
    field?: FilterableField;
    filterRule?: DashboardFilterRule;
    onSave?: (value: DashboardFilterRule) => void;
    onUpdate?: (filter: DashboardFilterRule) => void;
    onRemove?: () => void;
};

const Filter: FC<Props> = ({
    isEditMode,
    isCreatingNew,
    isTemporary,
    field,
    filterRule,
    onSave,
    onUpdate,
    onRemove,
}) => {
    const dashboard = useDashboardContext((c) => c.dashboard);
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const allFilterableFields = useDashboardContext(
        (c) => c.allFilterableFields,
    );
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const isLoadingDashboardFilters = useDashboardContext(
        (c) => c.isLoadingDashboardFilters,
    );
    const isFetchingDashboardFilters = useDashboardContext(
        (c) => c.isFetchingDashboardFilters,
    );

    const [isPopoverOpen, { close: closePopover, toggle: togglePopover }] =
        useDisclosure();
    const [isSubPopoverOpen, { close: closeSubPopover, open: openSubPopover }] =
        useDisclosure();

    const defaultFilterRule = useMemo(() => {
        if (!filterableFieldsByTileUuid || !field || !filterRule) return;

        return applyDefaultTileTargets(
            filterRule,
            field,
            filterableFieldsByTileUuid,
        );
    }, [filterableFieldsByTileUuid, field, filterRule]);

    // Only used by active filters
    const originalFilterRule = useMemo(() => {
        if (!dashboard || !filterRule) return;

        return dashboard.filters.dimensions.find(
            (item) => item.id === filterRule.id,
        );
    }, [dashboard, filterRule]);

    const filterRuleLabels = useMemo(() => {
        if (!filterRule || !field) return;

        return getConditionalRuleLabel(filterRule, field);
    }, [filterRule, field]);

    const filterRuleTables = useMemo(() => {
        if (!filterRule || !field || !allFilterableFields) return;

        return getFilterRuleTables(filterRule, field, allFilterableFields);
    }, [filterRule, field, allFilterableFields]);

    const handleClose = useCallback(() => {
        closeSubPopover();
        closePopover();
    }, [closeSubPopover, closePopover]);

    const handelSaveChanges = useCallback(
        (newRule: DashboardFilterRule) => {
            if (isCreatingNew && onSave) {
                onSave(newRule);
            } else if (onUpdate) {
                onUpdate(newRule);
            }
            handleClose();
        },
        [isCreatingNew, onSave, onUpdate, handleClose],
    );

    const isPopoverDisabled =
        !filterableFieldsByTileUuid || !allFilterableFields;

    return (
        <Popover
            position="bottom-start"
            trapFocus
            opened={isPopoverOpen}
            closeOnEscape={!isSubPopoverOpen}
            closeOnClickOutside={!isSubPopoverOpen}
            onClose={handleClose}
            disabled={isPopoverDisabled}
            transitionProps={{
                transition: 'pop',
            }}
            withArrow
            shadow="md"
            offset={1}
            arrowOffset={14}
        >
            <Popover.Target>
                {isCreatingNew ? (
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
                            disabled={!allFilterableFields}
                            loading={
                                isLoadingDashboardFilters ||
                                isFetchingDashboardFilters
                            }
                            onClick={togglePopover}
                        >
                            Add filter
                        </Button>
                    </Tooltip>
                ) : (
                    <Button
                        size="xs"
                        variant={isTemporary ? 'outline' : 'default'}
                        bg="white"
                        rightIcon={
                            (isEditMode || isTemporary) && (
                                <CloseButton size="sm" onClick={onRemove} />
                            )
                        }
                        styles={{
                            inner: {
                                color: 'black',
                            },
                        }}
                        onClick={togglePopover}
                    >
                        <Text fz="xs">
                            <Tooltip
                                withinPortal
                                position="top-start"
                                disabled={isPopoverOpen}
                                offset={8}
                                label={
                                    <Text fz="xs">
                                        {filterRuleTables?.length === 0 ? (
                                            <>
                                                Table:
                                                <Text span fw={600}>
                                                    {filterRuleTables[0]}
                                                </Text>
                                            </>
                                        ) : (
                                            <>
                                                Tables:{' '}
                                                <Text span fw={600}>
                                                    {filterRuleTables?.join(
                                                        ', ',
                                                    )}
                                                </Text>
                                            </>
                                        )}
                                    </Text>
                                }
                            >
                                <Text fw={600} span>
                                    {filterRule?.label ||
                                        filterRuleLabels?.field}{' '}
                                </Text>
                            </Tooltip>
                            <Text fw={400} span>
                                {filterRule?.disabled ? (
                                    <Text span color="gray.6">
                                        is any value
                                    </Text>
                                ) : (
                                    <>
                                        <Text span color="gray.7">
                                            {filterRuleLabels?.operator}{' '}
                                        </Text>
                                        <Text fw={700} span>
                                            {filterRuleLabels?.value}
                                        </Text>
                                    </>
                                )}
                            </Text>
                        </Text>
                    </Button>
                )}
            </Popover.Target>

            <Popover.Dropdown>
                {filterableFieldsByTileUuid && dashboardTiles && (
                    <FilterConfiguration
                        isCreatingNew={isCreatingNew}
                        isEditMode={isEditMode}
                        isTemporary={isTemporary}
                        field={field}
                        fields={allFilterableFields || []}
                        tiles={dashboardTiles}
                        originalFilterRule={originalFilterRule}
                        availableTileFilters={filterableFieldsByTileUuid}
                        defaultFilterRule={defaultFilterRule}
                        onSave={handelSaveChanges}
                        popoverProps={{
                            onOpen: openSubPopover,
                            onClose: closeSubPopover,
                        }}
                    />
                )}
            </Popover.Dropdown>
        </Popover>
    );
};

export default Filter;
