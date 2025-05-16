import {
    DimensionType,
    type QueryHistory,
    type ResultColumns,
} from '@lightdash/common';

export function getPivotedColumns(
    unpivotedColumns: ResultColumns,
    pivotConfiguration: NonNullable<QueryHistory['pivotConfiguration']>,
    pivotValuesColumns: string[],
): ResultColumns {
    const { indexColumn } = pivotConfiguration;
    const indexColumnReference = indexColumn?.reference;

    if (!indexColumnReference) {
        throw new Error('Index column reference is required');
    }

    const indexResultsColumn = unpivotedColumns[indexColumnReference];

    return {
        [indexColumnReference]: indexResultsColumn,
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
