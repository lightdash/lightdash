import { type VizColumn } from '@lightdash/common';

export type ColumnDiff = {
    type: 'deleted' | 'typeChanged' | 'added';
    reference: VizColumn['reference'];
    oldType?: VizColumn['type'];
    newType?: VizColumn['type'];
};
export const compareColumns = (
    previousColumns: VizColumn[],
    newColumns: VizColumn[],
) => {
    if (!previousColumns) {
        return;
    }
    const diffs = previousColumns.reduce<ColumnDiff[]>((acc, oldColumn) => {
        const newColumn = newColumns.find(
            (col) => col.reference === oldColumn.reference,
        );
        if (!newColumn) {
            return [
                ...acc,
                { reference: oldColumn.reference, type: 'deleted' },
            ];
        } else if (newColumn.type !== oldColumn.type) {
            return [
                ...acc,
                {
                    reference: oldColumn.reference,
                    type: 'typeChanged',
                    oldType: oldColumn.type,
                    newType: newColumn.type,
                },
            ];
        }
        return acc;
    }, []);

    // check for new columns
    newColumns.forEach((newColumn) => {
        const oldColumn = previousColumns.find(
            (col) => col.reference === newColumn.reference,
        );
        if (!oldColumn) {
            diffs.push({
                reference: newColumn.reference,
                type: 'added',
            });
        }
    });

    return diffs?.sort((a, b) => a.type.localeCompare(b.type));
};
