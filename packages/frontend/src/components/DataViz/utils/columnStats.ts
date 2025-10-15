import { type RawResultRow } from '@lightdash/common';

export type ColumnStats = {
    min: number;
    max: number;
};

export type ColumnStatsMap = Record<string, ColumnStats>;

/**
 * Calculate min/max statistics for numeric columns
 * Used for scaling bar chart displays
 */
export function calculateColumnStats(
    rows: RawResultRow[],
    columnReferences: string[],
): ColumnStatsMap {
    const stats: ColumnStatsMap = {};

    if (rows.length === 0) return stats;

    // Initialize with first row values
    columnReferences.forEach((colRef) => {
        // Initialize stats for all columns with default values
        stats[colRef] = { min: Infinity, max: -Infinity };
    });

    // Scan all rows to find min/max
    rows.forEach((row) => {
        columnReferences.forEach((colRef) => {
            const value = Number(row[colRef]);
            if (!Number.isNaN(value) && stats[colRef]) {
                if (value < stats[colRef].min) {
                    stats[colRef].min = value;
                }
                if (value > stats[colRef].max) {
                    stats[colRef].max = value;
                }
            }
        });
    });

    return stats;
}
