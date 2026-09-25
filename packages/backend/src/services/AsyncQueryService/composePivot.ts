import {
    normalizeIndexColumns,
    ParameterError,
    type PivotConfiguration,
} from '@lightdash/common';

/** Every result column a pivot reads. */
export const getPivotColumnReferences = (
    pivotConfiguration: PivotConfiguration,
): string[] => [
    ...new Set([
        ...normalizeIndexColumns(pivotConfiguration.indexColumn).map(
            (column) => column.reference,
        ),
        ...pivotConfiguration.valuesColumns.map((column) => column.reference),
        ...(pivotConfiguration.groupByColumns ?? []).map(
            (column) => column.reference,
        ),
        ...(pivotConfiguration.sortOnlyColumns ?? []).map(
            (column) => column.reference,
        ),
        ...(pivotConfiguration.sortOnlyDimensions ?? []).map(
            (column) => column.reference,
        ),
        ...(pivotConfiguration.passthroughDimensions ?? []).map(
            (column) => column.reference,
        ),
    ]),
];

/** Value columns share the column limit (0 is none), so more of them than it leaves room for can never render. */
export const assertPivotWithinColumnLimit = (
    pivotConfiguration: PivotConfiguration,
    columnLimit: number,
): void => {
    const valuesColumnCount = pivotConfiguration.valuesColumns.length;
    if (
        columnLimit > 0 &&
        !pivotConfiguration.metricsAsRows &&
        valuesColumnCount > columnLimit
    ) {
        throw new ParameterError(
            `Pivot has ${valuesColumnCount} value columns, more than the column limit of ${columnLimit}`,
        );
    }
};

export const assertPivotColumnsExist = (
    pivotConfiguration: PivotConfiguration,
    columnNames: string[],
): void => {
    const available = new Set(columnNames);
    const unknown = getPivotColumnReferences(pivotConfiguration).filter(
        (reference) => !available.has(reference),
    );
    if (unknown.length > 0) {
        throw new ParameterError(
            `Pivot references unknown column(s): ${unknown.join(
                ', ',
            )}. Available columns: ${columnNames.join(', ')}`,
        );
    }
};
