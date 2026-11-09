import { useDraggable } from '@dnd-kit/core';
import { Box } from '@mantine/core';
import { type FC, type PointerEvent, type ReactNode } from 'react';
import dndClasses from '../../components/common/DndHelpers.module.css';
import classes from './FilterPills.module.css';

// A pill's drag: the pill itself, by pointer only, so Enter or Space on it
// still opens it (Alt+arrows move it). A drag swallows the click that ends
// it. On the sectioned bar's one drag context the overlay moves and the
// source fades; on the flat bar the pill itself moves
export const PillDraggable: FC<{
    id: string;
    isInBarContext: boolean;
    isDisabled: boolean;
    /** What the drag carries (default none: a filter pill). */
    data?: Record<string, unknown>;
    /** The pill button inside (default a filter pill's). */
    pillSelector?: string;
    children: ReactNode;
}> = ({
    id,
    isInBarContext,
    isDisabled,
    data,
    pillSelector = '[data-controls-pill]',
    children,
}) => {
    const { listeners, setNodeRef, isDragging, transform } = useDraggable({
        id,
        data,
        disabled: isDisabled,
    });
    // Only from the pill button: not its portalled editor or tooltip
    const handlePointerDown = (event: PointerEvent<HTMLElement>) => {
        if (
            event.target instanceof Element &&
            event.target.closest(pillSelector) !== null
        )
            listeners?.onPointerDown?.(event);
    };
    return (
        <Box
            ref={setNodeRef}
            className={`${classes.pillDrag} ${
                isInBarContext ? classes.barDraggable : dndClasses.draggable
            }`}
            data-can-drag={!isDisabled || undefined}
            data-dragging={
                (isInBarContext ? isDragging : !!transform) || undefined
            }
            onPointerDown={isDisabled ? undefined : handlePointerDown}
            style={{
                '--drag-x':
                    !isInBarContext && transform
                        ? `${transform.x}px`
                        : undefined,
                '--drag-y':
                    !isInBarContext && transform
                        ? `${transform.y}px`
                        : undefined,
            }}
        >
            {children}
        </Box>
    );
};
