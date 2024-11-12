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
import { arrayMove } from '@dnd-kit/sortable';
import { getTabUuidsForFilterRules } from '@lightdash/common';
import { Group, Skeleton, useMantineTheme } from '@mantine/core';
import { useCallback, useMemo, type FC, type ReactNode } from 'react';
import { useDashboardContext } from '../../../providers/DashboardProvider';
import Filter from '../Filter';
import InvalidFilter from '../InvalidFilter';

interface ActiveFiltersProps {
    isEditMode: boolean;
    activeTabUuid: string | undefined;
    openPopoverId: string | undefined;
    onPopoverOpen: (popoverId: string) => void;
    onPopoverClose: () => void;
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
}) => {
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const dashboardFilters = useDashboardContext((c) => c.dashboardFilters);
    const dashboardTemporaryFilters = useDashboardContext(
        (c) => c.dashboardTemporaryFilters,
    );
    const dashboardTabs = useDashboardContext((c) => c.dashboardTabs);
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

    const sortedTabUuids = useMemo(() => {
        const sortedTabs = dashboardTabs?.sort((a, b) => a.order - b.order);
        return sortedTabs?.map((tab) => tab.uuid) || [];
    }, [dashboardTabs]);

    const getTabsUsingFilter = useCallback(
        (filterId: string) => {
            const tabsForFilterMap = getTabUuidsForFilterRules(
                dashboardTiles,
                dashboardFilters,
                filterableFieldsByTileUuid,
            );
            return sortedTabUuids.filter(
                (tabUuid: string) =>
                    tabsForFilterMap[filterId]?.includes(tabUuid) ?? false,
            );
        },
        [
            dashboardTiles,
            dashboardFilters,
            filterableFieldsByTileUuid,
            sortedTabUuids,
        ],
    );

    const getTabsUsingTemporaryFilter = useCallback(
        (filterId: string) => {
            const tabsForFilterMap = getTabUuidsForFilterRules(
                dashboardTiles,
                dashboardTemporaryFilters,
                filterableFieldsByTileUuid,
            );
            return sortedTabUuids.filter(
                (tabUuid: string) =>
                    tabsForFilterMap[filterId]?.includes(tabUuid) ?? false,
            );
        },
        [
            dashboardTiles,
            dashboardTemporaryFilters,
            filterableFieldsByTileUuid,
            sortedTabUuids,
        ],
    );

    if (isLoadingDashboardFilters || isFetchingDashboardFilters) {
        return (
            <Group spacing="xs" ml="xs">
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
        const oldIndex = dashboardFilters.dimensions.findIndex(
            (item) => item.id === active.id,
        );
        const newIndex = dashboardFilters.dimensions.findIndex(
            (item) => item.id === over.id,
        );
        const newDimensions = arrayMove(
            dashboardFilters.dimensions,
            oldIndex,
            newIndex,
        );
        setDashboardFilters({
            ...dashboardFilters,
            dimensions: newDimensions,
        });
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
                    const field = allFilterableFieldsMap[item.target.fieldId];
                    const appliesToTabs = getTabsUsingFilter(item.id);
                    return (
                        <DroppableArea key={item.id} id={item.id}>
                            <DraggableItem
                                key={item.id}
                                id={item.id}
                                disabled={!isEditMode}
                            >
                                {field ? (
                                    <Filter
                                        key={item.id}
                                        isEditMode={isEditMode}
                                        field={field}
                                        filterRule={item}
                                        activeTabUuid={activeTabUuid}
                                        appliesToTabs={appliesToTabs}
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
                                    <InvalidFilter
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

            {dashboardTemporaryFilters.dimensions.map((item, index) => {
                const field = allFilterableFieldsMap[item.target.fieldId];
                const appliesToTabs = getTabsUsingTemporaryFilter(item.id);
                return field ? (
                    <Filter
                        key={item.id}
                        isTemporary
                        isEditMode={isEditMode}
                        field={field}
                        filterRule={item}
                        activeTabUuid={activeTabUuid}
                        appliesToTabs={appliesToTabs}
                        openPopoverId={openPopoverId}
                        onPopoverOpen={onPopoverOpen}
                        onPopoverClose={onPopoverClose}
                        onRemove={() =>
                            removeDimensionDashboardFilter(index, true)
                        }
                        onUpdate={(value) =>
                            updateDimensionDashboardFilter(
                                value,
                                index,
                                true,
                                isEditMode,
                            )
                        }
                    />
                ) : (
                    <InvalidFilter
                        key={item.id}
                        isEditMode={isEditMode}
                        filterRule={item}
                        onRemove={() =>
                            removeDimensionDashboardFilter(index, false)
                        }
                    />
                );
            })}
        </>
    );
};

export default ActiveFilters;
