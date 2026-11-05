import {
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
    type Modifier,
    type UniqueIdentifier,
} from '@dnd-kit/core';
import {
    horizontalListSortingStrategy,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';

export type SortableAxis = 'vertical' | 'horizontal';

export const lockToAxis: Record<SortableAxis, Modifier> = {
    vertical: ({ transform }) => ({ ...transform, x: 0 }),
    horizontal: ({ transform }) => ({ ...transform, y: 0 }),
};

export const sortingStrategy = {
    vertical: verticalListSortingStrategy,
    horizontal: horizontalListSortingStrategy,
};

// Mouse, touch long-press and keyboard (space to lift, arrows to move)
export const useSortableSensors = () =>
    useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, {
            activationConstraint: { delay: 150, tolerance: 5 },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );

export const getReorder = (
    items: UniqueIdentifier[],
    { active, over }: DragEndEvent,
): { from: number; to: number } | null => {
    if (!over || active.id === over.id) return null;
    const from = items.indexOf(active.id);
    const to = items.indexOf(over.id);
    if (from === -1 || to === -1) return null;
    return { from, to };
};
