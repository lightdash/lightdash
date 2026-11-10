import {
    closestCenter,
    DndContext,
    DragOverlay,
    type DragOverEvent,
    type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { type ResultRow } from '@lightdash/common';
import { flexRender, type HeaderGroup } from '@tanstack/react-table';
import { useState, type FC, type ReactNode } from 'react';
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
    headerGroup: HeaderGroup<ResultRow>;
    children: ReactNode;
};

export const HeaderDnD: FC<HeaderDndProps> = ({ headerGroup, children }) => {
    const { table, onColumnOrderChange } = useTableContext();
    const sensors = useSortableSensors();
    const portalTarget = usePortalTarget();
    // Ids stay frozen while dragging so drop targets keep their start-of-drag rects as columns reorder live
    const [drag, setDrag] = useState<HeaderDragState | null>(null);
    const headerIds =
        drag?.headerIds ?? headerGroup.headers.map(({ id }) => id);
    const activeHeader = drag
        ? headerGroup.headers.find(({ id }) => id === drag.activeId)
        : undefined;

    const handleDragStart = ({ active }: DragStartEvent) => {
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

    const handleDragEnd = () => {
        setDrag(null);
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
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragEnd}
        >
            <SortableContext
                items={headerIds}
                strategy={sortingStrategy.horizontal}
            >
                <tr>{children}</tr>
            </SortableContext>
            {createPortal(
                <DragOverlay dropAnimation={null} className={classes.overlay}>
                    {!activeHeader || activeHeader.isPlaceholder ? null : (
                        <div>
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
