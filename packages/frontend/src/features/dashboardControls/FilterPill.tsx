import {
    isFilterLockedOnTab,
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import { Box, Text, Tooltip } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { memo, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import useTracking from '../../providers/Tracking/useTracking';
import {
    getFilterLockKey,
    getFilterLockLabel,
    getFilterLockToggle,
} from '../dashboardFilters/ActiveFilters/filterLock';
import { FilterPillButton } from '../dashboardFilters/ActiveFilters/FilterPillButton';
import { EditorPopover } from './FilterEditor';
import classes from './FilterPills.module.css';
import { replaceFilterRule } from './sidebarState';
import { useBarPill } from './useBarPill';
import { useControlsSidebarSelector } from './useControlsSidebar';
import { getFilterHoverTileUuids } from './useTileHover';

// An editor's pill, a viewer's on a saved filter, or a viewer's on a filter of
// their own (dashed, with an X)
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
    /** Edit mode: added in this session, not in the saved dashboard. */
    isDraft: boolean;
    /** While a filter is edited the grip and lock are hidden and inert. */
    isSidebarOpen: boolean;
    activeTabUuid: string | undefined;
    hasTabs: boolean;
    dashboardUuid: string | undefined;
    triggerClassName: string | undefined;
    /** Stable: the tile fields, read when the pill is hovered. */
    getFieldsByTile: () =>
        | Record<string, DashboardFilterableField[]>
        | undefined;
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
        triggerClassName,
        getFieldsByTile,
    }) => {
        const { track } = useTracking();
        const getUiString = useUiStrings();
        const open = useControlsSidebarSelector((c) => c.open);
        const removeFilterById = useControlsSidebarSelector(
            (c) => c.removeFilterById,
        );
        const moveFilter = useControlsSidebarSelector((c) => c.moveFilter);
        const setDashboardFilters = useDashboardContext(
            (c) => c.setDashboardFilters,
        );
        const setHaveFiltersChanged = useDashboardContext(
            (c) => c.setHaveFiltersChanged,
        );
        const isLocked = isFilterLockedOnTab(filter, activeTabUuid, hasTabs);
        // As the shipped view-mode pill: a locked saved filter opens nothing
        const isReadOnlyLocked = kind === 'viewerSaved' && isLocked;
        const {
            isSelectable,
            isPicked,
            selectHint,
            handleClick,
            handleKeyDown,
            tileHover,
            isOnAction,
            trackAction,
        } = useBarPill({
            id: filter.id,
            // The X, the lock and the required mark (`data-own-tooltip`)
            // have tooltips of their own
            pillSelector: '[data-controls-pill]',
            canSelect: kind === 'editor' && !isSidebarOpen,
            open: () => {
                if (!isReadOnlyLocked) open(filter.id);
            },
            // As a section's name: Alt with an arrow moves it one place
            // (the key handler is an editor's only)
            canMove: true,
            moveAlong: (direction) => moveFilter(filter.id, direction),
            isTileHoverEnabled: kind === 'editor' && !isSidebarOpen,
            getTileUuids: (state) =>
                getFilterHoverTileUuids(filter, state, getFieldsByTile()),
        });
        // Dashed pills say why first, in the tooltip the pill already has:
        // the select hint, else the tables one. The open pill has its editor
        const dashedNote =
            isSelected && isSidebarOpen
                ? null
                : kind === 'viewerOwn'
                  ? getUiString('controls.onlyYouSeeFilter')
                  : isDraft
                    ? 'Not saved yet'
                    : null;
        const tooltipLabel = isOrphaned ? (
            orphanedTooltip
        ) : !isSelectable ? null : dashedNote === null ? (
            selectHint
        ) : (
            <>
                <Text fz="xs">{dashedNote}</Text>
                <Text fz="xs">{selectHint}</Text>
            </>
        );
        const tablesTooltipNote =
            dashedNote !== null && (isOrphaned || !isSelectable)
                ? dashedNote
                : undefined;
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
            <EditorPopover isOpen={isSelected && isSidebarOpen}>
                <Tooltip
                    fz="xs"
                    maw={300}
                    disabled={tooltipLabel === null || isOnAction}
                    openDelay={isOrphaned ? 0 : 500}
                    label={tooltipLabel}
                >
                    <Box
                        className={classes.pill}
                        onPointerOver={trackAction}
                        onPointerLeave={trackAction}
                    >
                        <FilterPillButton
                            {...tileHover}
                            field={field}
                            filterRule={filter}
                            isOrphaned={isOrphaned}
                            isPlain
                            // Not saved for everyone: dashed
                            isTemporary={kind === 'viewerOwn' || isDraft}
                            // The pill itself drags (`PillDraggable`): no grip.
                            // While a filter is edited the lock stays in place,
                            // hidden and inert, so no pill changes width. The
                            // lock shows only on a locked filter
                            isDraggable={false}
                            isLocked={isLocked}
                            lockLabel={
                                kind === 'editor' && lockKey && isLocked
                                    ? getFilterLockLabel(isLocked, hasTabs)
                                    : null
                            }
                            areActionsHidden={isSidebarOpen}
                            onLockToggle={(e) => {
                                e.stopPropagation();
                                toggleLock();
                            }}
                            isLockSpaceReserved
                            readOnlyLockLabel={
                                isReadOnlyLocked
                                    ? getUiString(
                                          hasTabs
                                              ? 'filters.filterIsLockedOnTab'
                                              : 'filters.filterIsLocked',
                                      )
                                    : null
                            }
                            onRemove={
                                kind === 'viewerSaved'
                                    ? null
                                    : (e) => {
                                          e.stopPropagation();
                                          removeFilterById(filter.id);
                                      }
                            }
                            removeLabel={getUiString('controls.removeFilter')}
                            // One tooltip at a time: the hint takes the pill's
                            isTablesTooltipDisabled={isSelected || isSelectable}
                            tablesTooltipNote={tablesTooltipNote}
                            triggerClassName={triggerClassName}
                            aria-pressed={isSelected || isPicked}
                            data-controls-pill={filter.id}
                            data-open={isSelected || undefined}
                            disabled={isDisabled}
                            className={
                                isPicked ? classes.pickedPill : undefined
                            }
                            fieldIconOverride={
                                isPicked ? (
                                    <MantineIcon icon={IconCheck} size="sm" />
                                ) : undefined
                            }
                            onClick={handleClick}
                            onKeyDown={
                                kind === 'editor' ? handleKeyDown : undefined
                            }
                        />
                    </Box>
                </Tooltip>
            </EditorPopover>
        );
    },
);
FilterPill.displayName = 'FilterPill';
