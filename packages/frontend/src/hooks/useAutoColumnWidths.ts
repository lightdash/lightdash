import { useMantineTheme } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import {
    CELL_HORIZONTAL_PADDING_PX,
    MAX_CELL_WIDTH_PX,
    TABLE_FONT_SIZE_PX,
    TABLE_HEADER_FONT_WEIGHT,
} from '../components/common/Table/constants';

const MIN_COLUMN_WIDTH = 50;
const CELL_PADDING = CELL_HORIZONTAL_PADDING_PX * 2;

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
    const theme = useMantineTheme();
    const [widths, setWidths] = useState<Record<string, number>>({});
    const computedForRef = useRef<string | null>(null);

    const fontFamily = theme.fontFamily ?? 'sans-serif';
    const tableFont = `${TABLE_FONT_SIZE_PX}px ${fontFamily}`;
    const headerFont = `${TABLE_HEADER_FONT_WEIGHT} ${TABLE_FONT_SIZE_PX}px ${fontFamily}`;

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
            ctx.font = headerFont;
            const headerText = headerLabels?.[colId] ?? colId;
            let maxWidth = ctx.measureText(headerText).width;

            ctx.font = tableFont;
            for (const row of rows) {
                const text = getCellText(row, colId);
                if (text) {
                    const w = ctx.measureText(text).width;
                    if (w > maxWidth) maxWidth = w;
                }
            }

            newWidths[colId] = Math.min(
                MAX_CELL_WIDTH_PX,
                Math.max(MIN_COLUMN_WIDTH, Math.ceil(maxWidth + CELL_PADDING)),
            );
        }

        computedForRef.current = columnKey;
        setWidths(newWidths);
    }, [
        enabled,
        columnIds,
        rows,
        getCellText,
        headerLabels,
        tableFont,
        headerFont,
    ]);

    return widths;
}
