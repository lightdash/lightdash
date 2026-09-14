import {
    getResultColumnMetadataFromItem,
    ItemsMap,
    ParametersValuesMap,
    ResultColumns,
    WarehouseResults,
} from '@lightdash/common';

export function getUnpivotedColumns(
    unpivotedColumns: ResultColumns,
    fields: WarehouseResults['fields'],
    itemsMap?: ItemsMap,
    usedParameters?: ParametersValuesMap | null,
): ResultColumns {
    if (!Object.keys(unpivotedColumns).length && fields) {
        return Object.entries(fields).reduce<ResultColumns>(
            (acc, [key, value]) => {
                // For metric queries the warehouse column name is the field id,
                // so the item lookup enriches the column with display metadata.
                // Raw SQL columns never match an item (SqlQueryComposer keys
                // its virtual-view items `${table}_${column}`) and get only a
                // label derived from the column reference.
                acc[key] = {
                    reference: key,
                    type: value.type,
                    ...(value.numericKind
                        ? { numericKind: value.numericKind }
                        : {}),
                    ...getResultColumnMetadataFromItem(
                        itemsMap?.[key],
                        key,
                        usedParameters,
                    ),
                };
                return acc;
            },
            {},
        );
    }

    return unpivotedColumns;
}
