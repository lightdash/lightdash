import { useEffect, useRef, useState } from 'react';

const MIN_COLUMN_WIDTH = 50;
const MAX_AUTO_COLUMN_WIDTH = 300;
const CELL_PADDING = 22; // 11px left + 11px right from Table.styles.tsx
const TABLE_FONT = '14px Inter, sans-serif';
const HEADER_FONT = 'bold 14px Inter, sans-serif';

let sharedCanvas: HTMLCanvasElement | null = null;

function getCanvasContext(): CanvasRenderingContext2D | null {
    if (!sharedCanvas) {
        sharedCanvas = document.createElement('canvas');
    }
    return sharedCanvas.getContext('2d');
}

export function useAutoColumnWidths({
    columnIds,
    rows,
    getCellText,
    headerLabels,
    enabled = false,
}: {
    columnIds: string[];
    rows: Record<string, unknown>[];
    getCellText: (row: Record<string, unknown>, columnId: string) => string;
    headerLabels?: Record<string, string>;
    enabled?: boolean;
}): Record<string, number> {
    const [widths, setWidths] = useState<Record<string, number>>({});
    const computedForRef = useRef<string | null>(null);

    useEffect(() => {
        if (!enabled || columnIds.length === 0 || rows.length === 0) {
            setWidths({});
            computedForRef.current = null;
            return;
        }

        const columnKey = `${columnIds.join('\0')}\0${rows.length}`;
        if (computedForRef.current === columnKey) return;

        const ctx = getCanvasContext();
        if (!ctx) return;

        const newWidths: Record<string, number> = {};

        for (const colId of columnIds) {
            ctx.font = HEADER_FONT;
            const headerText = headerLabels?.[colId] ?? colId;
            let maxWidth = ctx.measureText(headerText).width;

            ctx.font = TABLE_FONT;
            for (const row of rows) {
                const text = getCellText(row, colId);
                if (text) {
                    const w = ctx.measureText(text).width;
                    if (w > maxWidth) maxWidth = w;
                }
            }

            newWidths[colId] = Math.min(
                MAX_AUTO_COLUMN_WIDTH,
                Math.max(MIN_COLUMN_WIDTH, Math.ceil(maxWidth + CELL_PADDING)),
            );
        }

        computedForRef.current = columnKey;
        setWidths(newWidths);
    }, [enabled, columnIds, rows, getCellText, headerLabels]);

    return widths;
}
