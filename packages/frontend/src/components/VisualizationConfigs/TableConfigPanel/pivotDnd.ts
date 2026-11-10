import {
    closestCenter,
    pointerWithin,
    type CollisionDetection,
    type UniqueIdentifier,
} from '@dnd-kit/core';

export enum DroppableIds {
    COLUMNS = 'COLUMNS',
    ROWS = 'ROWS',
    METRICS = 'METRICS',
}

export type PivotLists = Record<DroppableIds, string[]>;

type DropLocation = { droppableId: DroppableIds; index: number };

export type PivotDrop = { source: DropLocation; destination: DropLocation };

const isDroppableId = (id: UniqueIdentifier): id is DroppableIds =>
    Object.values<UniqueIdentifier>(DroppableIds).includes(id);

export const findPivotList = (
    lists: PivotLists,
    id: UniqueIdentifier,
): DroppableIds | null => {
    if (isDroppableId(id)) return id;
    return (
        Object.values(DroppableIds).find((listId) =>
            lists[listId].some((itemId) => itemId === id),
        ) ?? null
    );
};

// Destination index is the final index for a reorder, the insertion index for a move
export const getPivotDrop = (
    lists: PivotLists,
    activeId: UniqueIdentifier,
    overId: UniqueIdentifier,
    isBelowOverItem: boolean,
): PivotDrop | null => {
    const sourceId = findPivotList(lists, activeId);
    const destinationId = findPivotList(lists, overId);
    if (sourceId === null || destinationId === null) return null;

    const source = {
        droppableId: sourceId,
        index: lists[sourceId].findIndex((id) => id === activeId),
    };
    const destinationItems = lists[destinationId];
    const overIndex = destinationItems.findIndex((id) => id === overId);

    if (sourceId === destinationId) {
        if (overIndex === -1 || overIndex === source.index) return null;
        return {
            source,
            destination: { droppableId: destinationId, index: overIndex },
        };
    }
    return {
        source,
        destination: {
            droppableId: destinationId,
            index:
                overIndex === -1
                    ? destinationItems.length
                    : overIndex + (isBelowOverItem ? 1 : 0),
        },
    };
};

// Prefer the item under the pointer over its list; keyboard drags have no pointer
export const pivotCollisionDetection: CollisionDetection = (args) => {
    const hits = pointerWithin(args);
    const itemHits = hits.filter(({ id }) => !isDroppableId(id));
    if (itemHits.length > 0) return itemHits;
    return hits.length > 0 ? hits : closestCenter(args);
};
