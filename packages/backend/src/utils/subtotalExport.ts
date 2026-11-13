import { buildPivotRowTotalKey } from '@lightdash/common';

type ExportRow = Record<string, unknown>;

// One subtotal level: the dimensions it groups by and its warehouse rows.
export type SubtotalExportLevel = {
    dimensions: string[];
    rows: ExportRow[];
};

export type SubtotalExportRow = {
    kind: 'subtotal' | 'detail';
    // Nesting depth: 0 for the outermost subtotal, levels.length for detail rows
    depth: number;
    row: ExportRow;
};

const getGroupKey = (row: ExportRow, dimensions: string[]): string =>
    buildPivotRowTotalKey(dimensions.map((id) => [id, row[id]]));

/**
 * Regroups the detail rows like the table chart does (groups in order of first
 * appearance) and puts each group's subtotal row above its rows.
 */
export const interleaveSubtotalRows = (
    rows: ExportRow[],
    levels: SubtotalExportLevel[],
): SubtotalExportRow[] => {
    const subtotalsByLevel = levels.map(
        (level) =>
            new Map(
                level.rows.map((row) => [
                    getGroupKey(row, level.dimensions),
                    row,
                ]),
            ),
    );

    const output: SubtotalExportRow[] = [];
    const appendGroup = (groupRows: ExportRow[], depth: number) => {
        if (depth >= levels.length) {
            groupRows.forEach((row) =>
                output.push({ kind: 'detail', depth, row }),
            );
            return;
        }
        const { dimensions } = levels[depth];
        const groups = new Map<string, ExportRow[]>();
        groupRows.forEach((row) => {
            const key = getGroupKey(row, dimensions);
            const group = groups.get(key);
            if (group) {
                group.push(row);
            } else {
                groups.set(key, [row]);
            }
        });
        groups.forEach((group, key) => {
            const groupValues = Object.fromEntries(
                dimensions.map((id) => [id, group[0][id]]),
            );
            output.push({
                kind: 'subtotal',
                depth,
                row: { ...subtotalsByLevel[depth].get(key), ...groupValues },
            });
            appendGroup(group, depth + 1);
        });
    };
    appendGroup(rows, 0);
    return output;
};
