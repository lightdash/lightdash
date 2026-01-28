import { ResultColumns, WarehouseResults } from '@lightdash/common';

export function getUnpivotedColumns(
    unpivotedColumns: ResultColumns,
    fields: WarehouseResults['fields'],
): ResultColumns {
    if (!Object.keys(unpivotedColumns).length && fields) {
        return Object.entries(fields).reduce<ResultColumns>(
            (acc, [key, value]) => {
                acc[key] = {
                    reference: key,
                    type: value.type,
                };
                return acc;
            },
            {},
        );
    }

    return unpivotedColumns;
}
