import {
    assertUnreachable,
    convertItemTypeToDimensionType,
    formatItemValue,
    formatRawValue,
    getPivotValueColumnName,
    normalizeIndexColumns,
    VizAggregationOptions,
    type ItemsMap,
    type PivotConfiguration,
    type PivotValuesColumn,
    type ReadyQueryResultsPage,
    type ResultColumns,
} from '@lightdash/common';

export type PivotedQueryResults = {
    rows: Record<string, unknown>[];
    pivotDetails: NonNullable<ReadyQueryResultsPage['pivotDetails']>;
};

const toNumber = (value: unknown): number | null => {
    if (typeof value === 'number') return Number.isNaN(value) ? null : value;
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        return Number.isNaN(parsed) ? null : parsed;
    }
    return null;
};

const aggregate = (
    values: unknown[],
    aggregation: VizAggregationOptions,
): unknown => {
    const present = values.filter(
        (value) => value !== null && value !== undefined,
    );
    const numbers = present
        .map(toNumber)
        .filter((value): value is number => value !== null);
    switch (aggregation) {
        case VizAggregationOptions.ANY:
            return present[0] ?? null;
        case VizAggregationOptions.COUNT:
            return present.length;
        case VizAggregationOptions.SUM:
            return numbers.reduce((sum, value) => sum + value, 0);
        case VizAggregationOptions.AVERAGE:
            return numbers.length
                ? numbers.reduce((sum, value) => sum + value, 0) /
                      numbers.length
                : null;
        case VizAggregationOptions.MIN:
            return numbers.length ? Math.min(...numbers) : null;
        case VizAggregationOptions.MAX:
            return numbers.length ? Math.max(...numbers) : null;
        default:
            return assertUnreachable(
                aggregation,
                `Unknown pivot aggregation ${aggregation}`,
            );
    }
};

/**
 * Pivots query rows in process the way the warehouse pivot does for the
 * explorer: one row per index value, one column per value field and
 * group-by value, named and described (`pivotDetails`) exactly as the query
 * API returns a pivoted result, so the chart engine draws them the same.
 * Rows keep the order the query sorted them in; pivot columns appear in the
 * order their group-by values first occur.
 */
export const pivotQueryResults = ({
    rows,
    fields,
    pivotConfiguration,
    timezone,
}: {
    rows: Record<string, unknown>[];
    fields: ItemsMap;
    pivotConfiguration: PivotConfiguration;
    timezone?: string;
}): PivotedQueryResults => {
    const indexColumns = normalizeIndexColumns(
        pivotConfiguration.indexColumn,
    ).map((column) => column.reference);
    const groupByColumns = pivotConfiguration.groupByColumns ?? [];
    const { valuesColumns } = pivotConfiguration;

    const groups = new Map<
        string,
        { index: Record<string, unknown>; cells: Map<string, unknown[]> }
    >();
    const pivotColumns = new Map<string, PivotValuesColumn>();

    rows.forEach((row) => {
        const groupKey = JSON.stringify(
            indexColumns.map((reference) => row[reference] ?? null),
        );
        let group = groups.get(groupKey);
        if (!group) {
            group = {
                index: Object.fromEntries(
                    indexColumns.map((reference) => [
                        reference,
                        row[reference],
                    ]),
                ),
                cells: new Map(),
            };
            groups.set(groupKey, group);
        }
        const pivotValues = groupByColumns.map((column) => {
            const field = fields[column.reference];
            const rawValue = formatRawValue(
                field,
                row[column.reference],
                timezone,
            );
            return {
                referenceField: column.reference,
                value: rawValue,
                formatted: field
                    ? formatItemValue(
                          field,
                          row[column.reference],
                          false,
                          undefined,
                          timezone,
                      )
                    : String(rawValue),
            };
        });
        valuesColumns.forEach((column) => {
            const pivotColumnName = getPivotValueColumnName(
                column.reference,
                column.aggregation,
                pivotValues.map((pivotValue) => pivotValue.value),
            );
            if (!pivotColumns.has(pivotColumnName)) {
                pivotColumns.set(pivotColumnName, {
                    referenceField: column.reference,
                    pivotColumnName,
                    aggregation: column.aggregation,
                    pivotValues,
                    columnIndex: pivotColumns.size,
                });
            }
            const cell = group!.cells.get(pivotColumnName) ?? [];
            cell.push(row[column.reference]);
            group!.cells.set(pivotColumnName, cell);
        });
    });

    const columns = [...pivotColumns.values()];
    const pivotedRows = [...groups.values()].map((group) => ({
        ...group.index,
        ...Object.fromEntries(
            columns.map((column) => {
                const cell = group.cells.get(column.pivotColumnName);
                return [
                    column.pivotColumnName,
                    cell ? aggregate(cell, column.aggregation) : null,
                ];
            }),
        ),
    }));

    const originalColumns = Object.keys(rows[0] ?? {}).reduce<ResultColumns>(
        (acc, reference) => {
            const item = fields[reference];
            if (!item) return acc;
            return {
                ...acc,
                [reference]: {
                    reference,
                    type: convertItemTypeToDimensionType(item),
                },
            };
        },
        {},
    );

    return {
        rows: pivotedRows,
        pivotDetails: {
            totalColumnCount: columns.length,
            indexColumn: pivotConfiguration.indexColumn,
            valuesColumns: columns,
            groupByColumns: pivotConfiguration.groupByColumns,
            sortBy: pivotConfiguration.sortBy,
            originalColumns,
        },
    };
};
