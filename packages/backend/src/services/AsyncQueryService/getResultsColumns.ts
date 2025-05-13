import {
    DimensionType,
    type PivotValuesColumn,
    type QueryHistory,
    type ResultColumns,
    type ResultRow,
    type ValuesColumn,
} from '@lightdash/common';
import { uniq } from 'lodash';

export function getResultsColumns(
    unpivotedColumns: ResultColumns,
    pivotConfiguration: QueryHistory['pivotConfiguration'],
    pivotValuesColumns: QueryHistory['pivotValuesColumns'],
    rows: ResultRow[],
): ResultColumns {
    if (!rows.length) {
        return {};
    }

    // ! Need to get the unique all the columns that exist in all the rows, as some rows might not have all the columns
    const rowColumns = uniq(rows.flatMap((row) => Object.keys(row)));

    if (!pivotConfiguration) {
        return unpivotedColumns;
    }

    if (!pivotValuesColumns) {
        const { valuesColumns } = pivotConfiguration;
        const valuesColumnsNameMap = valuesColumns.reduce<
            Record<string, ValuesColumn>
        >((current, valueColumn) => {
            const modifiedCurrent = {
                ...current,
                [`${valueColumn.reference}_${valueColumn.aggregation}`]:
                    valueColumn,
            };

            return modifiedCurrent;
        }, {});

        return Object.fromEntries(
            rowColumns.map((column) => {
                if (valuesColumnsNameMap[column]) {
                    const referenceColumn =
                        unpivotedColumns[
                            valuesColumnsNameMap[column].reference
                        ];

                    if (!referenceColumn) {
                        throw new Error(
                            `Aggregated column reference ${column} not found`,
                        );
                    }

                    return [
                        column,
                        {
                            ...referenceColumn,
                            type: DimensionType.NUMBER,
                        },
                    ];
                }

                const unpivotedColumn = unpivotedColumns[column];

                if (!unpivotedColumn) {
                    throw new Error(`Unpivoted column ${column} not found`);
                }

                return [column, unpivotedColumn];
            }),
        );
    }

    return Object.fromEntries(
        rowColumns.map((column) => {
            const pivotValuesColumn = pivotValuesColumns?.find(
                (pColumn) => pColumn.pivotColumnName === column,
            );

            // If the column is a values column, we need to get the unpivoted column referenceand set the type to number
            if (pivotValuesColumn) {
                const unpivotedColumn =
                    unpivotedColumns[pivotValuesColumn.referenceField];

                if (!unpivotedColumn) {
                    throw new Error(
                        `Pivoted column reference ${pivotValuesColumn.referenceField} not found`,
                    );
                }

                return [
                    pivotValuesColumn.pivotColumnName,
                    {
                        ...unpivotedColumn,
                        type: DimensionType.NUMBER,
                    },
                ];
            }

            const unpivotedColumn = unpivotedColumns[column];

            if (!unpivotedColumn) {
                throw new Error(`Unpivoted column ${column} not found`);
            }

            return [unpivotedColumn.reference, unpivotedColumn];
        }),
    );
}
