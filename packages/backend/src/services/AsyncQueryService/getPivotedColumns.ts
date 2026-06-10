import {
    DimensionType,
    normalizeIndexColumns,
    type QueryHistory,
    type ResultColumns,
} from '@lightdash/common';

export function getPivotedColumns(
    unpivotedColumns: ResultColumns,
    pivotConfiguration: NonNullable<QueryHistory['pivotConfiguration']>,
    pivotValuesColumns: string[],
): ResultColumns {
    const { indexColumn, passthroughDimensions } = pivotConfiguration;
    const indexColumns = normalizeIndexColumns(indexColumn);

    // Create an object with all index columns
    const indexColumnsResult = indexColumns.reduce(
        (acc, { reference }) => ({
            ...acc,
            [reference]: unpivotedColumns[reference],
        }),
        {} as ResultColumns,
    );

    // Include passthrough dimensions so their per-row values survive the
    // streaming pipeline and reach the frontend, where cross-field richText /
    // image templates resolve `row.<table>.<field>.raw` via TanStack's
    // (visibility-hidden) column cells.
    //
    // Skip passthrough refs that aren't present in unpivotedColumns —
    // writing `undefined` into ResultColumns would lie about the column
    // shape and could crash downstream consumers that assume entries are
    // truthy. The dim is still carried on each row by AsyncQueryService's
    // row transformer, so the lookup is templates-only; losing the column
    // metadata entry just means the field isn't listed in the columns map.
    const passthroughColumnsResult = (passthroughDimensions ?? []).reduce(
        (acc, { reference }) => {
            const col = unpivotedColumns[reference];
            if (col === undefined) return acc;
            return { ...acc, [reference]: col };
        },
        {} as ResultColumns,
    );

    return {
        ...indexColumnsResult,
        ...passthroughColumnsResult,
        ...pivotValuesColumns.reduce(
            (acc, valueColumn) => ({
                ...acc,
                [valueColumn]: {
                    reference: valueColumn,
                    type: DimensionType.NUMBER,
                },
            }),
            {},
        ),
    };
}
