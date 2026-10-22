import {
    isFilterLockedOnTab,
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import { Box, Tooltip } from '@mantine/core';
import { memo, type FC } from 'react';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import useTracking from '../../providers/Tracking/useTracking';
import {
    getFilterLockKey,
    getFilterLockLabel,
    getFilterLockToggle,
} from '../dashboardFilters/ActiveFilters/filterLock';
import { FilterPillButton } from '../dashboardFilters/ActiveFilters/FilterPillButton';
import classes from './FilterPills.module.css';
import { replaceFilterRule } from './sidebarState';
import { useControlsSidebarSelector } from './useControlsSidebar';

// An editor's pill, a viewer's pill on a saved filter (its value only) or on
// a filter of their own (outline, with an X)
export type FilterPillKind = 'editor' | 'viewerSaved' | 'viewerOwn';

type Props = {
    kind: FilterPillKind;
    filter: DashboardFilterRule;
    field: DashboardFilterableField | undefined;
    isOrphaned: boolean;
    orphanedTooltip: string;
    isSelected: boolean;
    /** Its fields are not loaded yet, so it opens no editor. */
    isDisabled: boolean;
    /** A new control that has no label yet. */
    isDraft: boolean;
    /** While open the pill is only a click target: no grip, lock or X. */
    isSidebarOpen: boolean;
    activeTabUuid: string | undefined;
    hasTabs: boolean;
    dashboardUuid: string | undefined;
};

export const FilterPill: FC<Props> = memo(
    ({
        kind,
        filter,
        field,
        isOrphaned,
        orphanedTooltip,
        isSelected,
        isDisabled,
        isDraft,
        isSidebarOpen,
        activeTabUuid,
        hasTabs,
        dashboardUuid,
    }) => {
        const { track } = useTracking();
        const open = useControlsSidebarSelector((c) => c.open);
        const close = useControlsSidebarSelector((c) => c.close);
        const removeFilterById = useControlsSidebarSelector(
            (c) => c.removeFilterById,
        );
        const setDashboardFilters = useDashboardContext(
            (c) => c.setDashboardFilters,
        );
        const setHaveFiltersChanged = useDashboardContext(
            (c) => c.setHaveFiltersChanged,
        );
        const isLocked = isFilterLockedOnTab(filter, activeTabUuid, hasTabs);
        const lockKey = getFilterLockKey({
            hasTabs,
            activeTabUuid,
            dashboardUuid,
        });

        const toggleLock = () => {
            const toggle = getFilterLockToggle(filter, {
                isLocked,
                hasTabs,
                activeTabUuid,
                dashboardUuid,
            });
            if (!toggle) return;
            track(toggle.event);
            setDashboardFilters((filters) =>
                replaceFilterRule(filters, toggle.filterRule),
            );
            setHaveFiltersChanged(true);
        };

        return (
            <Tooltip
                fz="xs"
                maw={300}
                disabled={!isOrphaned}
                label={orphanedTooltip}
            >
                <Box className={classes.pill}>
                    <FilterPillButton
                        field={field}
                        filterRule={filter}
                        isOrphaned={isOrphaned}
                        isTemporary={kind === 'viewerOwn'}
                        isDraggable={kind === 'editor' && !isSidebarOpen}
                        isLocked={isLocked}
                        lockLabel={
                            kind === 'editor' && !isSidebarOpen && lockKey
                                ? getFilterLockLabel(isLocked, hasTabs)
                                : null
                        }
                        onLockToggle={(e) => {
                            e.stopPropagation();
                            toggleLock();
                        }}
                        readOnlyLockLabel={null}
                        onRemove={
                            isSidebarOpen || kind === 'viewerSaved'
                                ? null
                                : (e) => {
                                      e.stopPropagation();
                                      removeFilterById(filter.id);
                                  }
                        }
                        removeLabel="Remove filter"
                        isTablesTooltipDisabled={isSelected}
                        aria-pressed={isSelected}
                        data-controls-pill={filter.id}
                        disabled={isDisabled}
                        className={[
                            isSelected ? classes.selectedPill : '',
                            isDraft ? classes.draftPill : '',
                        ]
                            .filter(Boolean)
                            .join(' ')}
                        onClick={() => (isSelected ? close() : open(filter.id))}
                    />
                </Box>
            </Tooltip>
        );
    },
);
FilterPill.displayName = 'FilterPill';
