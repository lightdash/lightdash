import {
    isCustomSortColumn,
    type ItemsMap,
    type ResultColumns,
    type WarehouseResults,
} from '@lightdash/common';

export function getUnpivotedColumns(
    unpivotedColumns: ResultColumns,
    fields: WarehouseResults['fields'],
    itemsMap?: ItemsMap,
): ResultColumns {
    if (!Object.keys(unpivotedColumns).length && fields) {
        // Use ItemsMap keys as the source of truth for known field IDs
        // This allows us to precisely identify custom sort columns
        const knownFieldIds = itemsMap
            ? new Set(Object.keys(itemsMap))
            : undefined;

        return Object.entries(fields).reduce<ResultColumns>(
            (acc, [key, value]) => {
                // Filter out custom sort columns (pattern: {fieldId}__{sortName})
                // Only filter when we have a known fields reference to avoid
                // accidentally filtering legitimate columns with '__' in their name
                if (knownFieldIds && isCustomSortColumn(key, knownFieldIds)) {
                    return acc;
                }
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
