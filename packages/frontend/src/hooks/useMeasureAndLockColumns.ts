import { useLayoutEffect, useMemo, useRef, useState } from 'react';

type MeasureAndLockColumnsArgs = {
    tableRef: React.RefObject<HTMLTableElement | null>;
    enabled: boolean;
    columnKey: string;
    hasData: boolean;
    containerWidth: number;
    /** User-customized widths per column index. When set, these override measured widths. */
    customWidths?: (number | undefined)[];
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
    customWidths,
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

    // Apply user-customized widths on top of measured widths.
    // Columns with a custom width keep that exact value; the remaining columns
    // share the leftover space proportionally.
    const mergedWidths = useMemo(() => {
        if (rawWidths === null) return null;

        const hasCustom = customWidths?.some((w) => w !== undefined);
        if (!hasCustom) return rawWidths;

        return rawWidths.map((measured, i) => customWidths?.[i] ?? measured);
    }, [rawWidths, customWidths]);

    // Scale column widths proportionally if the container is wider than the
    // measured total. This handles container resizes (dashboard tile growing,
    // sidebar collapsing, etc.) without re-measuring from scratch.
    // Columns with user-customized widths are never scaled.
    const { columnWidths, totalWidth } = useMemo(() => {
        if (mergedWidths === null) return { columnWidths: null, totalWidth: 0 };

        const measuredTotal = mergedWidths.reduce((sum, w) => sum + w, 0);
        if (measuredTotal <= 0) return { columnWidths: null, totalWidth: 0 };

        if (containerWidth > measuredTotal) {
            const hasCustom = customWidths?.some((w) => w !== undefined);
            if (!hasCustom) {
                // No custom widths — scale all columns proportionally
                const scale = containerWidth / measuredTotal;
                const scaled = mergedWidths.map((w) => Math.round(w * scale));
                const scaledTotal = scaled.reduce((sum, w) => sum + w, 0);
                if (scaled.length > 0) {
                    scaled[scaled.length - 1] += containerWidth - scaledTotal;
                }
                return { columnWidths: scaled, totalWidth: containerWidth };
            }

            // With custom widths: only scale non-custom columns
            const customTotal = mergedWidths.reduce(
                (sum, _, i) =>
                    sum +
                    (customWidths?.[i] !== undefined ? mergedWidths[i] : 0),
                0,
            );
            const autoTotal = measuredTotal - customTotal;
            const remaining = containerWidth - customTotal;

            if (autoTotal > 0 && remaining > 0) {
                const scale = remaining / autoTotal;
                const scaled = mergedWidths.map((w, i) =>
                    customWidths?.[i] !== undefined ? w : Math.round(w * scale),
                );
                const scaledTotal = scaled.reduce((sum, w) => sum + w, 0);
                if (scaled.length > 0) {
                    // Find last non-custom column for rounding adjustment
                    const lastAutoIdx = scaled.reduce(
                        (last, _, i) =>
                            customWidths?.[i] === undefined ? i : last,
                        scaled.length - 1,
                    );
                    scaled[lastAutoIdx] += containerWidth - scaledTotal;
                }
                return { columnWidths: scaled, totalWidth: containerWidth };
            }

            return { columnWidths: mergedWidths, totalWidth: measuredTotal };
        }

        return { columnWidths: mergedWidths, totalWidth: measuredTotal };
    }, [mergedWidths, containerWidth, customWidths]);

    return { columnWidths, totalWidth };
}
