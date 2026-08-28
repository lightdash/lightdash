import {
    getResultColumnMetadataFromItem,
    getResultColumnSourceItem,
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
                // Raw SQL columns have no item (SqlQueryComposer exposes no
                // items at the results seam) and get only a label derived
                // from the column reference.
                acc[key] = {
                    reference: key,
                    type: value.type,
                    ...getResultColumnMetadataFromItem(
                        getResultColumnSourceItem(itemsMap, key),
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
