import {
    applyDefaultTileTargets,
    isFilterLockedOnTab,
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import { ActionIcon, Button, Group, Popover, Tooltip } from '@mantine/core';
import { useDisclosure, useId } from '@mantine/hooks';
import {
    IconAsterisk,
    IconGripVertical,
    IconLock,
    IconLockOpen,
    IconX,
} from '@tabler/icons-react';
import { useCallback, useMemo, type FC, type MouseEvent } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useUiStrings } from '../../../ee/providers/Embed/useUiStrings';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import useTracking from '../../../providers/Tracking/useTracking';
import FilterConfiguration from '../FilterConfiguration';
import { useFilterBarPopovers } from '../FilterRequirements/useFilterBarPopovers';
import { useFilterChipRequirementState } from '../FilterRequirements/useFilterChipRequirementState';
import classes from './Filter.module.css';
import { showsComposedFilterValue } from './filterLabels';
import { getFilterLockLabel, getFilterLockToggle } from './filterLock';
import { FilterRuleLabel } from './FilterRuleLabel';
import { getTruncatedValuesDisplay } from './utils';

type Props = {
    isEditMode: boolean;
    isOrphaned: boolean;
    orphanedTooltip?: string;
    isTemporary?: boolean;
    field: DashboardFilterableField | undefined;
    filterRule: DashboardFilterRule;
    triggerClassName?: string;
    dropdownClassName?: string;
    openPopoverId: string | undefined;
    onPopoverOpen: (popoverId: string) => void;
    onPopoverClose: () => void;
    onUpdate: (filter: DashboardFilterRule) => void;
    onRemove: () => void;
};

const Filter: FC<Props> = ({
    isEditMode,
    isOrphaned,
    orphanedTooltip,
    isTemporary,
    field,
    filterRule,
    triggerClassName,
    dropdownClassName,
    openPopoverId,
    onPopoverOpen,
    onPopoverClose,
    onUpdate,
    onRemove,
}) => {
    const popoverId = useId();

    const dashboard = useDashboardContext((c) => c.dashboard);
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const dashboardTabs = useDashboardContext((c) => c.dashboardTabs);
    const activeTab = useDashboardContext((c) => c.activeTab);
    const activeTabUuid = activeTab?.uuid;
    const hasTabs = (dashboardTabs?.length ?? 0) > 0;
    const allFilterableFields = useDashboardContext(
        (c) => c.allFilterableFields,
    );
    const isLocked = isFilterLockedOnTab(filterRule, activeTabUuid, hasTabs);
    const { track } = useTracking();
    const handleLockToggle = useCallback(
        (e: MouseEvent) => {
            e.stopPropagation();
            const toggle = getFilterLockToggle(filterRule, {
                isLocked,
                hasTabs,
                activeTabUuid,
                dashboardUuid: dashboard?.uuid,
            });
            if (!toggle) return;
            track(toggle.event);
            onUpdate(toggle.filterRule);
        },
        [
            activeTabUuid,
            dashboard?.uuid,
            hasTabs,
            filterRule,
            isLocked,
            onUpdate,
            track,
        ],
    );
    const disabled = useMemo(() => {
        // Wait for fields to be loaded unless is SQL column
        return !allFilterableFields && !filterRule.target.isSqlColumn;
    }, [allFilterableFields, filterRule]);
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );

    const isPopoverOpen = openPopoverId === popoverId;

    const [isSubPopoverOpen, { close: closeSubPopover, open: openSubPopover }] =
        useDisclosure();

    const isDraggable = isEditMode && !isTemporary;

    const defaultFilterRule = useMemo(() => {
        if (filterableFieldsByTileUuid && field) {
            return applyDefaultTileTargets(
                filterRule,
                field,
                filterableFieldsByTileUuid,
            );
        } else {
            return filterRule;
        }
    }, [filterableFieldsByTileUuid, field, filterRule]);

    // Only used by active filters
    const originalFilterRule = useMemo(() => {
        if (!dashboard) return;

        return dashboard.filters.dimensions.find(
            (item) => item.id === filterRule.id,
        );
    }, [dashboard, filterRule]);

    const getUiString = useUiStrings();

    const showsComposedValue = useMemo(
        () =>
            showsComposedFilterValue(
                field?.type,
                filterRule.target.fallbackType,
            ),
        [field?.type, filterRule.target.fallbackType],
    );

    // Truncated values display - show max 2 values with "+N" badge
    const truncatedValuesDisplay = useMemo(
        () =>
            getTruncatedValuesDisplay(
                filterRule.values,
                showsComposedValue,
                filterRule.operator,
            ),
        [filterRule.values, filterRule.operator, showsComposedValue],
    );

    const { showRequirementIcon, isRequirementUnmet, requirementTooltip } =
        useFilterChipRequirementState(filterRule);

    const isReadOnlyLocked = isLocked && !isEditMode && !isTemporary;

    const handleClose = useCallback(() => {
        if (isPopoverOpen) onPopoverClose();
        closeSubPopover();
    }, [isPopoverOpen, onPopoverClose, closeSubPopover]);

    const handleSaveChanges = useCallback(
        (newRule: DashboardFilterRule) => {
            onUpdate(newRule);
            handleClose();
        },
        [onUpdate, handleClose],
    );

    const filterBarPopovers = useFilterBarPopovers();
    const handleEditRequirementRules = useMemo(() => {
        if (!filterBarPopovers) return undefined;
        return () => {
            handleClose();
            filterBarPopovers.openRulesPopover();
        };
    }, [filterBarPopovers, handleClose]);

    return (
        <>
            <Popover
                position="bottom-start"
                trapFocus
                opened={isPopoverOpen}
                closeOnEscape={!isSubPopoverOpen}
                closeOnClickOutside={!isSubPopoverOpen}
                onClose={handleClose}
                onDismiss={!isSubPopoverOpen ? handleClose : undefined}
                disabled={disabled || isReadOnlyLocked}
                transitionProps={{ transition: 'pop-top-left' }}
                withArrow
                offset={1}
                arrowOffset={14}
                classNames={{ dropdown: dropdownClassName }}
            >
                <Popover.Target>
                    <Tooltip
                        fz="xs"
                        label={
                            isReadOnlyLocked
                                ? 'Locked by the dashboard editor — switch to edit mode to change it'
                                : (orphanedTooltip ??
                                  getUiString('filters.notAppliedToAnyTiles'))
                        }
                        disabled={!isOrphaned && !isReadOnlyLocked}
                        maw={300}
                    >
                        <Button
                            data-dashboard-filter-control
                            pos="relative"
                            size="xs"
                            variant={isTemporary ? 'outline' : 'default'}
                            classNames={{
                                label: classes.label,
                                root: triggerClassName,
                            }}
                            className={`${classes.button} ${
                                isRequirementUnmet
                                    ? classes.requirementUnmet
                                    : ''
                            } ${isOrphaned ? classes.inactiveFilter : ''}`}
                            pr={truncatedValuesDisplay.hasMore ? 6 : undefined}
                            leftSection={
                                (isDraggable || showRequirementIcon) && (
                                    <Group gap={2} wrap="nowrap">
                                        {isDraggable && (
                                            <MantineIcon
                                                icon={IconGripVertical}
                                                cursor="grab"
                                                size="sm"
                                            />
                                        )}
                                        {showRequirementIcon && (
                                            <Tooltip
                                                fz="xs"
                                                label={requirementTooltip}
                                                disabled={!isRequirementUnmet}
                                            >
                                                <MantineIcon
                                                    icon={IconAsterisk}
                                                    size="sm"
                                                    color={
                                                        isRequirementUnmet
                                                            ? 'yellow.7'
                                                            : 'ldGray.6'
                                                    }
                                                />
                                            </Tooltip>
                                        )}
                                    </Group>
                                )
                            }
                            rightSection={
                                <Group gap={2} wrap="nowrap">
                                    {isEditMode &&
                                        !isTemporary &&
                                        (hasTabs
                                            ? activeTabUuid
                                            : !!dashboard?.uuid) && (
                                            <span
                                                className={
                                                    isLocked
                                                        ? classes.lockSlotActive
                                                        : classes.lockSlot
                                                }
                                            >
                                                <Tooltip
                                                    fz="xs"
                                                    label={getFilterLockLabel(
                                                        isLocked,
                                                        hasTabs,
                                                    )}
                                                >
                                                    <ActionIcon
                                                        onClick={
                                                            handleLockToggle
                                                        }
                                                        size="xs"
                                                        radius="xl"
                                                        aria-label={getFilterLockLabel(
                                                            isLocked,
                                                            hasTabs,
                                                        )}
                                                    >
                                                        <MantineIcon
                                                            size="sm"
                                                            icon={
                                                                isLocked
                                                                    ? IconLock
                                                                    : IconLockOpen
                                                            }
                                                        />
                                                    </ActionIcon>
                                                </Tooltip>
                                            </span>
                                        )}
                                    {!isEditMode && isLocked && (
                                        <span
                                            className={classes.lockSlotActive}
                                            aria-label={getUiString(
                                                hasTabs
                                                    ? 'filters.filterIsLockedOnTab'
                                                    : 'filters.filterIsLocked',
                                            )}
                                        >
                                            <MantineIcon
                                                size="sm"
                                                icon={IconLock}
                                                color="gray"
                                            />
                                        </span>
                                    )}
                                    {(isEditMode || isTemporary) && (
                                        <ActionIcon
                                            onClick={onRemove}
                                            size="xs"
                                            radius="xl"
                                        >
                                            <MantineIcon
                                                size="sm"
                                                icon={IconX}
                                            />
                                        </ActionIcon>
                                    )}
                                </Group>
                            }
                            onClick={() => {
                                if (isReadOnlyLocked) return;
                                if (isPopoverOpen) {
                                    handleClose();
                                } else {
                                    onPopoverOpen(popoverId);
                                }
                            }}
                        >
                            <FilterRuleLabel
                                filterRule={filterRule}
                                field={field}
                                truncatedValuesDisplay={truncatedValuesDisplay}
                                isTablesTooltipDisabled={isPopoverOpen}
                            />
                        </Button>
                    </Tooltip>
                </Popover.Target>

                <Popover.Dropdown>
                    {dashboardTiles && (
                        <FilterConfiguration
                            isCreatingNew={false}
                            isEditMode={isEditMode}
                            isTemporary={isTemporary}
                            field={field}
                            fields={allFilterableFields || []}
                            tiles={dashboardTiles}
                            tabs={dashboardTabs}
                            originalFilterRule={originalFilterRule}
                            availableTileFilters={
                                filterableFieldsByTileUuid ?? {}
                            }
                            defaultFilterRule={defaultFilterRule}
                            onSave={handleSaveChanges}
                            onEditRequirementRules={handleEditRequirementRules}
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

export default Filter;
