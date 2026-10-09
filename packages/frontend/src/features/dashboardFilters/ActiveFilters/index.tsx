import {
    DndContext,
    DragOverlay,
    MouseSensor,
    TouchSensor,
    useDraggable,
    useDroppable,
    useSensor,
    useSensors,
    type DragEndEvent,
    type DragStartEvent,
} from '@dnd-kit/core';
import { getDashboardFilterField } from '@lightdash/common';
import { Group, Skeleton, useMantineTheme } from '@mantine/core';
import { useMemo, type FC, type ReactNode } from 'react';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import Filter from './Filter';
import { moveFilterRule } from './filterOrder';
import { TemporaryFilters } from './TemporaryFilters';
import { UnresolvedFilter } from './UnresolvedFilter';
import {
    isFilterHiddenOnTab,
    useFilterTabPlacement,
} from './useFilterTabPlacement';

interface ActiveFiltersProps {
    isEditMode: boolean;
    activeTabUuid: string | undefined;
    openPopoverId: string | undefined;
    onPopoverOpen: (popoverId: string) => void;
    onPopoverClose: () => void;
    triggerClassName?: string;
    dropdownClassName?: string;
}

const DraggableItem: FC<{
    id: string;
    children: ReactNode;
    disabled?: boolean;
}> = ({ id, children, disabled }) => {
    const { attributes, listeners, setNodeRef, transform } = useDraggable({
        id,
        disabled,
    });

    const style = transform
        ? ({
              position: 'relative',
              zIndex: 1,
              transform: `translate(${transform.x}px, ${transform.y}px)`,
              opacity: 0.8,
          } as const)
        : undefined;

    return (
        <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
            {children}
        </div>
    );
};

const DroppableArea: FC<{ id: string; children: ReactNode }> = ({
    id,
    children,
}) => {
    const { active, isOver, over, setNodeRef } = useDroppable({ id });
    const dashboardFilters = useDashboardContext((c) => c.dashboardFilters);
    const { colors } = useMantineTheme();

    const placeholderStyle = useMemo(() => {
        if (isOver && active && over && active.id !== over.id) {
            const oldIndex = dashboardFilters.dimensions.findIndex(
                (item) => item.id === active.id,
            );
            const newIndex = dashboardFilters.dimensions.findIndex(
                (item) => item.id === over.id,
            );
            if (newIndex < oldIndex) {
                return { boxShadow: `-8px 0px ${colors.blue[4]}` };
            } else if (newIndex > oldIndex) {
                return { boxShadow: `8px 0px ${colors.blue[4]}` };
            }
        }
    }, [isOver, active, over, dashboardFilters.dimensions, colors]);

    return (
        <div ref={setNodeRef} style={placeholderStyle}>
            {children}
        </div>
    );
};

const ActiveFilters: FC<ActiveFiltersProps> = ({
    isEditMode,
    activeTabUuid,
    openPopoverId,
    onPopoverOpen,
    onPopoverClose,
    triggerClassName,
    dropdownClassName,
}) => {
    const dashboardFilters = useDashboardContext((c) => c.dashboardFilters);
    const allFilterableFieldsMap = useDashboardContext(
        (c) => c.allFilterableFieldsMap,
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
    const removeDimensionDashboardFilter = useDashboardContext(
        (c) => c.removeDimensionDashboardFilter,
    );
    const updateDimensionDashboardFilter = useDashboardContext(
        (c) => c.updateDimensionDashboardFilter,
    );
    const removeMetricDashboardFilter = useDashboardContext(
        (c) => c.removeMetricDashboardFilter,
    );
    const updateMetricDashboardFilter = useDashboardContext(
        (c) => c.updateMetricDashboardFilter,
    );
    const allFilterableMetricsMap = useDashboardContext(
        (c) => c.allFilterableMetricsMap,
    );
    const setDashboardFilters = useDashboardContext(
        (c) => c.setDashboardFilters,
    );
    const setHaveFiltersChanged = useDashboardContext(
        (c) => c.setHaveFiltersChanged,
    );

    const mouseSensor = useSensor(MouseSensor, {
        activationConstraint: { distance: 10 },
    });
    const touchSensor = useSensor(TouchSensor, {
        activationConstraint: { delay: 250, tolerance: 5 },
    });
    const dragSensors = useSensors(mouseSensor, touchSensor);

    const { getTabsUsingFilter, getOrphanedState } = useFilterTabPlacement();

    if (isLoadingDashboardFilters || isFetchingDashboardFilters) {
        return (
            <Group gap="xs" ml="xs">
                <Skeleton h={30} w={100} radius={4} />
                <Skeleton h={30} w={100} radius={4} />
                <Skeleton h={30} w={100} radius={4} />
                <Skeleton h={30} w={100} radius={4} />
                <Skeleton h={30} w={100} radius={4} />
            </Group>
        );
    }

    if (!allFilterableFieldsMap) return null;

    const handleDragStart = (_event: DragStartEvent) => onPopoverClose();

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!active || !over || active.id === over.id) return;
        setDashboardFilters(
            moveFilterRule(dashboardFilters, 'dimensions', active.id, over.id),
        );
        setHaveFiltersChanged(true);
    };

    const handleMetricDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!active || !over || active.id === over.id) return;
        setDashboardFilters(
            moveFilterRule(dashboardFilters, 'metrics', active.id, over.id),
        );
        setHaveFiltersChanged(true);
    };

    return (
        <>
            <DndContext
                sensors={dragSensors}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
            >
                {dashboardFilters.dimensions.map((item, index) => {
                    const field = getDashboardFilterField(
                        allFilterableFieldsMap,
                        item,
                        filterableFieldsByTileUuid,
                    );
                    const appliesToTabs = getTabsUsingFilter(item);

                    if (isFilterHiddenOnTab(appliesToTabs, activeTabUuid)) {
                        return null;
                    }

                    return (
                        <DroppableArea key={item.id} id={item.id}>
                            <DraggableItem
                                key={item.id}
                                id={item.id}
                                disabled={!isEditMode || !!openPopoverId}
                            >
                                {field || item.target.isSqlColumn ? (
                                    <Filter
                                        key={item.id}
                                        isEditMode={isEditMode}
                                        {...getOrphanedState(
                                            item,
                                            appliesToTabs,
                                        )}
                                        field={field}
                                        filterRule={item}
                                        triggerClassName={triggerClassName}
                                        dropdownClassName={dropdownClassName}
                                        openPopoverId={openPopoverId}
                                        onPopoverOpen={onPopoverOpen}
                                        onPopoverClose={onPopoverClose}
                                        onRemove={() =>
                                            removeDimensionDashboardFilter(
                                                index,
                                                false,
                                            )
                                        }
                                        onUpdate={(value) =>
                                            updateDimensionDashboardFilter(
                                                value,
                                                index,
                                                false,
                                                isEditMode,
                                            )
                                        }
                                    />
                                ) : (
                                    <UnresolvedFilter
                                        key={item.id}
                                        isEditMode={isEditMode}
                                        filterRule={item}
                                        onRemove={() =>
                                            removeDimensionDashboardFilter(
                                                index,
                                                false,
                                            )
                                        }
                                    />
                                )}
                            </DraggableItem>
                        </DroppableArea>
                    );
                })}
                <DragOverlay />
            </DndContext>

            <DndContext
                sensors={dragSensors}
                onDragStart={handleDragStart}
                onDragEnd={handleMetricDragEnd}
            >
                {dashboardFilters.metrics.map((item, index) => {
                    const metricField = getDashboardFilterField(
                        allFilterableMetricsMap,
                        item,
                        filterableFieldsByTileUuid,
                    );
                    const appliesToTabs = getTabsUsingFilter(item);

                    if (isFilterHiddenOnTab(appliesToTabs, activeTabUuid)) {
                        return null;
                    }

                    return metricField ? (
                        <DroppableArea key={item.id} id={item.id}>
                            <DraggableItem
                                id={item.id}
                                disabled={!isEditMode || !!openPopoverId}
                            >
                                <Filter
                                    isEditMode={isEditMode}
                                    {...getOrphanedState(item, appliesToTabs)}
                                    field={metricField}
                                    filterRule={item}
                                    triggerClassName={triggerClassName}
                                    dropdownClassName={dropdownClassName}
                                    openPopoverId={openPopoverId}
                                    onPopoverOpen={onPopoverOpen}
                                    onPopoverClose={onPopoverClose}
                                    onRemove={() =>
                                        removeMetricDashboardFilter(
                                            index,
                                            false,
                                        )
                                    }
                                    onUpdate={(value) =>
                                        updateMetricDashboardFilter(
                                            value,
                                            index,
                                            false,
                                            isEditMode,
                                        )
                                    }
                                />
                            </DraggableItem>
                        </DroppableArea>
                    ) : (
                        <UnresolvedFilter
                            key={item.id}
                            isEditMode={isEditMode}
                            filterRule={item}
                            onRemove={() =>
                                removeMetricDashboardFilter(index, false)
                            }
                        />
                    );
                })}
                <DragOverlay />
            </DndContext>

            <TemporaryFilters
                isEditMode={isEditMode}
                activeTabUuid={activeTabUuid}
                openPopoverId={openPopoverId}
                onPopoverOpen={onPopoverOpen}
                onPopoverClose={onPopoverClose}
                triggerClassName={triggerClassName}
                dropdownClassName={dropdownClassName}
            />
        </>
    );
};

export default ActiveFilters;
