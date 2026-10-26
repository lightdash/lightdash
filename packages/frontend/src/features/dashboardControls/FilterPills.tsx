import {
    DndContext,
    DragOverlay,
    useDraggable,
    type DragEndEvent,
} from '@dnd-kit/core';
import {
    getDashboardFilterField,
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import { Box } from '@mantine/core';
import { Fragment, type FC, type ReactNode } from 'react';
import {
    DraggableItem,
    DroppableArea,
} from '../../components/common/DndHelpers';
import { useDndSensors } from '../../hooks/useDndSensors';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    selectControlSections,
    selectDashboardFilters,
    selectDashboardTabs,
    selectDashboardTiles,
    useDashboardSelector,
    useDashboardTemporaryFilters,
} from '../dashboard/store';
import { moveFilterRule } from '../dashboardFilters/ActiveFilters/filterOrder';
import { FilterPillSkeletons } from '../dashboardFilters/ActiveFilters/FilterPillSkeletons';
import { UnresolvedFilter } from '../dashboardFilters/ActiveFilters/UnresolvedFilter';
import {
    isFilterHiddenOnTab,
    useFilterTabPlacement,
} from '../dashboardFilters/ActiveFilters/useFilterTabPlacement';
import { FilterPill, type FilterPillKind } from './FilterPill';
import classes from './FilterPills.module.css';
import { withoutDefaultTileTargets } from './peers';
import { isRuleInSection } from './sections';
import { isFilterRuleDirty, isPlaceholderRule } from './sidebarState';
import { TemporaryFilterPills } from './TemporaryFilterPills';
import { useControlsSidebarSelector } from './useControlsSidebar';
import { ViewerSavedPills, type PillPopoverState } from './ViewerSavedPills';

type Props = {
    activeTabUuid: string | undefined;
    /**
     * `undefined` (default): every saved rule and the viewer's own, dragged
     * in this component's own contexts; `null`: the unsectioned saved rules
     * and the viewer's own; a string: that section's saved rules alone. A
     * `null` or string pass drags in the bar's one context (`SectionedFilters`).
     */
    sectionId?: string | null;
    /** A viewer's saved popover state, shared across the bar's passes (default: local) */
    popover?: PillPopoverState;
    /** An embed's class contract hook on each pill (default none). */
    triggerClassName?: string;
    /** An embed's class contract hook on a saved pill's popover (default none). */
    dropdownClassName?: string;
};

type FilterPillGroup = 'dimensions' | 'metrics';

const GROUPS: FilterPillGroup[] = ['dimensions', 'metrics'];

// A pill in the bar's one drag context: the overlay moves, the source fades
const BarDraggable: FC<{
    id: string;
    isDisabled: boolean;
    children: ReactNode;
}> = ({ id, isDisabled, children }) => {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id,
        disabled: isDisabled,
    });
    return (
        <Box
            ref={setNodeRef}
            className={classes.barDraggable}
            data-dragging={isDragging || undefined}
            {...listeners}
            {...attributes}
        >
            {children}
        </Box>
    );
};

export const FilterPills: FC<Props> = ({
    activeTabUuid,
    sectionId,
    popover,
    triggerClassName,
    dropdownClassName,
}) => {
    const editingFilterId = useControlsSidebarSelector(
        (c) => c.editing?.filterId ?? null,
    );
    const isSidebarOpen = useControlsSidebarSelector((c) => c.isSidebarOpen);
    const isNew = useControlsSidebarSelector((c) => c.isNew);
    const removeFilterById = useControlsSidebarSelector(
        (c) => c.removeFilterById,
    );
    const isViewer = useControlsSidebarSelector((c) => c.isViewer);
    const temporaryFilters = useDashboardTemporaryFilters();
    const dashboardUuid = useDashboardContext((c) => c.dashboard?.uuid);
    const setDashboardFilters = useDashboardContext(
        (c) => c.setDashboardFilters,
    );
    const setHaveFiltersChanged = useDashboardContext(
        (c) => c.setHaveFiltersChanged,
    );
    const dashboardFilters = useDashboardSelector(selectDashboardFilters);
    const sections = useDashboardSelector(selectControlSections);
    const hasTabs = useDashboardSelector(
        (state) => selectDashboardTabs(state).length > 0,
    );
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    // While fields load nothing resolves, which is not the same as invalid
    const areFieldsLoading = useDashboardContext(
        (c) => c.isLoadingDashboardFilters || c.isFetchingDashboardFilters,
    );
    // As the shipped pill: no editor until the fields exist
    const areFieldsLoaded = useDashboardContext(
        (c) => c.allFilterableFields !== undefined,
    );
    const allFilterableFieldsMap = useDashboardContext(
        (c) => c.allFilterableFieldsMap,
    );
    const allFilterableMetricsMap = useDashboardContext(
        (c) => c.allFilterableMetricsMap,
    );
    const savedFilters = useDashboardContext((c) => c.dashboard?.filters);
    const dashboardTiles = useDashboardSelector(selectDashboardTiles);
    const { getTabsUsingFilter, getOrphanedState } = useFilterTabPlacement();
    // What Save would keep: the rule differs from the saved dashboard
    const isChanged = (filter: DashboardFilterRule) =>
        savedFilters !== undefined &&
        isFilterRuleDirty(savedFilters, dashboardFilters, filter.id, (rule) =>
            withoutDefaultTileTargets(
                rule,
                dashboardTiles,
                filterableFieldsByTileUuid,
            ),
        );
    const dragSensors = useDndSensors();

    const handleDragEnd = (group: FilterPillGroup, event: DragEndEvent) => {
        const { active, over } = event;
        if (!active || !over || active.id === over.id) return;
        setDashboardFilters((filters) =>
            moveFilterRule(filters, group, active.id, over.id),
        );
        setHaveFiltersChanged(true);
    };

    const renderPill = (
        filter: DashboardFilterRule,
        group: FilterPillGroup,
        kind: FilterPillKind,
    ) => {
        const isSelected = editingFilterId === filter.id;
        const appliesToTabs = getTabsUsingFilter(filter);
        if (isFilterHiddenOnTab(appliesToTabs, activeTabUuid) && !isSelected) {
            return null;
        }
        const field = getDashboardFilterField<DashboardFilterableField>(
            group === 'metrics'
                ? allFilterableMetricsMap
                : allFilterableFieldsMap,
            filter,
            filterableFieldsByTileUuid,
        );
        const isUnresolved =
            !field &&
            !filter.target.isSqlColumn &&
            !isPlaceholderRule(filter) &&
            !areFieldsLoading;
        if (isUnresolved) {
            // The shipped pills for a deleted or hidden field: no editor
            return (
                <UnresolvedFilter
                    isEditMode={!isViewer && !isSidebarOpen}
                    filterRule={filter}
                    onRemove={() => removeFilterById(filter.id)}
                />
            );
        }
        return (
            <FilterPill
                kind={kind}
                triggerClassName={triggerClassName}
                filter={filter}
                field={field}
                {...getOrphanedState(filter, appliesToTabs)}
                isSelected={isSelected}
                isDisabled={!areFieldsLoaded && !filter.target.isSqlColumn}
                isDraft={isNew && isSelected && !filter.label}
                isChanged={kind === 'editor' && isChanged(filter)}
                isSidebarOpen={isSidebarOpen}
                activeTabUuid={activeTabUuid}
                hasTabs={hasTabs}
                dashboardUuid={dashboardUuid}
            />
        );
    };

    // The shipped view bar's placeholders while the filters load
    if (isViewer && areFieldsLoading) return <FilterPillSkeletons />;

    return (
        <>
            {/* A viewer's saved filters keep the shipped pills and popover */}
            {isViewer ? (
                <ViewerSavedPills
                    activeTabUuid={activeTabUuid}
                    triggerClassName={triggerClassName}
                    dropdownClassName={dropdownClassName}
                    sectionId={sectionId}
                    popover={popover}
                />
            ) : (
                GROUPS.map((group) => {
                    const orderedKeys = dashboardFilters[group].map(
                        (rule) => rule.id,
                    );
                    const pills = dashboardFilters[group].map((filter) => {
                        if (!isRuleInSection(filter, sectionId, sections))
                            return null;
                        const pill = renderPill(filter, group, 'editor');
                        return (
                            pill && (
                                <DroppableArea
                                    key={filter.id}
                                    id={filter.id}
                                    orderedKeys={orderedKeys}
                                >
                                    {sectionId === undefined ? (
                                        <DraggableItem
                                            id={filter.id}
                                            disabled={isSidebarOpen}
                                        >
                                            {pill}
                                        </DraggableItem>
                                    ) : (
                                        <BarDraggable
                                            id={filter.id}
                                            isDisabled={isSidebarOpen}
                                        >
                                            {pill}
                                        </BarDraggable>
                                    )}
                                </DroppableArea>
                            )
                        );
                    });
                    return sectionId === undefined ? (
                        <DndContext
                            key={group}
                            sensors={dragSensors}
                            onDragEnd={(event) => handleDragEnd(group, event)}
                        >
                            {pills}
                            <DragOverlay />
                        </DndContext>
                    ) : (
                        <Fragment key={group}>{pills}</Fragment>
                    );
                })
            )}
            {/* A viewer's own filters open in the rail too; in edit mode
                they keep the shipped popover. They are never in a section */}
            {isViewer
                ? typeof sectionId !== 'string' &&
                  GROUPS.flatMap((group) =>
                      temporaryFilters[group].map((filter) => {
                          const pill = renderPill(filter, group, 'viewerOwn');
                          return (
                              pill && (
                                  <Fragment key={filter.id}>{pill}</Fragment>
                              )
                          );
                      }),
                  )
                : typeof sectionId !== 'string' && (
                      <TemporaryFilterPills activeTabUuid={activeTabUuid} />
                  )}
        </>
    );
};
