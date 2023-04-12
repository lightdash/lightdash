import { assertUnreachable, ResourceViewItemType } from '@lightdash/common';
import { Anchor, SimpleGrid, Stack, Text } from '@mantine/core';
import { FC, useMemo, useState } from 'react';
import { DragDropContext, Draggable, Droppable } from 'react-beautiful-dnd';
import { Link, useParams } from 'react-router-dom';
import { ResourceViewCommonProps } from '..';
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

    const [draggableItems, setDraggableItems] = useState(
        groupedItems.map((g) => g.items),
    );
    const handleOnDragEnd = (result: any) => {
        // here we can implement the order logic with a mutation hook
        // Mantine use-list hook could be useful here
        return result;
        // code below for testing drag and drop, will remove later
        // if (!result.destination) return;
        // const newDraggableItems = Array.from(draggableItems);
        // const [draggedItem] = newDraggableItems.splice(result.source.index, 1);
        // newDraggableItems.splice(result.destination.index, 0, draggedItem);
        // setDraggableItems(newDraggableItems);
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
                            droppableId="pinned-charts"
                            isDropDisabled={!hasReorder}
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
