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
    const { indexColumn } = pivotConfiguration;
    const indexColumns = normalizeIndexColumns(indexColumn);

    if (indexColumns.length === 0) {
        throw new Error('Index column reference is required');
    }

    // Create an object with all index columns
    const indexColumnsResult = indexColumns.reduce(
        (acc, { reference }) => ({
            ...acc,
            [reference]: unpivotedColumns[reference],
        }),
        {} as ResultColumns,
    );

    return {
        ...indexColumnsResult,
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
