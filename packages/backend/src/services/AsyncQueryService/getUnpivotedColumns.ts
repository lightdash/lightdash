import {
    getBaseFieldIdFromPop,
    ResultColumns,
    WarehouseResults,
} from '@lightdash/common';

type GetUnpivotedColumnsOptions = {
    /**
     * Set of metric field IDs that have period-over-period comparison enabled.
     * When provided, columns matching the PoP naming convention will have
     * popMetadata added to indicate their relationship to the base metric.
     */
    popEnabledMetrics?: Set<string>;
};

export function getUnpivotedColumns(
    unpivotedColumns: ResultColumns,
    fields: WarehouseResults['fields'],
    options?: GetUnpivotedColumnsOptions,
): ResultColumns {
    const { popEnabledMetrics } = options ?? {};

    if (!Object.keys(unpivotedColumns).length && fields) {
        return Object.entries(fields).reduce<ResultColumns>(
            (acc, [key, value]) => {
                const baseFieldId = getBaseFieldIdFromPop(key);
                const isPopColumn =
                    baseFieldId !== null &&
                    popEnabledMetrics?.has(baseFieldId) === true;

                acc[key] = {
                    reference: key,
                    type: value.type,
                    ...(isPopColumn && baseFieldId
                        ? { popMetadata: { baseFieldId } }
                        : {}),
                };
                return acc;
            },
            {},
        );
    }

    return unpivotedColumns;
}
