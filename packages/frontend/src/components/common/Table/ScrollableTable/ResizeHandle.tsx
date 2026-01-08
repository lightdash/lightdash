import { useCallback, useEffect, type FC, type MouseEvent } from 'react';
import { useTableContext } from '../useTableContext';
import styles from './ResizeHandle.module.css';

interface ResizeHandleProps {
    columnId: string;
}

export const ResizeHandle: FC<ResizeHandleProps> = ({ columnId }) => {
    const { columnSizing } = useTableContext();
    const { startResize, updateResize, endResize, resizingColumnId } =
        columnSizing;

    const isResizing = resizingColumnId === columnId;

    const handleMouseDown = useCallback(
        (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            startResize(columnId, e.clientX);
        },
        [columnId, startResize],
    );

    const handleDoubleClick = useCallback(
        (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            columnSizing.resetColumnWidth(columnId);
        },
        [columnId, columnSizing],
    );

    // Global mouse move and up handlers when resizing
    useEffect(() => {
        if (!isResizing) return;

        const handleMouseMove = (e: globalThis.MouseEvent) => {
            updateResize(e.clientX);
        };

        const handleMouseUp = () => {
            endResize();
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing, updateResize, endResize]);

    return (
        <div
            role="separator"
            aria-orientation="vertical"
            className={`${styles.resizeHandle} ${
                isResizing ? styles.isResizing : ''
            }`}
            onMouseDown={handleMouseDown}
            onDoubleClick={handleDoubleClick}
        />
    );
};
