import { DndContext, DragOverlay, type DragEndEvent } from '@dnd-kit/core';
import {
    getDashboardFilterField,
    isFilterLockedOnTab,
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import { Fragment, type FC } from 'react';
import {
    DraggableItem,
    DroppableArea,
} from '../../components/common/DndHelpers';
import { useDndSensors } from '../../hooks/useDndSensors';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    selectDashboardFilters,
    selectDashboardTabs,
    useDashboardSelector,
    useDashboardTemporaryFilters,
} from '../dashboard/store';
import Filter from '../dashboardFilters/ActiveFilters/Filter';
import { moveFilterRule } from '../dashboardFilters/ActiveFilters/filterOrder';
import { UnresolvedFilter } from '../dashboardFilters/ActiveFilters/UnresolvedFilter';
import {
    isFilterHiddenOnTab,
    useFilterTabPlacement,
} from '../dashboardFilters/ActiveFilters/useFilterTabPlacement';
import { FilterPill, type FilterPillKind } from './FilterPill';
import { isPlaceholderRule } from './sidebarState';
import { TemporaryFilterPills } from './TemporaryFilterPills';
import { useControlsSidebarSelector } from './useControlsSidebar';

type Props = {
    activeTabUuid: string | undefined;
    /** An embed's class contract hook on each pill (default none). */
    triggerClassName?: string;
};

type FilterPillGroup = 'dimensions' | 'metrics';

const GROUPS: FilterPillGroup[] = ['dimensions', 'metrics'];

const noop = () => {};

export const FilterPills: FC<Props> = ({ activeTabUuid, triggerClassName }) => {
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
    const { getTabsUsingFilter, getOrphanedState } = useFilterTabPlacement();
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
        if (
            kind === 'viewerSaved' &&
            isFilterLockedOnTab(filter, activeTabUuid, hasTabs)
        ) {
            // The shipped read-only pill: no editor, the lock and its tooltip
            return (
                <Filter
                    isEditMode={false}
                    {...getOrphanedState(filter, appliesToTabs)}
                    field={field}
                    filterRule={filter}
                    openPopoverId={undefined}
                    onPopoverOpen={noop}
                    onPopoverClose={noop}
                    onUpdate={noop}
                    onRemove={noop}
                    triggerClassName={triggerClassName}
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
                isSidebarOpen={isSidebarOpen}
                activeTabUuid={activeTabUuid}
                hasTabs={hasTabs}
                dashboardUuid={dashboardUuid}
            />
        );
    };

    return (
        <>
            {GROUPS.map((group) => {
                const orderedKeys = dashboardFilters[group].map(
                    (rule) => rule.id,
                );
                return (
                    <DndContext
                        key={group}
                        sensors={dragSensors}
                        onDragEnd={(event) => handleDragEnd(group, event)}
                    >
                        {dashboardFilters[group].map((filter) => {
                            const pill = renderPill(
                                filter,
                                group,
                                isViewer ? 'viewerSaved' : 'editor',
                            );
                            return (
                                pill && (
                                    <DroppableArea
                                        key={filter.id}
                                        id={filter.id}
                                        orderedKeys={orderedKeys}
                                    >
                                        <DraggableItem
                                            id={filter.id}
                                            disabled={isSidebarOpen || isViewer}
                                        >
                                            {pill}
                                        </DraggableItem>
                                    </DroppableArea>
                                )
                            );
                        })}
                        <DragOverlay />
                    </DndContext>
                );
            })}
            {/* A viewer's own filters open in the rail too; in edit mode
                they keep the shipped popover */}
            {isViewer ? (
                GROUPS.flatMap((group) =>
                    temporaryFilters[group].map((filter) => {
                        const pill = renderPill(filter, group, 'viewerOwn');
                        return (
                            pill && <Fragment key={filter.id}>{pill}</Fragment>
                        );
                    }),
                )
            ) : (
                <TemporaryFilterPills activeTabUuid={activeTabUuid} />
            )}
        </>
    );
};
