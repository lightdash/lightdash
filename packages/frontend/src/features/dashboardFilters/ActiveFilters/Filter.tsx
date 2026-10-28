import {
    applyDefaultTileTargets,
    isFilterLockedOnTab,
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import { Popover, Tooltip } from '@mantine/core';
import { useDisclosure, useId } from '@mantine/hooks';
import { useCallback, useMemo, type FC, type MouseEvent } from 'react';
import { useUiStrings } from '../../../ee/providers/Embed/useUiStrings';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import useTracking from '../../../providers/Tracking/useTracking';
import {
    selectActiveTab,
    selectDashboardTabs,
    selectDashboardTiles,
    useDashboardSelector,
} from '../../dashboard/store';
import FilterConfiguration from '../FilterConfiguration';
import { useFilterBarPopovers } from '../FilterRequirements/useFilterBarPopovers';
import { getFilterLockLabel, getFilterLockToggle } from './filterLock';
import { FilterPillButton } from './FilterPillButton';

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
    const dashboardTiles = useDashboardSelector(selectDashboardTiles);
    const dashboardTabs = useDashboardSelector(selectDashboardTabs);
    const activeTab = useDashboardSelector(selectActiveTab);
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
                        <FilterPillButton
                            field={field}
                            filterRule={filterRule}
                            isOrphaned={isOrphaned}
                            isTemporary={!!isTemporary}
                            isDraggable={isDraggable}
                            isLocked={isLocked}
                            lockLabel={
                                isEditMode &&
                                !isTemporary &&
                                (hasTabs ? activeTabUuid : !!dashboard?.uuid)
                                    ? getFilterLockLabel(isLocked, hasTabs)
                                    : null
                            }
                            onLockToggle={handleLockToggle}
                            readOnlyLockLabel={
                                !isEditMode && isLocked
                                    ? getUiString(
                                          hasTabs
                                              ? 'filters.filterIsLockedOnTab'
                                              : 'filters.filterIsLocked',
                                      )
                                    : null
                            }
                            onRemove={
                                isEditMode || isTemporary ? onRemove : null
                            }
                            isTablesTooltipDisabled={isPopoverOpen}
                            triggerClassName={triggerClassName}
                            onClick={() => {
                                if (isReadOnlyLocked) return;
                                if (isPopoverOpen) {
                                    handleClose();
                                } else {
                                    onPopoverOpen(popoverId);
                                }
                            }}
                        />
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
