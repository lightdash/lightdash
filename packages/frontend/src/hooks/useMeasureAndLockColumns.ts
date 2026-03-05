import { useLayoutEffect, useMemo, useRef, useState } from 'react';

type MeasureAndLockColumnsArgs = {
    tableRef: React.RefObject<HTMLTableElement | null>;
    enabled: boolean;
    columnKey: string;
    hasData: boolean;
    containerWidth: number;
};

type MeasureAndLockColumnsResult = {
    columnWidths: number[] | null;
    totalWidth: number;
};

/**
 * Measures column widths from the DOM after the browser computes
 * `table-layout: auto`, then locks them via `<colgroup>` + `table-layout: fixed`.
 *
 * Flow:
 * 1. Table renders with auto layout (`width: 100%`). Browser computes natural widths.
 * 2. `useLayoutEffect` reads each `<th>` offsetWidth (before paint).
 * 3. Returns widths -> re-render -> colgroup + fixed layout.
 * 4. Re-measures only when `columnKey` changes (new query/config).
 * 5. Scales proportionally when container is wider than measured total.
 */
export function useMeasureAndLockColumns({
    tableRef,
    enabled,
    columnKey,
    hasData,
    containerWidth,
}: MeasureAndLockColumnsArgs): MeasureAndLockColumnsResult {
    const [rawWidths, setRawWidths] = useState<number[] | null>(null);
    const measuredKeyRef = useRef<string | null>(null);

    // Measure as soon as data is available — don't wait for containerWidth.
    // The proportional scaling useMemo below handles the case where
    // containerWidth arrives later (resize observer fires via rAF).
    const readyToMeasure = enabled && hasData;

    useLayoutEffect(() => {
        if (!readyToMeasure) {
            if (measuredKeyRef.current !== null) {
                setRawWidths(null);
                measuredKeyRef.current = null;
            }
            return;
        }

        if (measuredKeyRef.current === columnKey) return;

        const table = tableRef.current;
        if (!table) return;

        const ths = table.querySelectorAll('thead th');
        if (ths.length === 0) return;

        const widths: number[] = [];
        ths.forEach((th) => {
            widths.push((th as HTMLElement).offsetWidth);
        });

        measuredKeyRef.current = columnKey;
        setRawWidths(widths);
    }, [readyToMeasure, columnKey, tableRef]);

    // Scale column widths proportionally if the container is wider than the
    // measured total. This handles container resizes (dashboard tile growing,
    // sidebar collapsing, etc.) without re-measuring from scratch.
    const { columnWidths, totalWidth } = useMemo(() => {
        if (rawWidths === null) return { columnWidths: null, totalWidth: 0 };

        const measuredTotal = rawWidths.reduce((sum, w) => sum + w, 0);
        if (measuredTotal <= 0) return { columnWidths: null, totalWidth: 0 };

        if (containerWidth > measuredTotal) {
            const scale = containerWidth / measuredTotal;
            const scaled = rawWidths.map((w) => Math.round(w * scale));
            // Adjust last column to absorb rounding errors
            const scaledTotal = scaled.reduce((sum, w) => sum + w, 0);
            if (scaled.length > 0) {
                scaled[scaled.length - 1] += containerWidth - scaledTotal;
            }
            return { columnWidths: scaled, totalWidth: containerWidth };
        }

        return { columnWidths: rawWidths, totalWidth: measuredTotal };
    }, [rawWidths, containerWidth]);

    return { columnWidths, totalWidth };
}
