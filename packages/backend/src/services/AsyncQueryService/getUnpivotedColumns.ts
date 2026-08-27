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
    columnOverrides?: ResultColumns,
): ResultColumns {
    if (!Object.keys(unpivotedColumns).length && fields) {
        return Object.entries(fields).reduce<ResultColumns>(
            (acc, [key, value]) => {
                // Compose queries inherit pass-through column metadata from
                // the queries they reference; the override carries it here.
                const override = columnOverrides?.[key];
                if (override) {
                    acc[key] = {
                        ...override,
                        reference: key,
                        type: value.type,
                    };
                    return acc;
                }
                // For metric queries the warehouse column name is the field id,
                // so the item lookup enriches the column with display metadata.
                // Raw SQL columns never match an item (SqlQueryComposer keys
                // its virtual-view items `${table}_${column}`) and get the
                // friendly-label-only rule instead.
                acc[key] = {
                    reference: key,
                    type: value.type,
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
