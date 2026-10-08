import { DndContext, DragOverlay, type DragEndEvent } from '@dnd-kit/core';
import {
    getDashboardFilterField,
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import { useMemo, type FC } from 'react';
import {
    DraggableItem,
    DroppableArea,
} from '../../components/common/DndHelpers';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import { useDndSensors } from '../../hooks/useDndSensors';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import InvalidFilter from '../dashboardFilters/InvalidFilter';
import LockedFilter from '../dashboardFilters/LockedFilter';
import { useIsLockedDashboardFilterRule } from '../dashboardFilters/useIsLockedDashboardFilterRule';
import { FilterPill } from './FilterPill';
import {
    getFilterPillPlacement,
    moveFilterRule,
    type FilterPillGroup,
} from './pillState';
import { isPlaceholderRule } from './sidebarState';
import { TemporaryFilterPills } from './TemporaryFilterPills';
import { useControlsSidebarSelector } from './useControlsSidebar';

type Props = {
    activeTabUuid: string | undefined;
};

const GROUPS: FilterPillGroup[] = ['dimensions', 'metrics'];

export const FilterPills: FC<Props> = ({ activeTabUuid }) => {
    const getUiString = useUiStrings();
    const editingFilterId = useControlsSidebarSelector(
        (c) => c.editing?.filterId ?? null,
    );
    const isSidebarOpen = useControlsSidebarSelector((c) => c.isSidebarOpen);
    const isNew = useControlsSidebarSelector((c) => c.isNew);
    const removeFilterById = useControlsSidebarSelector(
        (c) => c.removeFilterById,
    );
    const dashboardUuid = useDashboardContext((c) => c.dashboard?.uuid);
    const setDashboardFilters = useDashboardContext(
        (c) => c.setDashboardFilters,
    );
    const setHaveFiltersChanged = useDashboardContext(
        (c) => c.setHaveFiltersChanged,
    );
    const dashboardFilters = useDashboardContext((c) => c.dashboardFilters);
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const dashboardTabs = useDashboardContext((c) => c.dashboardTabs);
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    // While fields load nothing resolves, which is not the same as invalid
    const areFieldsLoading = useDashboardContext(
        (c) => c.isLoadingDashboardFilters || c.isFetchingDashboardFilters,
    );
    const allFilterableFieldsMap = useDashboardContext(
        (c) => c.allFilterableFieldsMap,
    );
    const allFilterableMetricsMap = useDashboardContext(
        (c) => c.allFilterableMetricsMap,
    );
    const isHiddenFieldRule = useIsLockedDashboardFilterRule();
    const dragSensors = useDndSensors();

    const sortedTabUuids = useMemo(
        () =>
            [...dashboardTabs]
                .sort((a, b) => a.order - b.order)
                .map((tab) => tab.uuid),
        [dashboardTabs],
    );
    const hasTabs = dashboardTabs.length > 0;
    // Dashboards without tabs lock on the dashboard uuid
    const lockKey = hasTabs ? activeTabUuid : dashboardUuid;

    const handleDragEnd = (group: FilterPillGroup, event: DragEndEvent) => {
        const { active, over } = event;
        if (!active || !over || active.id === over.id) return;
        setDashboardFilters((filters) =>
            moveFilterRule(filters, group, String(active.id), String(over.id)),
        );
        setHaveFiltersChanged(true);
    };

    const renderPill = (
        filter: DashboardFilterRule,
        group: FilterPillGroup,
    ) => {
        const isSelected = editingFilterId === filter.id;
        const placement = getFilterPillPlacement(filter, {
            dashboardTiles,
            sortedTabUuids,
            filterableFieldsByTileUuid,
            activeTabUuid,
        });
        if (!placement.isOnActiveTab && !placement.isOnNoTab && !isSelected) {
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
            const Unresolved = isHiddenFieldRule(filter)
                ? LockedFilter
                : InvalidFilter;
            return (
                <Unresolved
                    isEditMode={!isSidebarOpen}
                    filterRule={filter}
                    onRemove={() => removeFilterById(filter.id)}
                />
            );
        }
        return (
            <FilterPill
                filter={filter}
                field={field}
                isOrphaned={placement.isOrphaned}
                orphanedTooltip={getUiString(placement.orphanedTooltipKey)}
                isSelected={isSelected}
                isDraft={isNew && isSelected && !filter.label}
                isSidebarOpen={isSidebarOpen}
                lockKey={lockKey}
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
                            const pill = renderPill(filter, group);
                            return (
                                pill && (
                                    <DroppableArea
                                        key={filter.id}
                                        id={filter.id}
                                        orderedKeys={orderedKeys}
                                    >
                                        <DraggableItem
                                            id={filter.id}
                                            disabled={isSidebarOpen}
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
            <TemporaryFilterPills
                activeTabUuid={activeTabUuid}
                sortedTabUuids={sortedTabUuids}
            />
        </>
    );
};
