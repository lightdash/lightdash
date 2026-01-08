import { type ColumnProperties } from '@lightdash/common';
import { useCallback, useMemo, useState } from 'react';

/**
 * Minimum width for any column in pixels
 */
const MIN_COLUMN_WIDTH = 50;

/**
 * Default width for auto columns when there's enough space
 */
const DEFAULT_AUTO_WIDTH = 150;

export type ColumnSizingState = Record<string, number | undefined>;

export interface UseColumnSizingOptions {
    /** Container width in pixels */
    containerWidth: number;
    /** Column IDs in order */
    columnIds: string[];
    /** Persisted column properties containing locked widths */
    columnProperties?: Record<string, ColumnProperties>;
    /** Callback when column widths change (for persistence) */
    onColumnWidthChange?: (columnId: string, width: number | undefined) => void;
}

export interface ColumnSizingResult {
    /** Computed widths for all columns */
    columnWidths: Record<string, number>;
    /** Whether any columns have locked/custom widths */
    hasLockedWidths: boolean;
    /** Whether horizontal scrolling is needed */
    needsHorizontalScroll: boolean;
    /** Start resizing a column */
    startResize: (columnId: string, startX: number) => void;
    /** Update resize position */
    updateResize: (currentX: number) => void;
    /** End resize and persist */
    endResize: () => void;
    /** Reset a single column to auto width */
    resetColumnWidth: (columnId: string) => void;
    /** Reset all columns to auto width */
    resetAllColumnWidths: () => void;
    /** Check if a column has a locked width */
    isColumnLocked: (columnId: string) => boolean;
    /** Currently resizing column info */
    resizeState: ResizeState | null;
}

interface ResizeState {
    columnId: string;
    startX: number;
    startWidth: number;
    neighborColumnId: string | null;
    neighborStartWidth: number | null;
    /** Whether there were locked widths before this resize started */
    hadLockedWidthsBefore: boolean;
}

/**
 * Hook that manages column sizing with auto and locked widths.
 *
 * Layout rules from spec:
 * - Locked columns get exactly their specified width (clamped to MIN_COLUMN_WIDTH)
 * - Auto columns share remaining space equally
 * - If available space for auto columns < count × MIN_COLUMN_WIDTH, enable horizontal scroll
 *
 * Resize behavior (Mode A - neighbor compensation):
 * - Dragging a column border changes that column AND its right neighbor
 * - Total table width stays stable (no horizontal scroll change during resize)
 */
// Helper to extract widths from columnProperties
function getWidthsFromProps(
    columnProperties: Record<string, { width?: number }> | undefined,
): Record<string, number> {
    const widths: Record<string, number> = {};
    if (columnProperties) {
        for (const [id, props] of Object.entries(columnProperties)) {
            if (props.width !== undefined) {
                widths[id] = Math.max(props.width, MIN_COLUMN_WIDTH);
            }
        }
    }
    return widths;
}

export function useColumnSizing({
    containerWidth,
    columnIds,
    columnProperties,
    onColumnWidthChange,
}: UseColumnSizingOptions): ColumnSizingResult {
    const [resizeState, setResizeState] = useState<ResizeState | null>(null);

    // Local locked widths - this is the source of truth during interaction
    // Initialize synchronously from columnProperties to avoid flash of wrong widths
    const [localLockedWidths, setLocalLockedWidths] = useState<
        Record<string, number>
    >(() => getWidthsFromProps(columnProperties));

    // Calculate column widths based on container width and locked widths
    const { columnWidths, needsHorizontalScroll } = useMemo(() => {
        // Use local locked widths as the source of truth
        const effectiveLockedWidths = { ...localLockedWidths };

        // If container width is not yet measured, use default widths
        // This prevents the table from rendering at minimum size initially
        if (containerWidth === 0) {
            const widths: Record<string, number> = {};
            for (const id of columnIds) {
                widths[id] =
                    effectiveLockedWidths[id] !== undefined
                        ? effectiveLockedWidths[id]
                        : DEFAULT_AUTO_WIDTH;
            }
            return { columnWidths: widths, needsHorizontalScroll: false };
        }

        // Separate columns into locked and auto
        const lockedColumns: string[] = [];
        const autoColumns: string[] = [];

        for (const id of columnIds) {
            if (effectiveLockedWidths[id] !== undefined) {
                lockedColumns.push(id);
            } else {
                autoColumns.push(id);
            }
        }

        // Calculate total locked width
        const totalLockedWidth = lockedColumns.reduce(
            (sum, id) => sum + effectiveLockedWidths[id],
            0,
        );

        // Build final widths map
        const widths: Record<string, number> = {};

        // If ALL columns are locked (during/after resize), just use their locked widths
        // The table will grow/shrink based on total locked width
        if (autoColumns.length === 0) {
            for (const id of columnIds) {
                widths[id] = effectiveLockedWidths[id];
            }
            const shouldScroll = totalLockedWidth > containerWidth;
            return {
                columnWidths: widths,
                needsHorizontalScroll: shouldScroll,
            };
        }

        // Distribute remaining space to auto columns
        const availableForAuto = containerWidth - totalLockedWidth;
        const minRequiredForAuto = autoColumns.length * MIN_COLUMN_WIDTH;

        let shouldScroll = false;
        let autoColumnWidth = DEFAULT_AUTO_WIDTH;

        if (availableForAuto < minRequiredForAuto) {
            // Not enough space - enable scroll, give each auto column minimum width
            shouldScroll = true;
            autoColumnWidth = MIN_COLUMN_WIDTH;
        } else {
            // Distribute available space equally among auto columns
            autoColumnWidth = Math.max(
                availableForAuto / autoColumns.length,
                MIN_COLUMN_WIDTH,
            );
        }

        for (const id of columnIds) {
            if (effectiveLockedWidths[id] !== undefined) {
                widths[id] = effectiveLockedWidths[id];
            } else {
                widths[id] = autoColumnWidth;
            }
        }

        return { columnWidths: widths, needsHorizontalScroll: shouldScroll };
    }, [containerWidth, columnIds, localLockedWidths]);

    const startResize = useCallback(
        (columnId: string, startX: number) => {
            const columnIndex = columnIds.indexOf(columnId);
            if (columnIndex === -1) return;

            // Track if we had locked widths before this resize
            const hadLockedBefore = Object.keys(localLockedWidths).length > 0;

            // Lock ALL columns to their current widths when starting a resize
            // This prevents auto columns from redistributing during drag
            const allWidthsLocked: Record<string, number> = {};
            for (const id of columnIds) {
                allWidthsLocked[id] = columnWidths[id];
            }
            setLocalLockedWidths(allWidthsLocked);

            setResizeState({
                columnId,
                startX,
                startWidth: columnWidths[columnId],
                neighborColumnId: null,
                neighborStartWidth: null,
                hadLockedWidthsBefore: hadLockedBefore,
            });
        },
        [columnIds, columnWidths, localLockedWidths],
    );

    const updateResize = useCallback(
        (currentX: number) => {
            if (!resizeState) return;

            const deltaX = currentX - resizeState.startX;

            // New width for the column being resized
            const newWidth = Math.max(
                resizeState.startWidth + deltaX,
                MIN_COLUMN_WIDTH,
            );

            // Only update the column being resized - others stay at their locked widths
            setLocalLockedWidths((prev) => ({
                ...prev,
                [resizeState.columnId]: newWidth,
            }));
        },
        [resizeState],
    );

    const endResize = useCallback(() => {
        if (!resizeState) return;

        const resizedColumnId = resizeState.columnId;
        const finalWidth = localLockedWidths[resizedColumnId];

        // Keep all locked widths as they are - don't clear anything
        // This maintains the table shape after resize

        // Persist only the resized column's width to external state
        if (onColumnWidthChange && finalWidth !== undefined) {
            onColumnWidthChange(resizedColumnId, finalWidth);
        }

        setResizeState(null);
    }, [resizeState, localLockedWidths, onColumnWidthChange]);

    const resetColumnWidth = useCallback(
        (columnId: string) => {
            // Update local state immediately
            setLocalLockedWidths((prev) => {
                const next = { ...prev };
                delete next[columnId];
                return next;
            });
            // Also persist to external state
            if (onColumnWidthChange) {
                onColumnWidthChange(columnId, undefined);
            }
        },
        [onColumnWidthChange],
    );

    const resetAllColumnWidths = useCallback(() => {
        // Get current locked column IDs before clearing
        const currentIds = Object.keys(localLockedWidths);
        // Clear all local locked widths
        setLocalLockedWidths({});
        // Also persist to external state
        if (onColumnWidthChange) {
            for (const id of currentIds) {
                onColumnWidthChange(id, undefined);
            }
        }
    }, [localLockedWidths, onColumnWidthChange]);

    const isColumnLocked = useCallback(
        (columnId: string) => {
            return localLockedWidths[columnId] !== undefined;
        },
        [localLockedWidths],
    );

    const hasLockedWidths = Object.keys(localLockedWidths).length > 0;

    return {
        columnWidths,
        hasLockedWidths,
        needsHorizontalScroll,
        startResize,
        updateResize,
        endResize,
        resetColumnWidth,
        resetAllColumnWidths,
        isColumnLocked,
        resizeState,
    };
}
