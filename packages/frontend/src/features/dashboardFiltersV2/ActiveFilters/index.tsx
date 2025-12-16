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
import { type DashboardFilterRule } from '@lightdash/common';
import {
    Button,
    Group,
    Skeleton,
    Tooltip,
    useMantineTheme,
} from '@mantine/core';
import { IconRotate2 } from '@tabler/icons-react';
import { useCallback, useMemo, type FC, type ReactNode } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import {
    doesFilterApplyToAnyTile,
    getTabsForFilterRule,
} from '../FilterConfiguration/utils';
import InvalidFilter from '../InvalidFilter';
import Filter from './Filter';

interface ActiveFiltersProps {
    isEditMode: boolean;
    activeTabUuid: string | undefined;
    openPopoverId: string | undefined;
    onPopoverOpen: (popoverId: string) => void;
    onPopoverClose: () => void;
    onResetDashboardFilters: () => void;
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
    onResetDashboardFilters,
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
    const haveFiltersChanged = useDashboardContext(
        (c) =>
            c.haveFiltersChanged ||
            c.dashboardTemporaryFilters.dimensions.length > 0,
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

    // Tabs are only "enabled" when there's more than one tab
    const tabsEnabled = dashboardTabs && dashboardTabs.length > 1;

    // Compute which tabs a filter applies to based on tileTargets
    // Note: We use getTabsForFilterRule because getTabUuidsForFilterRules from common
    // skips disabled filters, but required filters ARE disabled until a value is set
    const getTabsUsingFilter = useCallback(
        (filterRule: DashboardFilterRule) =>
            getTabsForFilterRule(
                filterRule,
                dashboardTiles,
                sortedTabUuids,
                filterableFieldsByTileUuid,
            ),
        [dashboardTiles, sortedTabUuids, filterableFieldsByTileUuid],
    );

    // Compute orphaned state for a filter
    // - With multiple tabs: orphaned if filter applies to no tabs
    // - With single/no tabs: orphaned if filter applies to no tiles
    const getOrphanedState = useCallback(
        (
            filterRule: DashboardFilterRule,
            appliesToTabs: string[],
        ): { isOrphaned: boolean; orphanedTooltip: string } => {
            if (tabsEnabled) {
                return {
                    isOrphaned: appliesToTabs.length === 0,
                    orphanedTooltip: 'This filter is not applied to any tabs',
                };
            }
            // Single tab or no tabs - check if filter applies to any tile
            const appliesToAnyTile = doesFilterApplyToAnyTile(
                filterRule,
                dashboardTiles,
                filterableFieldsByTileUuid,
            );
            return {
                isOrphaned: !appliesToAnyTile,
                orphanedTooltip: 'This filter is not applied to any tiles',
            };
        },
        [tabsEnabled, dashboardTiles, filterableFieldsByTileUuid],
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
            {!isEditMode && haveFiltersChanged && (
                <Tooltip label="Reset all filters">
                    <Button
                        aria-label="Reset all filters"
                        size="xs"
                        variant="default"
                        radius="md"
                        color="gray"
                        onClick={() => {
                            setHaveFiltersChanged(false);
                            onResetDashboardFilters();
                        }}
                    >
                        <MantineIcon icon={IconRotate2} />
                    </Button>
                </Tooltip>
            )}
            <DndContext
                sensors={dragSensors}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
            >
                {dashboardFilters.dimensions.map((item, index) => {
                    const field = allFilterableFieldsMap[item.target.fieldId];
                    const appliesToTabs = getTabsUsingFilter(item);

                    const isOrphanedFilter = appliesToTabs.length === 0;
                    const appliedToCurrentTab =
                        !activeTabUuid || appliesToTabs.includes(activeTabUuid);

                    // Hide filter if it doesn't apply to the current tab
                    // But always show orphaned filters so users can see and fix them
                    if (!appliedToCurrentTab && !isOrphanedFilter) {
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
                const appliesToTabs = getTabsUsingFilter(item);

                const isOrphanedFilter = appliesToTabs.length === 0;
                const appliedToCurrentTab =
                    !activeTabUuid || appliesToTabs.includes(activeTabUuid);

                // Hide filter if it doesn't apply to the current tab
                // But always show orphaned filters so users can see and fix them
                if (!appliedToCurrentTab && !isOrphanedFilter) {
                    return null;
                }

                return field || item.target.isSqlColumn ? (
                    <Filter
                        key={item.id}
                        {...getOrphanedState(item, appliesToTabs)}
                        isTemporary
                        isEditMode={isEditMode}
                        field={field}
                        filterRule={item}
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
