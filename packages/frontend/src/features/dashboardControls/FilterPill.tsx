import {
    isFilterLockedOnTab,
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import { Box, Tooltip } from '@mantine/core';
import { useOs } from '@mantine/hooks';
import { memo, type FC } from 'react';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import useTracking from '../../providers/Tracking/useTracking';
import {
    getFilterLockKey,
    getFilterLockLabel,
    getFilterLockToggle,
} from '../dashboardFilters/ActiveFilters/filterLock';
import { FilterPillButton } from '../dashboardFilters/ActiveFilters/FilterPillButton';
import { useBarSelection } from './barSelection';
import classes from './FilterPills.module.css';
import { replaceFilterRule } from './sidebarState';
import { useControlsSidebarSelector } from './useControlsSidebar';

// An editor's pill, or a viewer's on a filter of their own (outline, with an X)
export type FilterPillKind = 'editor' | 'viewerOwn';

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
    /** Edit mode: the rule differs from the saved dashboard. */
    isChanged: boolean;
    /** While a filter is edited the pill has no grip or lock. */
    isSidebarOpen: boolean;
    activeTabUuid: string | undefined;
    hasTabs: boolean;
    dashboardUuid: string | undefined;
    triggerClassName: string | undefined;
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
        isChanged,
        isSidebarOpen,
        activeTabUuid,
        hasTabs,
        dashboardUuid,
        triggerClassName,
    }) => {
        const { track } = useTracking();
        const getUiString = useUiStrings();
        const open = useControlsSidebarSelector((c) => c.open);
        const removeFilterById = useControlsSidebarSelector(
            (c) => c.removeFilterById,
        );
        const setDashboardFilters = useDashboardContext(
            (c) => c.setDashboardFilters,
        );
        const setHaveFiltersChanged = useDashboardContext(
            (c) => c.setHaveFiltersChanged,
        );
        const selection = useBarSelection();
        const os = useOs();
        // On an editor's sectioned bar a modified click picks the pill
        const isSelectable =
            selection !== null && kind === 'editor' && !isSidebarOpen;
        const isPicked =
            isSelectable && selection.selectedIds.includes(filter.id);
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
                disabled={!isOrphaned && !isSelectable}
                openDelay={isOrphaned ? 0 : 500}
                label={
                    isOrphaned
                        ? orphanedTooltip
                        : `Click to edit · ${os === 'macos' ? '⌘' : 'Ctrl'} click to select`
                }
            >
                <Box
                    className={classes.pill}
                    // Capture, so a modified click never reaches the pill's open
                    onClickCapture={
                        isSelectable
                            ? (event) => {
                                  if (
                                      !(event.target instanceof Element) ||
                                      event.target
                                          .closest('button')
                                          ?.getAttribute(
                                              'data-controls-pill',
                                          ) !== filter.id
                                  )
                                      return;
                                  if (
                                      event.metaKey ||
                                      event.ctrlKey ||
                                      event.shiftKey
                                  ) {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      selection.pick(filter.id, event.shiftKey);
                                      return;
                                  }
                                  selection.clear();
                              }
                            : undefined
                    }
                >
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
                        onRemove={(e) => {
                            e.stopPropagation();
                            removeFilterById(filter.id);
                        }}
                        removeLabel={getUiString('filters.rail.removeFilter')}
                        // One tooltip at a time: the hint takes the pill's
                        isTablesTooltipDisabled={isSelected || isSelectable}
                        triggerClassName={triggerClassName}
                        aria-pressed={isSelected || isPicked}
                        data-controls-pill={filter.id}
                        disabled={isDisabled}
                        className={[
                            isSelected ? classes.selectedPill : '',
                            isDraft ? classes.draftPill : '',
                            isPicked ? classes.pickedPill : '',
                        ]
                            .filter(Boolean)
                            .join(' ')}
                        onClick={() => open(filter.id)}
                    />
                    {isChanged && (
                        <Box
                            component="span"
                            role="img"
                            aria-label="Changed"
                            className={classes.changedDot}
                        />
                    )}
                </Box>
            </Tooltip>
        );
    },
);
FilterPill.displayName = 'FilterPill';
