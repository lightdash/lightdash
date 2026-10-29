import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Box } from '@mantine/core';
import { type FC, type ReactNode } from 'react';
import classes from './DndHelpers.module.css';

export const DraggableItem: FC<{
    id: string;
    children: ReactNode;
    disabled?: boolean;
}> = ({ id, children, disabled }) => {
    const { attributes, listeners, setNodeRef, transform } = useDraggable({
        id,
        disabled,
    });

    return (
        <Box
            ref={setNodeRef}
            className={classes.draggable}
            data-dragging={transform ? true : undefined}
            style={{
                '--drag-x': transform ? `${transform.x}px` : undefined,
                '--drag-y': transform ? `${transform.y}px` : undefined,
            }}
            {...(disabled ? {} : listeners)}
            {...(disabled ? {} : attributes)}
        >
            {children}
        </Box>
    );
};

export const DroppableArea: FC<{
    id: string;
    children: ReactNode;
    orderedKeys: string[];
}> = ({ id, children, orderedKeys }) => {
    const { active, isOver, over, setNodeRef } = useDroppable({ id });

    // A thin line in the gap on the side the dragged item would land
    let side: 'before' | 'after' | null = null;
    if (isOver && active && over && active.id !== over.id) {
        const oldIndex = orderedKeys.indexOf(String(active.id));
        const newIndex = orderedKeys.indexOf(String(over.id));
        if (newIndex < oldIndex) side = 'before';
        else if (newIndex > oldIndex) side = 'after';
    }

    return (
        <Box ref={setNodeRef} pos="relative">
            {children}
            {side && <Box className={classes.dropLine} data-side={side} />}
        </Box>
    );
};
