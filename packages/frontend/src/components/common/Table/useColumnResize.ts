import { useEffect, useRef } from 'react';
import resizeHandleStyles from './ResizeHandle.module.css';

const MIN_COLUMN_WIDTH = 50;

type UseColumnResizeProps = {
    onColumnWidthChange?: (columnId: string, width: number) => void;
};

type UseColumnResizeReturn = {
    handleResizeStart: (e: React.MouseEvent, columnId: string) => void;
    resizeHandleClassName: string;
};

export const useColumnResize = ({
    onColumnWidthChange,
}: UseColumnResizeProps): UseColumnResizeReturn => {
    const resizeRef = useRef<{
        columnId: string;
        startX: number;
        startWidth: number;
        thElement: HTMLElement;
        handleElement: HTMLElement;
    } | null>(null);

    const onColumnWidthChangeRef = useRef(onColumnWidthChange);
    onColumnWidthChangeRef.current = onColumnWidthChange;

    const handlersRef = useRef<{
        handleMouseMove: (e: MouseEvent) => void;
        handleMouseUp: (e: MouseEvent) => void;
    }>({ handleMouseMove: () => {}, handleMouseUp: () => {} });

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            const state = resizeRef.current;
            if (!state) return;
            const deltaX = e.clientX - state.startX;
            const newWidth = Math.max(
                state.startWidth + deltaX,
                MIN_COLUMN_WIDTH,
            );
            const widthPx = `${newWidth}px`;
            state.thElement.style.width = widthPx;
            state.thElement.style.minWidth = widthPx;
            state.thElement.style.maxWidth = widthPx;

            const tableEl = state.thElement.closest('table');
            if (tableEl) {
                const colIndex =
                    (state.thElement as HTMLTableCellElement).cellIndex + 1;

                // Update <col> element if table uses <colgroup> (table-layout: fixed)
                const colEl = tableEl.querySelector<HTMLElement>(
                    `colgroup col:nth-child(${colIndex})`,
                );
                if (colEl) {
                    colEl.style.width = widthPx;
                }

                const cells = tableEl.querySelectorAll<HTMLElement>(
                    `thead th:nth-child(${colIndex}), tbody td:nth-child(${colIndex}), tbody th:nth-child(${colIndex}), tfoot td:nth-child(${colIndex}), tfoot th:nth-child(${colIndex})`,
                );
                for (const cell of cells) {
                    if (cell === state.thElement) continue;
                    if ((cell as HTMLTableCellElement).colSpan > 1) continue;
                    cell.style.width = widthPx;
                    cell.style.minWidth = widthPx;
                    cell.style.maxWidth = widthPx;
                }
            }
        };

        const handleMouseUp = (e: MouseEvent) => {
            const state = resizeRef.current;
            if (!state) return;

            const deltaX = e.clientX - state.startX;
            const newWidth = Math.max(
                state.startWidth + deltaX,
                MIN_COLUMN_WIDTH,
            );

            onColumnWidthChangeRef.current?.(state.columnId, newWidth);

            state.handleElement.classList.remove(
                resizeHandleStyles.resizeHandleActive,
            );
            resizeRef.current = null;

            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        handlersRef.current = { handleMouseMove, handleMouseUp };

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, []);

    const handleResizeStart = (e: React.MouseEvent, columnId: string) => {
        e.preventDefault();
        e.stopPropagation();

        const handleElement = e.currentTarget as HTMLElement;
        const thElement = handleElement.closest('th') as HTMLElement;
        if (!thElement) return;

        const startWidth = thElement.getBoundingClientRect().width;
        resizeRef.current = {
            columnId,
            startX: e.clientX,
            startWidth,
            thElement,
            handleElement,
        };

        handleElement.classList.add(resizeHandleStyles.resizeHandleActive);

        document.addEventListener(
            'mousemove',
            handlersRef.current.handleMouseMove,
        );
        document.addEventListener('mouseup', handlersRef.current.handleMouseUp);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    };

    return {
        handleResizeStart,
        resizeHandleClassName: resizeHandleStyles.resizeHandle,
    };
};
