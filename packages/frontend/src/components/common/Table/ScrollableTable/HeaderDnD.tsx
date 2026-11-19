import {
    closestCenter,
    DndContext,
    DragOverlay,
    type DragEndEvent,
    type DragMoveEvent,
    type DragOverEvent,
    type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { type ResultRow } from '@lightdash/common';
import { flexRender, type HeaderGroup } from '@tanstack/react-table';
import { useMemo, useRef, useState, type FC, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePortalTarget } from '../../../../providers/PortalTarget/usePortalTarget';
import {
    lockToAxis,
    sortingStrategy,
    useSortableSensors,
} from '../../Sortable/sortableUtils';
import { ROW_NUMBER_COLUMN_ID } from '../constants';
import { useTableContext } from '../useTableContext';
import classes from './HeaderDnD.module.css';

type HeaderDragState = {
    activeId: string;
    headerIds: string[];
    colOrder: string[];
};

type HeaderDndProps = {
    onDragColumnChange: (id?: string) => void;
    headerGroup: HeaderGroup<ResultRow>;
    children: ReactNode;
};

const DRAG_OUT_MIN_DISTANCE = 48;

export const HeaderDnD: FC<HeaderDndProps> = ({
    headerGroup,
    children,
    onDragColumnChange,
}) => {
    const { table, onColumnOrderChange, onColumnRemove } = useTableContext();
    const rowRef = useRef<HTMLTableRowElement>(null);
    const [isRemoving, setIsRemoving] = useState(false);
    const sensors = useSortableSensors();
    const portalTarget = usePortalTarget();
    // Ids stay frozen while dragging so drop targets keep their start-of-drag rects as columns reorder live
    const [drag, setDrag] = useState<HeaderDragState | null>(null);
    const orderedHeaderIds = useMemo(
        () => headerGroup.headers.map(({ id }) => id),
        [headerGroup.headers],
    );
    const headerIds = drag?.headerIds ?? orderedHeaderIds;
    const activeHeader = drag
        ? headerGroup.headers.find(({ id }) => id === drag.activeId)
        : undefined;

    const handleDragStart = ({ active }: DragStartEvent) => {
        onDragColumnChange(String(active.id));
        setDrag({
            activeId: String(active.id),
            headerIds,
            colOrder: table.getState().columnOrder,
        });
    };

    const handleDragOver = ({ active, over }: DragOverEvent) => {
        if (!drag || !over) return;
        const colOrder = [...drag.colOrder];
        colOrder.splice(drag.headerIds.indexOf(drag.activeId), 1);
        colOrder.splice(
            drag.headerIds.indexOf(String(over.id)),
            0,
            String(active.id),
        );
        table.setColumnOrder([ROW_NUMBER_COLUMN_ID, ...colOrder]);
    };

    // Dragged past the table's left edge, towards the fields sidebar
    const isDraggedOut = ({ active, delta }: DragMoveEvent | DragEndEvent) => {
        const dragged = active.rect.current.translated;
        const container = rowRef.current?.closest('table')?.parentElement;
        if (!onColumnRemove || !dragged || !container) return false;
        // A column scrolled half out of view must still be dragged, not nudged
        return (
            delta.x < -DRAG_OUT_MIN_DISTANCE &&
            dragged.left + dragged.width / 2 <
                container.getBoundingClientRect().left
        );
    };

    const handleDragEnd = (event?: DragEndEvent) => {
        onDragColumnChange();
        setDrag(null);
        setIsRemoving(false);
        if (drag && event && isDraggedOut(event)) {
            table.setColumnOrder([ROW_NUMBER_COLUMN_ID, ...drag.colOrder]);
            onColumnRemove?.(drag.activeId);
            return;
        }
        onColumnOrderChange?.(
            table
                .getState()
                .columnOrder.filter((value) => value !== ROW_NUMBER_COLUMN_ID),
        );
    };

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[lockToAxis.horizontal]}
            accessibility={{ container: portalTarget }}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragMove={(event) => setIsRemoving(isDraggedOut(event))}
            onDragEnd={handleDragEnd}
            onDragCancel={() => handleDragEnd()}
        >
            <SortableContext
                items={headerIds}
                strategy={sortingStrategy.horizontal}
            >
                <tr ref={rowRef}>{children}</tr>
            </SortableContext>
            {createPortal(
                <DragOverlay dropAnimation={null} className={classes.overlay}>
                    {!activeHeader || activeHeader.isPlaceholder ? null : (
                        <div data-removing={isRemoving || undefined}>
                            {flexRender(
                                activeHeader.column.columnDef.header,
                                activeHeader.getContext(),
                            )}
                        </div>
                    )}
                </DragOverlay>,
                portalTarget,
            )}
        </DndContext>
    );
};
