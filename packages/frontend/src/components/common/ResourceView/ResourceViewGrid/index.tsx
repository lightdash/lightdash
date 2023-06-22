import {
    assertUnreachable,
    ResourceViewItem,
    ResourceViewItemType,
} from '@lightdash/common';
import { Anchor, SimpleGrid, Stack, Text } from '@mantine/core';
import produce from 'immer';
import orderBy from 'lodash/orderBy';
import { FC, useMemo } from 'react';
import {
    DragDropContext,
    Draggable,
    Droppable,
    DropResult,
} from 'react-beautiful-dnd';
import { Link, useParams } from 'react-router-dom';
import { ResourceViewCommonProps } from '..';
import { usePinnedItemsContext } from '../../../../providers/PinnedItemsProvider';
import { ResourceViewItemActionState } from '../ResourceActionHandlers';
import { getResourceName, getResourceUrl } from '../resourceUtils';
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
    const { reorderItems } = usePinnedItemsContext();
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const groupedItems = useMemo(() => {
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

    // this method converts groupedItems to the format required by the API
    const pinnedItemsOrder = (data: typeof groupedItems) =>
        data.flatMap((group) =>
            group.items.map((item, index) => {
                return {
                    type: item.type,
                    data: { ...item.data, pinnedListOrder: index },
                } as ResourceViewItem;
            }),
        );

    const handleOnDragEnd = (result: DropResult) => {
        const { source: drag, destination: drop } = result;
        const draggedItemId = drag?.droppableId;
        if (!drop) return;
        if (drop.index === drag.index) return;

        // using immer to update state to maintain immutability
        const newDraggableItems = produce(groupedItems, (draft) => {
            // finding the group where the item was dragged from (spaces / charts & dashs)
            const draggedItems = draft.find(
                (item) => item.name === draggedItemId,
            );
            // removing item from original location
            const draggedItem = draggedItems?.items.splice(drag.index, 1);
            if (!draggedItem) return;
            // adding it to its new location
            draggedItems?.items.splice(drop.index, 0, ...draggedItem);
        });
        reorderItems(pinnedItemsOrder(newDraggableItems));
    };

    return (
        <Stack spacing="xl" p="lg">
            {groupedItems.map((group) => (
                <Stack spacing={5} key={group.name}>
                    {groupedItems.length > 1 && (
                        <Text
                            transform="uppercase"
                            fz="xs"
                            fw="bold"
                            color="gray.6"
                        >
                            {group.name}
                        </Text>
                    )}

                    <DragDropContext onDragEnd={handleOnDragEnd}>
                        <Droppable
                            droppableId={group.name}
                            isDropDisabled={!hasReorder}
                            direction="horizontal"
                        >
                            {(dropProvided) => (
                                <SimpleGrid
                                    cols={3}
                                    spacing="lg"
                                    ref={dropProvided.innerRef}
                                    {...dropProvided.droppableProps}
                                >
                                    {group.items.map((item, index) => (
                                        <Draggable
                                            draggableId={item.data.name}
                                            index={index}
                                            key={
                                                item.type + '-' + item.data.uuid
                                            }
                                            isDragDisabled={!hasReorder}
                                        >
                                            {(dragProvided) => (
                                                <Anchor
                                                    component={Link}
                                                    to={getResourceUrl(
                                                        projectUuid,
                                                        item,
                                                    )}
                                                    sx={{
                                                        display: 'block',
                                                        color: 'unset',
                                                        ':hover': {
                                                            color: 'unset',
                                                            textDecoration:
                                                                'unset',
                                                        },
                                                    }}
                                                    ref={dragProvided.innerRef}
                                                    {...dragProvided.dragHandleProps}
                                                    {...dragProvided.draggableProps}
                                                >
                                                    {item.type ===
                                                    ResourceViewItemType.SPACE ? (
                                                        <ResourceViewGridSpaceItem
                                                            item={item}
                                                            onAction={onAction}
                                                        />
                                                    ) : item.type ===
                                                      ResourceViewItemType.DASHBOARD ? (
                                                        <ResourceViewGridDashboardItem
                                                            item={item}
                                                            onAction={onAction}
                                                        />
                                                    ) : item.type ===
                                                      ResourceViewItemType.CHART ? (
                                                        <ResourceViewGridChartItem
                                                            item={item}
                                                            onAction={onAction}
                                                        />
                                                    ) : (
                                                        assertUnreachable(
                                                            item,
                                                            `Resource type not supported`,
                                                        )
                                                    )}
                                                </Anchor>
                                            )}
                                        </Draggable>
                                    ))}
                                    {dropProvided.placeholder}
                                </SimpleGrid>
                            )}
                        </Droppable>
                    </DragDropContext>
                </Stack>
            ))}
        </Stack>
    );
};

export default ResourceViewGrid;
