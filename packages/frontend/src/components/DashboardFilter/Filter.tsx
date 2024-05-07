import {
    applyDefaultTileTargets,
    type DashboardFilterRule,
    type FilterableField,
} from '@lightdash/common';
import {
    Button,
    CloseButton,
    Indicator,
    Popover,
    Text,
    Tooltip,
} from '@mantine/core';
import { useDisclosure, useId } from '@mantine/hooks';
import { IconFilter } from '@tabler/icons-react';
import { useCallback, useMemo, type FC } from 'react';
import { useDashboardContext } from '../../providers/DashboardProvider';
import {
    getConditionalRuleLabel,
    getFilterRuleTables,
} from '../common/Filters/FilterInputs';
import MantineIcon from '../common/MantineIcon';
import FilterConfiguration from './FilterConfiguration';
import { hasFilterValueSet } from './FilterConfiguration/utils';

type Props = {
    isEditMode: boolean;
    isCreatingNew?: boolean;
    isTemporary?: boolean;
    field?: FilterableField;
    filterRule?: DashboardFilterRule;
    openPopoverId: string | undefined;
    activeTabUuid?: string | undefined;
    onPopoverOpen: (popoverId: string) => void;
    onPopoverClose: () => void;
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
    openPopoverId,
    activeTabUuid,
    onPopoverOpen,
    onPopoverClose,
    onSave,
    onUpdate,
    onRemove,
}) => {
    const popoverId = useId();

    const dashboard = useDashboardContext((c) => c.dashboard);
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const dashboardTabs = useDashboardContext((c) => c.dashboardTabs);
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

    const isPopoverOpen = openPopoverId === popoverId;

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
        if (isPopoverOpen) onPopoverClose();
        closeSubPopover();
    }, [isPopoverOpen, onPopoverClose, closeSubPopover]);

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
            transitionProps={{ transition: 'pop-top-left' }}
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
                            onClick={() =>
                                isPopoverOpen
                                    ? handleClose()
                                    : onPopoverOpen(popoverId)
                            }
                        >
                            Add filter
                        </Button>
                    </Tooltip>
                ) : (
                    <Indicator
                        inline
                        position="top-end"
                        size={16}
                        disabled={
                            !(
                                filterRule?.required &&
                                !hasFilterValueSet(filterRule)
                            )
                        }
                        label={
                            <Tooltip
                                fz="xs"
                                label="Set a value to run this dashboard"
                            >
                                <Text fz="9px" fw={500}>
                                    Required
                                </Text>
                            </Tooltip>
                        }
                        styles={(theme) => ({
                            common: {
                                top: -5,
                                right: 24,
                                borderRadius: theme.radius.xs,
                                borderBottomRightRadius: 0,
                                borderBottomLeftRadius: 0,
                            },
                        })}
                    >
                        <Button
                            pos="relative"
                            size="xs"
                            variant={
                                isTemporary ||
                                (filterRule?.required &&
                                    !hasFilterValueSet(filterRule))
                                    ? 'outline'
                                    : 'default'
                            }
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
                                root: {
                                    borderWidth:
                                        filterRule?.required &&
                                        !hasFilterValueSet(filterRule)
                                            ? 3
                                            : 'default',
                                },
                            }}
                            onClick={() =>
                                isPopoverOpen
                                    ? handleClose()
                                    : onPopoverOpen(popoverId)
                            }
                        >
                            <Text fz="xs">
                                <Tooltip
                                    withinPortal
                                    position="top-start"
                                    disabled={
                                        isPopoverOpen ||
                                        !filterRuleTables?.length
                                    }
                                    offset={8}
                                    label={
                                        <Text fz="xs">
                                            {filterRuleTables?.length === 1
                                                ? 'Table: '
                                                : 'Tables: '}
                                            <Text span fw={600}>
                                                {filterRuleTables?.join(', ')}
                                            </Text>
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
                    </Indicator>
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
                        tabs={dashboardTabs}
                        activeTabUuid={activeTabUuid}
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
