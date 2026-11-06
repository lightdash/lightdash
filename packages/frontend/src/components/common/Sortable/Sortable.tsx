import {
    closestCenter,
    DndContext,
    DragOverlay,
    type DragEndEvent,
    type DragStartEvent,
    type DraggableAttributes,
    type UniqueIdentifier,
} from '@dnd-kit/core';
import { SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import clsx from 'clsx';
import {
    type CSSProperties,
    type FC,
    type KeyboardEventHandler,
    type MouseEventHandler,
    type ReactNode,
    type TouchEventHandler,
} from 'react';
import { createPortal } from 'react-dom';
import { usePortalTarget } from '../../../providers/PortalTarget/usePortalTarget';
import classes from './Sortable.module.css';
import {
    getReorder,
    lockToAxis,
    sortingStrategy,
    useSortableSensors,
    type SortableAxis,
} from './sortableUtils';

type SortableListProps = {
    items: UniqueIdentifier[];
    axis?: SortableAxis;
    onReorder: (from: number, to: number) => void;
    onDragStart?: (event: DragStartEvent) => void;
    onDragEnd?: () => void;
    // Rendered in a portal while dragging, for items that would be clipped
    overlay?: ReactNode;
    children: ReactNode;
};

export const SortableList: FC<SortableListProps> = ({
    items,
    axis = 'vertical',
    onReorder,
    onDragStart,
    onDragEnd,
    overlay,
    children,
}) => {
    const sensors = useSortableSensors();
    const portalTarget = usePortalTarget();
    const handleDragEnd = (event: DragEndEvent) => {
        const reorder = getReorder(items, event);
        if (reorder) onReorder(reorder.from, reorder.to);
        onDragEnd?.();
    };
    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[lockToAxis[axis]]}
            onDragStart={onDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={onDragEnd}
        >
            <SortableContext items={items} strategy={sortingStrategy[axis]}>
                {children}
            </SortableContext>
            {overlay !== undefined &&
                createPortal(
                    <DragOverlay>{overlay}</DragOverlay>,
                    portalTarget,
                )}
        </DndContext>
    );
};

export type SortableHandleProps = DraggableAttributes & {
    ref: (element: HTMLElement | null) => void;
    className: string;
    onMouseDown: MouseEventHandler;
    onTouchStart: TouchEventHandler;
    onKeyDown: KeyboardEventHandler;
};

export type SortableItemState = {
    ref: (element: HTMLElement | null) => void;
    className: string;
    style: CSSProperties & Record<`--${string}`, string>;
    handleProps: SortableHandleProps;
    isDragging: boolean;
};

type SortableItemProps = {
    id: UniqueIdentifier;
    disabled?: boolean;
    children: (state: SortableItemState) => ReactNode;
};

export const SortableItem: FC<SortableItemProps> = ({
    id,
    disabled,
    children,
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        setActivatorNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id, disabled });

    return children({
        ref: setNodeRef,
        className: clsx(classes.item, isDragging && classes.dragging),
        style: {
            '--sortable-transform': CSS.Translate.toString(transform) ?? 'none',
            '--sortable-transition': transition ?? 'none',
        },
        isDragging,
        handleProps: {
            ...attributes,
            ref: setActivatorNodeRef,
            className: classes.handle,
            onMouseDown: (event) => listeners?.onMouseDown?.(event),
            onTouchStart: (event) => listeners?.onTouchStart?.(event),
            onKeyDown: (event) => listeners?.onKeyDown?.(event),
        },
    });
};
