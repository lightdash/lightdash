import {
    closestCenter,
    DndContext,
    DragOverlay,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
    type DragStartEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    rectSortingStrategy,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
    assertUnreachable,
    ResourceViewItemType,
    type ResourceViewItem,
} from '@lightdash/common';
import { Box, SimpleGrid, Stack, Text } from '@mantine-8/core';
import { mergeRefs, useHover } from '@mantine/hooks';
import { IconGripVertical } from '@tabler/icons-react';
import { produce } from 'immer';
import orderBy from 'lodash/orderBy';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
    type ReactNode,
} from 'react';
import { useNavigate, useParams } from 'react-router';
import usePinnedItemsContext from '../../../../providers/PinnedItems/usePinnedItemsContext';
import MantineIcon from '../../MantineIcon';
import { getResourceName, getResourceUrl } from '../resourceUtils';
import {
    type ResourceViewCommonProps,
    type ResourceViewItemActionState,
} from '../types';
import classes from './DraggableItem.module.css';
import ResourceViewGridChartItem from './ResourceViewGridChartItem';
import ResourceViewGridDashboardItem from './ResourceViewGridDashboardItem';
import ResourceViewGridSpaceItem from './ResourceViewGridSpaceItem';

export interface ResourceViewGridCommonProps {
    groups?: ResourceViewItemType[][];
    hasReorder?: boolean;
}

type ResourceViewGridProps = ResourceViewGridCommonProps &
    Pick<ResourceViewCommonProps, 'items'> & {
        onAction: (newAction: ResourceViewItemActionState) => void;
    };

type DraggableItemProps = Pick<ResourceViewGridProps, 'onAction'> & {
    item: ResourceViewItem;
    allowDelete?: boolean;
    onAction: (newAction: ResourceViewItemActionState) => void;
    projectUuid: string;
    hasReorder: boolean;
    shouldSuppressClick: () => boolean;
    markHandleInteraction: () => void;
    isSortingActive: boolean;
};

type ResourceViewGridGroup = {
    name: string;
    items: ResourceViewItem[];
};

type ResourceCardProps = Pick<
    DraggableItemProps,
    'item' | 'allowDelete' | 'onAction'
> & {
    dragIcon: ReactNode;
};

const ResourceCard: FC<ResourceCardProps> = ({
    item,
    allowDelete,
    onAction,
    dragIcon,
}) => {
    return item.type === ResourceViewItemType.SPACE ? (
        <ResourceViewGridSpaceItem
            item={item}
            allowDelete={allowDelete}
            onAction={onAction}
            dragIcon={dragIcon}
        />
    ) : item.type === ResourceViewItemType.DASHBOARD ? (
        <ResourceViewGridDashboardItem
            item={item}
            allowDelete={allowDelete}
            onAction={onAction}
            dragIcon={dragIcon}
        />
    ) : item.type === ResourceViewItemType.CHART ? (
        <ResourceViewGridChartItem
            item={item}
            allowDelete={allowDelete}
            onAction={onAction}
            dragIcon={dragIcon}
        />
    ) : (
        assertUnreachable(item, `Resource type not supported`)
    );
};

const DraggableItem: FC<DraggableItemProps> = ({
    item,
    allowDelete,
    onAction,
    projectUuid,
    hasReorder,
    shouldSuppressClick,
    markHandleInteraction,
    isSortingActive,
}) => {
    const { hovered: isHovered, ref: hoverRef } = useHover<HTMLElement>();
    const navigate = useNavigate();
    const {
        attributes,
        listeners,
        setNodeRef,
        setActivatorNodeRef,
        transform,
        transition,
        isDragging,
        isSorting,
    } = useSortable({
        id: item.data.uuid,
        disabled: !hasReorder,
    });

    const showDragIcon = (isHovered && hasReorder) || isDragging;
    const resourceUrl = getResourceUrl(projectUuid, item);

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        position: 'relative' as const,
        zIndex: isDragging ? 1 : undefined,
    };

    const DragIcon = (
        <Box
            pos="absolute"
            left={0}
            p={4}
            ref={setActivatorNodeRef}
            style={{ touchAction: 'none' }}
            onPointerDownCapture={() => {
                if (!hasReorder) return;
                markHandleInteraction();
            }}
            onClick={(event: React.MouseEvent<HTMLDivElement>) => {
                if (!hasReorder) return;
                event.preventDefault();
                event.stopPropagation();
            }}
            {...attributes}
            {...listeners}
        >
            <MantineIcon
                display={showDragIcon ? 'block' : 'none'}
                size="sm"
                color="ldGray.6"
                icon={IconGripVertical}
            />
        </Box>
    );

    return (
        <Box
            role="link"
            tabIndex={0}
            className={`${classes.sortableAnchor} ${
                isDragging ? classes.dragging : ''
            } ${
                isSortingActive && isSorting && !isDragging
                    ? classes.sortingSibling
                    : ''
            }`}
            ref={mergeRefs(setNodeRef, hoverRef)}
            style={style}
            onClick={(event: React.MouseEvent<HTMLDivElement>) => {
                if (shouldSuppressClick()) {
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                }

                void navigate(resourceUrl);
            }}
            onKeyDown={(event: React.KeyboardEvent<HTMLDivElement>) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                if (shouldSuppressClick()) {
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                }

                event.preventDefault();
                void navigate(resourceUrl);
            }}
        >
            <ResourceCard
                item={item}
                allowDelete={allowDelete}
                onAction={onAction}
                dragIcon={DragIcon}
            />
        </Box>
    );
};

const ResourceViewGrid: FC<ResourceViewGridProps> = ({
    items,
    groups = [
        [
            ResourceViewItemType.SPACE,
            ResourceViewItemType.DASHBOARD,
            ResourceViewItemType.CHART,
        ],
    ],
    onAction,
    hasReorder = false,
}) => {
    const { reorderItems, allowDelete } = usePinnedItemsContext();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const [activeId, setActiveId] = useState<string | null>(null);
    const dragStateRef = useRef({
        isDragging: false,
        suppressClicksUntil: 0,
    });

    const shouldSuppressClick = useCallback(
        () =>
            dragStateRef.current.isDragging ||
            Date.now() < dragStateRef.current.suppressClicksUntil,
        [],
    );

    const markHandleInteraction = useCallback(() => {
        dragStateRef.current.suppressClicksUntil = Date.now() + 1000;
    }, []);

    const groupedItems = useMemo<ResourceViewGridGroup[]>(() => {
        return groups
            .map((group) => {
                const filteredItems = items.filter((item) =>
                    group.includes(item.type),
                );
                const orderedItems = orderBy(
                    filteredItems,
                    ['data.pinnedListOrder'],
                    ['asc'],
                );
                return {
                    name: group
                        .map((g) => getResourceName(g) + 's')
                        .join(', ')
                        .replace(/, ([^,]*)$/, ' & $1'), // replaces last comma with '&'

                    items: hasReorder ? orderedItems : filteredItems,
                };
            })
            .filter((group) => group.items.length > 0);
    }, [hasReorder, groups, items]);

    const [localGroupedItems, setLocalGroupedItems] =
        useState<ResourceViewGridGroup[]>(groupedItems);

    useEffect(() => {
        setLocalGroupedItems(groupedItems);
    }, [groupedItems]);

    const activeItem = useMemo(
        () =>
            activeId
                ? localGroupedItems
                      .flatMap((group) => group.items)
                      .find((item) => item.data.uuid === activeId)
                : undefined,
        [activeId, localGroupedItems],
    );

    // this method converts groupedItems to the format required by the API
    const pinnedItemsOrder = useCallback(
        (data: ResourceViewGridGroup[]) =>
            data.flatMap((group) =>
                group.items.map((item, index) => {
                    return {
                        type: item.type,
                        data: { ...item.data, pinnedListOrder: index },
                    } as ResourceViewItem;
                }),
            ),
        [],
    );

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );

    const handleOnDragEnd = useCallback(
        (groupName: string, event: DragEndEvent) => {
            dragStateRef.current.isDragging = false;
            dragStateRef.current.suppressClicksUntil = Date.now() + 1000;
            setActiveId(null);
            const { active, over } = event;
            if (!over || active.id === over.id) return;

            const previousGroupedItems = localGroupedItems;
            const newDraggableItems = produce(localGroupedItems, (draft) => {
                const draggedItems = draft.find(
                    (item) => item.name === groupName,
                );
                if (!draggedItems) return;

                const oldIndex = draggedItems.items.findIndex(
                    (item) => item.data.uuid === active.id,
                );
                const newIndex = draggedItems.items.findIndex(
                    (item) => item.data.uuid === over.id,
                );

                if (oldIndex < 0 || newIndex < 0) return;

                draggedItems.items = arrayMove(
                    draggedItems.items,
                    oldIndex,
                    newIndex,
                );
            });

            setLocalGroupedItems(newDraggableItems);
            reorderItems(pinnedItemsOrder(newDraggableItems), {
                onError: () => {
                    setLocalGroupedItems(previousGroupedItems);
                },
            });
        },
        [localGroupedItems, pinnedItemsOrder, reorderItems],
    );

    const handleOnDragStart = useCallback((event: DragStartEvent) => {
        dragStateRef.current.isDragging = true;
        dragStateRef.current.suppressClicksUntil = 0;
        setActiveId(String(event.active.id));
    }, []);

    const handleOnDragCancel = useCallback(() => {
        dragStateRef.current.isDragging = false;
        dragStateRef.current.suppressClicksUntil = Date.now() + 300;
        setActiveId(null);
    }, []);

    if (!projectUuid) {
        return null;
    }

    return (
        <Stack gap="xl" p="lg">
            {localGroupedItems.map((group) => {
                const isActiveGroup = !!activeId
                    ? group.items.some((item) => item.data.uuid === activeId)
                    : false;

                return (
                    <Stack gap={5} key={group.name}>
                        {localGroupedItems.length > 1 && (
                            <Text tt="uppercase" fz="xs" fw={600} c="ldGray.6">
                                {group.name}
                            </Text>
                        )}

                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragStart={handleOnDragStart}
                            onDragCancel={handleOnDragCancel}
                            onDragEnd={(event) =>
                                handleOnDragEnd(group.name, event)
                            }
                        >
                            <SortableContext
                                items={group.items.map(
                                    (item) => item.data.uuid,
                                )}
                                strategy={rectSortingStrategy}
                            >
                                <SimpleGrid cols={3} spacing="lg">
                                    {group.items.map((item) => (
                                        <DraggableItem
                                            key={
                                                item.type + '-' + item.data.uuid
                                            }
                                            item={item}
                                            allowDelete={allowDelete}
                                            onAction={onAction}
                                            projectUuid={projectUuid}
                                            hasReorder={hasReorder}
                                            shouldSuppressClick={
                                                shouldSuppressClick
                                            }
                                            markHandleInteraction={
                                                markHandleInteraction
                                            }
                                            isSortingActive={!!activeId}
                                        />
                                    ))}
                                </SimpleGrid>
                            </SortableContext>
                            <DragOverlay>
                                {isActiveGroup && activeItem ? (
                                    <Box className={classes.dragOverlay}>
                                        <ResourceCard
                                            item={activeItem}
                                            allowDelete={allowDelete}
                                            onAction={onAction}
                                            dragIcon={null}
                                        />
                                    </Box>
                                ) : null}
                            </DragOverlay>
                        </DndContext>
                    </Stack>
                );
            })}
        </Stack>
    );
};

export default ResourceViewGrid;
