import {
    assertUnreachable,
    PinnedItems,
    ResourceViewItemType,
} from '@lightdash/common';
import { Anchor, Box, SimpleGrid, Stack, Text } from '@mantine/core';
import produce from 'immer';
import { FC, useMemo, useState } from 'react';
import { DragDropContext, Draggable, Droppable } from 'react-beautiful-dnd';
import { Link, useParams } from 'react-router-dom';
import { ResourceViewCommonProps } from '..';
import { usePinnedItemsOrder } from '../../../../hooks/pinning/usePinnedItems';
import PinnedItemsPanel from '../../../PinnedItemsPanel';
import { ResourceViewItemActionState } from '../ResourceActionHandlers';
import { getResourceName, getResourceUrl } from '../resourceUtils';
import ResourceViewGridChartItem from './ResourceViewGridChartItem';
import ResourceViewGridDashboardItem from './ResourceViewGridDashboardItem';
import ResourceViewGridSpaceItem from './ResourceViewGridSpaceItem';

export interface ResourceViewGridCommonProps {
    groups?: ResourceViewItemType[][];
    hasReorder?: boolean;
    pinnedItemsProps?: {
        projectUuid: string;
        pinnedListUuid: string;
    };
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
    pinnedItemsProps = {},
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const groupedItems = useMemo(() => {
        return groups
            .map((group) => ({
                name: group
                    .map((g) => getResourceName(g) + 's')
                    .join(', ')
                    .replace(/, ([^,]*)$/, ' & $1'), // replaces last comma with '&'

                items: items.filter((item) => group.includes(item.type)),
            }))
            .filter((group) => group.items.length > 0);
    }, [groups, items]);
    const [draggableItems, setDraggableItems] = useState(groupedItems);
    // console.log({
    //     dashboards: draggableItems[1]
    //         .filter((item) => item.type === ResourceViewItemType.DASHBOARD)
    //         .map((item, index) => {
    //             return { ...item, order: index };
    //         }),
    //     charts: draggableItems[1]
    //         .filter((item) => item.type === ResourceViewItemType.CHART)
    //         .map((item, index) => {
    //             return { ...item, order: index };
    //         }),
    //     spaces: draggableItems[0].map((item, index) => {
    //         return { ...item, order: index };
    //     }),
    // });

    // const { mutateAsync } = usePinnedItemsOrder(
    //     projectUuid,
    //     pinnedItemsProps?.pinnedListUuid || '',
    //     reorderedItems,
    // );

    const handleOnDragEnd = (result: any) => {
        // here we can implement the order logic with a mutation hook
        // Mantine use-list hook could be useful here
        // if (!result.destination) return;
        // if (result.destination.index === result.source.index) return;

        const newState = produce(draggableItems, (draft) => {
            const newDraggableItems = draft.find(
                (item) => item.name === result.source.droppableId,
            );

            const draggedItem = newDraggableItems?.items.splice(
                result.source.index,
                1,
            );
            if (!draggedItem) return;
            newDraggableItems?.items.splice(
                result.destination.index,
                0,
                ...draggedItem,
            );

            const updatedDraggableItems = draft.find(
                (item) => item.name === result.source.droppableId,
            );
            if (updatedDraggableItems) {
                updatedDraggableItems.items = newDraggableItems?.items || [];
            }

            //
            // newDraggableItems?.items.map((item, index) => {
            //     return { type: item.type, uuid: item.data.uuid, order: index };
            // })
            // updateOrder < mutation
            // updateOrder(
            //   [
            //     { type: 'dashboard', uuid: '1', order: 0 },
            //     { type: 'chart', uuid: '2', order: 1 },
            //     { type: 'dashboard', uuid: '3', order: 2 },
            //   ]
            // )
            //
        });

        setDraggableItems(newState);

        //
        // const newDraggableItems = Array.from(draggableItems);
        // const [draggedItem] = newDraggableItems.splice(result.source.index, 1);
        // newDraggableItems.splice(result.destination.index, 0, draggedItem);
        // setDraggableItems(newDraggableItems);
        // console.log({ newDraggableItems });
    };

    return (
        <Stack spacing="xl" p="lg">
            {draggableItems.map((group) => (
                <Stack spacing={5} key={group.name}>
                    {draggableItems.length > 1 && (
                        <Text
                            transform="uppercase"
                            fz="xs"
                            fw="bold"
                            color="gray.6"
                        >
                            {group.name}
                        </Text>
                    )}

                    <SimpleGrid cols={3} spacing="lg">
                        <DragDropContext onDragEnd={handleOnDragEnd}>
                            <Droppable
                                droppableId={group.name}
                                isDropDisabled={!hasReorder}
                            >
                                {(dropProvided) => (
                                    <Box
                                        ref={dropProvided.innerRef}
                                        {...dropProvided.droppableProps}
                                    >
                                        {group.items.map((item, index) => (
                                            <Draggable
                                                draggableId={item.data.name}
                                                index={index}
                                                key={
                                                    item.type +
                                                    '-' +
                                                    item.data.uuid
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
                                                        ref={
                                                            dragProvided.innerRef
                                                        }
                                                        {...dragProvided.dragHandleProps}
                                                        {...dragProvided.draggableProps}
                                                    >
                                                        {item.type ===
                                                        ResourceViewItemType.SPACE ? (
                                                            <ResourceViewGridSpaceItem
                                                                item={item}
                                                                onAction={
                                                                    onAction
                                                                }
                                                            />
                                                        ) : item.type ===
                                                          ResourceViewItemType.DASHBOARD ? (
                                                            <ResourceViewGridDashboardItem
                                                                item={item}
                                                                onAction={
                                                                    onAction
                                                                }
                                                            />
                                                        ) : item.type ===
                                                          ResourceViewItemType.CHART ? (
                                                            <ResourceViewGridChartItem
                                                                item={item}
                                                                onAction={
                                                                    onAction
                                                                }
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
                                    </Box>
                                )}
                            </Droppable>
                        </DragDropContext>
                    </SimpleGrid>
                </Stack>
            ))}
        </Stack>
    );
};

export default ResourceViewGrid;
