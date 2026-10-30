import {
    isFilterLockedOnTab,
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import { Box, Text, Tooltip } from '@mantine/core';
import { useOs } from '@mantine/hooks';
import { IconCheck } from '@tabler/icons-react';
import {
    memo,
    useContext,
    useState,
    type FC,
    type KeyboardEvent,
    type MouseEvent,
    type PointerEvent,
} from 'react';
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
import { useBarSelection } from './barSelection';
import { EditorPopover } from './FilterEditor';
import classes from './FilterPills.module.css';
import { PillDragHandleContext } from './pillDragHandle';
import { replaceFilterRule } from './sidebarState';
import { useControlsSidebarSelector } from './useControlsSidebar';
import { useTileHover } from './useTileHover';

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
        const selection = useBarSelection();
        const dragHandle = useContext(PillDragHandleContext);
        const os = useOs();
        // On an editor's sectioned bar a modified click picks the pill
        const isSelectable =
            selection !== null && kind === 'editor' && !isSidebarOpen;
        const isPicked =
            isSelectable && selection.selectedIds.includes(filter.id);
        const tileHover = useTileHover(
            filter,
            kind === 'editor' && !isSidebarOpen,
            getFieldsByTile,
        );
        // The lock and the X have tooltips of their own: the pill's waits meanwhile
        const [isOnAction, setIsOnAction] = useState(false);
        const trackAction = (event: PointerEvent<HTMLElement>) =>
            setIsOnAction(
                event.type === 'pointerover' &&
                    event.target instanceof Element &&
                    event.target.closest('button:not([data-controls-pill])') !==
                        null,
            );
        // Dashed pills say why first, in the tooltip the pill already has:
        // the select hint, else the tables one. The open pill has its editor
        const dashedNote =
            isSelected && isSidebarOpen
                ? null
                : kind === 'viewerOwn'
                  ? getUiString('filters.rail.onlyYouSeeFilter')
                  : isDraft
                    ? 'Not saved yet'
                    : null;
        const selectHint = `Click to edit · ${os === 'macos' ? '⌘' : 'Ctrl'} click to select`;
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
        const isLocked = isFilterLockedOnTab(filter, activeTabUuid, hasTabs);
        // As the shipped view-mode pill: a locked saved filter opens nothing
        const isReadOnlyLocked = kind === 'viewerSaved' && isLocked;
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

        // On an editor's sectioned bar a modified click picks the pill and a
        // plain one ends the selection before it opens the filter
        const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
            if (isReadOnlyLocked) return;
            if (isSelectable) {
                if (event.metaKey || event.ctrlKey || event.shiftKey) {
                    selection.pick(filter.id, event.shiftKey);
                    return;
                }
                selection.clear();
            }
            open(filter.id);
        };

        // As a section's name: Alt with an arrow moves it one place
        const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
            if (
                !event.altKey ||
                (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
            )
                return;
            event.preventDefault();
            moveFilter(filter.id, event.key === 'ArrowLeft' ? 'left' : 'right');
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
                            // While a filter is edited the grip and lock stay in
                            // place, hidden and inert, so no pill changes width.
                            // The lock shows only on a locked filter
                            isDraggable={kind === 'editor'}
                            dragHandle={dragHandle ?? undefined}
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
                            removeLabel={getUiString(
                                'filters.rail.removeFilter',
                            )}
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
