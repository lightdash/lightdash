import {
    getResultColumnMetadataFromItem,
    ItemsMap,
    ResultColumns,
    WarehouseResults,
} from '@lightdash/common';

export function getUnpivotedColumns(
    unpivotedColumns: ResultColumns,
    fields: WarehouseResults['fields'],
    itemsMap?: ItemsMap,
): ResultColumns {
    if (!Object.keys(unpivotedColumns).length && fields) {
        return Object.entries(fields).reduce<ResultColumns>(
            (acc, [key, value]) => {
                // For metric queries the warehouse column name is the field id,
                // so the item lookup enriches the column with display metadata.
                acc[key] = {
                    reference: key,
                    type: value.type,
                    ...getResultColumnMetadataFromItem(itemsMap?.[key], key),
                };
                return acc;
            },
            {},
        );
    }

    return unpivotedColumns;
}
