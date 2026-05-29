import isNumber from 'lodash/isNumber';
import last from 'lodash/last';
import { type Entries } from 'type-fest';
import { LightdashParameters } from '../compiler/parameters';
import type { ReadyQueryResultsPage } from '../index';
import { UnexpectedIndexError } from '../types/errors';
import {
    DimensionType,
    FieldType,
    isDimension,
    isField,
    isSummable,
    type ItemsMap,
} from '../types/field';
import { type ParametersValuesMap } from '../types/parameters';
import {
    type PivotColumn,
    type PivotConfig,
    type PivotData,
    type TotalField,
} from '../types/pivot';
import { type ResultRow, type ResultValue } from '../types/results';
import { TimeFrames } from '../types/timeFrames';
import { getArrayValue } from '../utils/accessors';
import {
    formatItemValue,
    formatTemporalCellForSpreadsheet,
    shouldShiftItemTimezone,
    toIsoWithProjectOffset,
} from '../utils/formatting';

type FieldFunction = (fieldId: string) => ItemsMap[string] | undefined;

type FieldLabelFunction = (fieldId: string) => string | undefined;

/**
 * Warehouse-computed row totals, keyed by a stable index-value key (built with
 * `buildPivotRowTotalKey`) → metric fieldId → numeric total. Produced by the
 * `calculate-total` endpoint (`kind: 'rowTotal'`) and fed into the pivot worker
 * so the displayed row totals are correct for every metric type — count
 * distinct, average, ratios — instead of the client-side sum that only holds
 * for additive metrics.
 */
export type PivotRowTotalsByIndex = Record<string, Record<string, number>>;

// ISO 8601 datetime with an explicit timezone (e.g. 2026-01-01T00:00:00Z).
const ISO_DATETIME_RE =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

// Canonicalize a raw index value to a stable string. Date columns serialize
// differently between the pivot query (`...00Z`) and the flat totals query
// (`...00.000Z`), so any ISO datetime is normalized to its ISO instant; other
// values pass through as a plain string.
const normalizeRowTotalRaw = (raw: unknown): string | null => {
    if (raw === null || raw === undefined) return null;
    const str = String(raw);
    if (ISO_DATETIME_RE.test(str)) {
        const parsed = new Date(str);
        if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }
    return str;
};

// Stable, order-independent key for matching a pivot row to its warehouse row
// total. Both the worker (reading source pivot rows) and the frontend hook
// (reading the flat totals query rows) must build the key from the same set of
// index dimension fieldIds, so we sort by fieldId and normalize the raw value.
export const buildPivotRowTotalKey = (
    indexEntries: Array<[fieldId: string, raw: unknown]>,
): string =>
    JSON.stringify(
        [...indexEntries]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([fieldId, raw]) => [fieldId, normalizeRowTotalRaw(raw)]),
    );

// Backend `.formatted` strings don't resolve ${ld.parameters.*} placeholders
// (parameters live on the client). For flat tables, useColumns re-formats per
// cell. The pivot path stores backend values verbatim, so we do the same
// per-cell overlay here whenever the field's format references parameters.
const reformatCellWithParameters = (
    value: ResultValue | null | undefined,
    item: ItemsMap[string] | undefined,
    parameters: ParametersValuesMap | undefined,
): ResultValue | null | undefined => {
    if (!value || !item || !parameters) return value;
    if (!('format' in item) || typeof item.format !== 'string') return value;
    if (
        !item.format.includes(`\${${LightdashParameters.PREFIX_SHORT}`) &&
        !item.format.includes(`\${${LightdashParameters.PREFIX}`)
    ) {
        return value;
    }
    return {
        raw: value.raw,
        formatted: formatItemValue(item, value.raw, false, parameters),
    };
};

type RecursiveRecord<T = unknown> = {
    [key: string]: RecursiveRecord<T> | T;
};

const isRecursiveRecord = (value: unknown): value is RecursiveRecord =>
    typeof value === 'object' && value !== null;

const create2DArray = <T>(
    rows: number,
    columns: number,
    value: T | null = null,
): (T | null)[][] =>
    Array.from({ length: rows }, () =>
        Array.from({ length: columns }, () => value),
    );

const parseNumericValue = (value: ResultValue | null): number => {
    if (value === null) return 0;

    const parsedVal = Number(value.raw);
    return Number.isNaN(parsedVal) ? 0 : parsedVal;
};

const setIndexByKey = (
    obj: RecursiveRecord<number>,
    keys: string[],
    value: number,
): boolean => {
    if (keys.length === 0) {
        return false;
    }
    const [key, ...rest] = keys;

    if (key === undefined) {
        throw new UnexpectedIndexError(
            `setIndexByKey: Cannot get key from keys ${keys.length}`,
        );
    }
    if (rest.length === 0) {
        if (obj[key] === undefined) {
            // eslint-disable-next-line no-param-reassign
            obj[key] = value;
            return true;
        }
        return false;
    }
    if (obj[key] === undefined) {
        // eslint-disable-next-line no-param-reassign
        obj[key] = {};
    }

    const nextObject = obj[key];
    if (!isRecursiveRecord(nextObject)) {
        throw new Error('Cannot set key on non-object');
    }

    return setIndexByKey(nextObject, rest, value);
};

const getAllIndicesForFieldId = (
    obj: RecursiveRecord<number>,
    fieldId: string,
): number[] => {
    const entries = Object.entries(obj) as Entries<typeof obj>;
    return entries.reduce<number[]>((acc, [key, value]) => {
        if (key === fieldId && isNumber(value)) {
            return [...acc, value];
        }
        if (isRecursiveRecord(value)) {
            return [...acc, ...getAllIndicesForFieldId(value, fieldId)];
        }
        return acc;
    }, []);
};

/**
 * Rebuilds `data.retrofitData.{allCombinedData,pivotColumnInfo}` from
 * indexValues + dataValues + rowTotals so the TanStack table renderer has
 * a flat row shape per output row.
 *
 * INVARIANT: `allCombinedData.length === indexValues.length`. The
 * `convertSqlPivotedRowsToPivotData` caller emits `rows.length` output rows
 * in the standard pivot path, or `rows.length * baseMetricsArray.length`
 * when `metricsAsRows: true` (each input row fans out to one output row per
 * metric). A separate post-processing step in that caller attaches
 * passthrough dimension values onto each output row positionally, dividing
 * the output index by the fanout factor to land back on the originating
 * input row. If this function ever starts coalescing/dropping rows, the
 * positional merge will silently associate passthrough values with the
 * wrong rows. The caller has a dev-mode warn that catches this during testing.
 */
const combinedRetrofit = (
    data: PivotData,
    getField: FieldFunction,
    getFieldLabel: FieldLabelFunction,
    parameters?: ParametersValuesMap,
) => {
    const indexValues = data.indexValues.length ? data.indexValues : [[]];
    const baseIdInfo = last(data.headerValues);
    if (data.headerValues[0] === undefined) {
        throw new UnexpectedIndexError(
            'combinedRetrofit: Cannot get header values',
        );
    }
    const uniqueIdsForDataValueColumns: string[] = Array(
        getArrayValue(data.headerValues, 0).length,
    );

    data.headerValues.forEach((headerRow) => {
        headerRow.forEach((headerColValue, colIndex) => {
            uniqueIdsForDataValueColumns[colIndex] = `${
                (uniqueIdsForDataValueColumns[colIndex] ?? '') +
                headerColValue.fieldId
            }__`;
        });
    });

    // Row totals are warehouse-computed (see `convertSqlPivotedRowsToPivotData`),
    // so they are correct for every metric type — no `isSummable` gate. A null
    // total means no warehouse value was available for that cell; render blank.
    const getMetricAsRowTotalValueFromAxis = (
        total: unknown,
        rowIndex: number,
    ): ResultValue | null => {
        const value = last(data.indexValues[rowIndex]);
        if (!value || !value.fieldId) throw new Error('Invalid pivot data');
        if (total === null || total === undefined) return null;

        const item = getField(value.fieldId);
        const formattedValue = formatItemValue(item, total, false, parameters);

        return {
            raw: total,
            formatted: formattedValue,
        };
    };

    const getRowTotalValueFromAxis = (
        field: TotalField | undefined,
        total: unknown,
    ): ResultValue | null => {
        if (!field || !field.fieldId) throw new Error('Invalid pivot data');
        if (total === null || total === undefined) return null;
        const item = getField(field.fieldId);

        const formattedValue = formatItemValue(item, total, false, parameters);

        return {
            raw: total,
            formatted: formattedValue,
        };
    };

    let pivotColumnInfo = [] as PivotColumn[];
    const allCombinedData = indexValues.map((row, rowIndex) => {
        const newRow = row.map((cell, colIndex) => {
            if (cell.type === 'label') {
                const cellValue = getFieldLabel(cell.fieldId);
                return {
                    ...cell,
                    fieldId: `label-${colIndex}`,
                    value: {
                        raw: cellValue,
                        formatted: cellValue,
                    },
                    columnType: 'label',
                };
            }
            return {
                ...cell,
                columnType: 'indexValue',
            };
        });

        const remappedDataValues = getArrayValue(data.dataValues, rowIndex).map(
            (dataValue, colIndex) => {
                const baseIdInfoForCol = baseIdInfo
                    ? baseIdInfo[colIndex]
                    : undefined;
                const baseId = baseIdInfoForCol?.fieldId;
                const id =
                    getArrayValue(uniqueIdsForDataValueColumns, colIndex) +
                    colIndex;
                return {
                    baseId,
                    fieldId: id,
                    value: dataValue || {},
                };
            },
        );

        const remappedRowTotals = data.rowTotals?.[rowIndex]?.map(
            (total, colIndex) => {
                const baseId = `row-total-${colIndex}`;
                const id = baseId;
                const underlyingData = last(data.rowTotalFields)?.[colIndex];

                const value = data.pivotConfig.metricsAsRows
                    ? getMetricAsRowTotalValueFromAxis(total, rowIndex)
                    : getRowTotalValueFromAxis(underlyingData, total);
                const underlyingId = data.pivotConfig.metricsAsRows
                    ? undefined
                    : underlyingData?.fieldId;
                return {
                    baseId,
                    fieldId: id,
                    underlyingId,
                    value,
                    columnType: 'rowTotal',
                };
            },
        );

        const entireRow = [
            ...newRow,
            ...remappedDataValues,
            ...(remappedRowTotals || []),
        ];

        if (rowIndex === 0) {
            pivotColumnInfo = entireRow.map((cell) => ({
                fieldId: cell.fieldId,
                baseId: 'baseId' in cell ? cell.baseId : undefined,
                underlyingId:
                    'underlyingId' in cell ? cell.underlyingId : undefined,
                columnType: 'columnType' in cell ? cell.columnType : undefined,
            }));
        }

        const altRow: ResultRow = {};
        entireRow.forEach((cell) => {
            const val = cell.value;
            if (val && 'formatted' in val && val.formatted !== undefined) {
                altRow[cell.fieldId] = {
                    value: {
                        raw: val.raw,
                        formatted: val.formatted,
                    },
                };
            }
        });

        return altRow;
    });
    // eslint-disable-next-line no-param-reassign
    data.retrofitData = { allCombinedData, pivotColumnInfo };
    return data;
};

const getHeaderValueTypes = ({
    metricsAsRows,
    pivotDimensionNames,
}: {
    metricsAsRows: boolean;
    pivotDimensionNames: string[];
}): PivotData['headerValueTypes'] => {
    const headerDimensionValueTypes = pivotDimensionNames.map<{
        type: FieldType.DIMENSION;
        fieldId: string;
    }>((fieldId) => ({
        type: FieldType.DIMENSION,
        fieldId,
    }));
    const headerMetricValueTypes: { type: FieldType.METRIC }[] = metricsAsRows
        ? []
        : [{ type: FieldType.METRIC }];
    return [...headerDimensionValueTypes, ...headerMetricValueTypes];
};

const getColumnTotals = ({
    summableMetricFieldIds,
    rowIndices,
    totalColumns,
    dataColumns,
    dataValues,
    hasIndex,
    pivotConfig,
    indexValues,
}: {
    summableMetricFieldIds: string[];
    rowIndices: RecursiveRecord<number>;
    totalColumns: number;
    dataColumns: number;
    dataValues: (ResultValue | null)[][];
    hasIndex: boolean;
    indexValues: PivotData['indexValues'];
    pivotConfig: Pick<PivotConfig, 'metricsAsRows' | 'columnTotals'>;
}) => {
    let columnTotalFields: PivotData['columnTotalFields'];
    let columnTotals: PivotData['columnTotals'];
    const N_DATA_COLUMNS = dataColumns;
    if (pivotConfig.columnTotals && hasIndex) {
        if (pivotConfig.metricsAsRows) {
            const N_TOTAL_ROWS = summableMetricFieldIds.length;
            const N_TOTAL_COLS = totalColumns;
            columnTotalFields = create2DArray(N_TOTAL_ROWS, N_TOTAL_COLS);
            columnTotals = create2DArray(N_TOTAL_ROWS, N_DATA_COLUMNS);

            summableMetricFieldIds.forEach((fieldId, metricIndex) => {
                columnTotalFields![metricIndex][N_TOTAL_COLS - 1] = {
                    fieldId,
                };
            });

            columnTotals = columnTotals.map((row, rowIndex) =>
                row.map((_, totalColIndex) => {
                    const totalColFieldId =
                        columnTotalFields![rowIndex][N_TOTAL_COLS - 1]?.fieldId;

                    const valueColIndices = totalColFieldId
                        ? getAllIndicesForFieldId(rowIndices, totalColFieldId)
                        : [];
                    return dataValues
                        .filter((__, dataValueColIndex) =>
                            valueColIndices.includes(dataValueColIndex),
                        )
                        .reduce(
                            (acc, value) =>
                                acc + parseNumericValue(value[totalColIndex]),
                            0,
                        );
                }),
            );
        } else {
            const N_TOTAL_COLS = indexValues[0].length;
            const N_TOTAL_ROWS = 1;

            columnTotalFields = create2DArray(N_TOTAL_ROWS, N_TOTAL_COLS);
            columnTotals = create2DArray(N_TOTAL_ROWS, N_DATA_COLUMNS);

            // set the last index cell as the "Total"
            columnTotalFields[N_TOTAL_ROWS - 1][N_TOTAL_COLS - 1] = {
                fieldId: undefined,
            };

            columnTotals = columnTotals.map((row, _totalRowIndex) =>
                row.map((_col, colIndex) =>
                    dataValues
                        .map((dataRow) => dataRow[colIndex])
                        .reduce(
                            (acc, value) => acc + parseNumericValue(value),
                            0,
                        ),
                ),
            );
        }
    }
    return { columnTotalFields, columnTotals };
};

const getTitleFields = ({
    hasHeader,
    hasIndex,
    headerValueTypes,
    indexValueTypes,
}: {
    hasHeader: boolean;
    hasIndex: boolean;
    headerValueTypes: PivotData['headerValueTypes'];
    indexValueTypes: PivotData['indexValueTypes'];
}): PivotData['titleFields'] => {
    const titleFields: PivotData['titleFields'] = create2DArray(
        hasHeader ? headerValueTypes.length : 1,
        hasIndex ? indexValueTypes.length : 1,
    );
    headerValueTypes.forEach((headerValueType, headerIndex) => {
        if (headerValueType.type === FieldType.DIMENSION) {
            titleFields[headerIndex][
                hasIndex ? indexValueTypes.length - 1 : 0
            ] = {
                fieldId: headerValueType.fieldId,
                direction: 'header',
            };
        }
    });
    indexValueTypes.forEach((indexValueType, indexIndex) => {
        if (indexValueType.type === FieldType.DIMENSION) {
            titleFields[hasHeader ? headerValueTypes.length - 1 : 0][
                indexIndex
            ] = {
                fieldId: indexValueType.fieldId,
                direction: 'index',
            };
        }
    });
    return titleFields;
};

/**
 * Converts SQL-pivoted results to PivotData format
 * This handles results that are already pivoted at the SQL level (e.g., payments_total_revenue_any_bank_transfer)
 * and transforms them into the same PivotData structure consumed by the pivot table.
 */
export const convertSqlPivotedRowsToPivotData = ({
    rows,
    pivotDetails,
    pivotConfig,
    getField,
    getFieldLabel,
    groupedSubtotals,
    warehouseRowTotals,
    columnLimit,
    parameters,
}: {
    rows: ResultRow[];
    pivotDetails: NonNullable<ReadyQueryResultsPage['pivotDetails']>;
    pivotConfig: Pick<
        PivotConfig,
        | 'rowTotals'
        | 'columnTotals'
        | 'metricsAsRows'
        | 'hiddenMetricFieldIds'
        | 'hiddenDimensionFieldIds'
        | 'visibleMetricFieldIds'
        | 'columnOrder'
    >; // only use properties that are not part of pivot details metadata
    getField: FieldFunction;
    getFieldLabel: FieldLabelFunction;
    groupedSubtotals: Record<string, Record<string, number>[]> | undefined;
    /**
     * Warehouse-computed row totals from `calculate-total` (`kind: 'rowTotal'`).
     * Row totals are exclusively warehouse-computed — there is no client-side
     * fallback — so cells are blank until this resolves (or stay blank if the
     * source query can't be totalled). Drives both the metrics-as-columns and
     * metrics-as-rows layouts.
     */
    warehouseRowTotals?: PivotRowTotalsByIndex;
    columnLimit?: number;
    parameters?: ParametersValuesMap;
}): PivotData => {
    if (rows.length === 0) {
        throw new Error('Cannot convert SQL pivoted results with no rows');
    }

    const hiddenMetricFieldIds = pivotConfig.hiddenMetricFieldIds || [];
    const hiddenDimensionFieldIds = pivotConfig.hiddenDimensionFieldIds || [];
    const { visibleMetricFieldIds } = pivotConfig;
    const columnOrder = pivotConfig.columnOrder || [];

    const isMetricVisibleInPivot = (fieldId: string): boolean => {
        if (visibleMetricFieldIds) {
            return visibleMetricFieldIds.includes(fieldId);
        }
        return !hiddenMetricFieldIds.includes(fieldId);
    };

    const isDimVisibleInPivot = (fieldId: string): boolean =>
        !hiddenDimensionFieldIds.includes(fieldId);

    // Extract information from pivot details metadata. Row-index dims that the
    // user has hidden are dropped from the rendered index column list — the
    // underlying SQL row grouping is unchanged, so data rows still align with
    // the visible index values; we just don't render the hidden column.
    let indexColumns: string[];
    if (pivotDetails.indexColumn) {
        if (Array.isArray(pivotDetails.indexColumn)) {
            indexColumns = pivotDetails.indexColumn
                .map((col) => col.reference)
                .filter(isDimVisibleInPivot)
                .sort(
                    (a, b) => columnOrder.indexOf(a) - columnOrder.indexOf(b),
                );
        } else {
            indexColumns = isDimVisibleInPivot(
                pivotDetails.indexColumn.reference,
            )
                ? [pivotDetails.indexColumn.reference]
                : [];
        }
    } else {
        indexColumns = [];
    }

    // Full index references (including hidden index dims). The warehouse row
    // total query groups by ALL index dims, and the source pivot rows are
    // grouped the same way (hiding only affects rendering), so the lookup key
    // must use every index dim — not just the visible `indexColumns`.
    let allIndexColumnRefs: string[] = [];
    if (pivotDetails.indexColumn) {
        allIndexColumnRefs = Array.isArray(pivotDetails.indexColumn)
            ? pivotDetails.indexColumn.map((col) => col.reference)
            : [pivotDetails.indexColumn.reference];
    }

    // Filter value columns: visibleMetricFieldIds (allowlist) takes precedence
    // over hiddenMetricFieldIds (blocklist). Cartesian charts use the allowlist
    // to exclude sort-only metrics injected for pivot sorting (PROD-6906).
    let filteredValuesColumns = pivotDetails.valuesColumns.filter(
        ({ referenceField }) => isMetricVisibleInPivot(referenceField),
    );

    // Apply column limit: keep only the first N unique pivot column groups
    if (columnLimit !== undefined && columnLimit > 0) {
        const seenGroups = new Set<string>();
        filteredValuesColumns = filteredValuesColumns.filter((col) => {
            const groupKey = col.pivotValues
                .map(
                    ({ referenceField, value }) => `${referenceField}:${value}`,
                )
                .join('|');
            if (!seenGroups.has(groupKey)) {
                if (seenGroups.size >= columnLimit) return false;
                seenGroups.add(groupKey);
            }
            return true;
        });
    }

    // Get unique base metrics from valuesColumns, preserving order
    const baseMetricsArray = filteredValuesColumns
        .map((col) => col.referenceField)
        .filter((field, index, self) => self.indexOf(field) === index)
        .sort((a, b) => columnOrder.indexOf(a) - columnOrder.indexOf(b));

    // pivotDetails.groupByColumns comes from PivotConfiguration.groupByColumns,
    // which only contains VISIBLE pivot-column dims. Hidden pivot-column dims
    // that drive sort order (sortOnlyDimensions in PivotConfiguration) are
    // deliberately excluded from groupByColumns before this point, so they
    // never appear as column header rows here. No extra filtering needed.
    const headerValueTypes = getHeaderValueTypes({
        metricsAsRows: pivotConfig.metricsAsRows,
        pivotDimensionNames: (pivotDetails.groupByColumns ?? []).map(
            ({ reference }) => reference,
        ),
    });

    const indexValueTypes: PivotData['indexValueTypes'] =
        pivotConfig.metricsAsRows
            ? [
                  ...indexColumns.map((col) => ({
                      type: FieldType.DIMENSION as const,
                      fieldId: col,
                  })),
                  { type: FieldType.METRIC as const },
              ]
            : indexColumns.map((col) => ({
                  type: FieldType.DIMENSION as const,
                  fieldId: col,
              }));

    // Build header values (pivot dimension values)
    const headerValues: PivotData['headerValues'] = [];
    pivotDetails.groupByColumns?.forEach(({ reference }, index) => {
        headerValues.push([]);
        let columns = filteredValuesColumns;
        if (pivotConfig.metricsAsRows) {
            // For metrics as rows, we only need unique combinations of pivot values, excluding per metric duplicates
            columns = Array.from(
                new Map(
                    columns.map((col) => [
                        col.pivotValues
                            .map(
                                ({ referenceField, value }) =>
                                    `${referenceField}:${value}`,
                            )
                            .join('|'),
                        col,
                    ]),
                ).values(),
            );
        }
        columns.forEach(({ pivotValues, pivotColumnName }) => {
            const pivotValue = pivotValues.find(
                ({ referenceField }) => referenceField === reference,
            );
            if (pivotValue) {
                const field = getField(pivotValue.referenceField);
                const formattedValue =
                    pivotValue.formatted ||
                    (field
                        ? formatItemValue(
                              field,
                              pivotValue.value,
                              true,
                              parameters,
                          )
                        : String(pivotValue.value));
                const allColumnsWithSamePivotValues = columns.filter(
                    (matchingColumn) => {
                        const referencesToMatch = (
                            pivotDetails.groupByColumns || []
                        )
                            .map((groupByColumn) => groupByColumn.reference)
                            .slice(0, index + 1);
                        // Match all pivot values
                        return referencesToMatch.every((referenceToMatch) => {
                            const pivotValueA = pivotValues.find(
                                ({ referenceField: referenceField3 }) =>
                                    referenceField3 === referenceToMatch,
                            );
                            const pivotValueB = matchingColumn.pivotValues.find(
                                ({ referenceField: referenceField3 }) =>
                                    referenceField3 === referenceToMatch,
                            );
                            return pivotValueA?.value === pivotValueB?.value;
                        });
                    },
                );
                const isFirstInGroup =
                    allColumnsWithSamePivotValues[0].pivotColumnName ===
                    pivotColumnName;
                headerValues[index].push({
                    type: 'value' as const,
                    fieldId: reference,
                    value: {
                        raw: pivotValue.value,
                        formatted: formattedValue,
                    },
                    colSpan: isFirstInGroup
                        ? allColumnsWithSamePivotValues.length
                        : 0,
                });
            }
        });
    });

    // Add metric labels for columns if not metrics as rows
    if (!pivotConfig.metricsAsRows && baseMetricsArray.length > 0) {
        headerValues.push(
            filteredValuesColumns
                .sort((a, b) => {
                    const columnIndexSort =
                        Number(a.columnIndex) - Number(b.columnIndex);
                    const columnOrderSort =
                        columnOrder.indexOf(a.referenceField) -
                        columnOrder.indexOf(b.referenceField);

                    return columnIndexSort || columnOrderSort;
                })
                .map(({ referenceField }) => ({
                    type: 'label' as const,
                    fieldId: referenceField,
                })),
        );
    }

    const filteredHeaderValues = headerValues.filter((row) => row.length > 0);

    // Build index values (row identifiers)
    let indexValues: PivotData['indexValues'];

    if (pivotConfig.metricsAsRows) {
        indexValues = rows.reduce<PivotData['indexValues']>((acc, row) => {
            // multiply rows per metric
            baseMetricsArray.forEach((metric) => {
                acc.push([
                    ...indexColumns.map((col) => ({
                        type: 'value' as const,
                        fieldId: col,
                        value: row[col].value,
                        colSpan: 1,
                    })),
                    {
                        type: 'label' as const,
                        fieldId: metric,
                    },
                ]);
            });
            return acc;
        }, []);
    } else {
        indexValues = rows.map((row) =>
            indexColumns.map((col) => ({
                type: 'value' as const,
                fieldId: col,
                value: row[col].value,
                colSpan: 1,
            })),
        );
    }

    // Build data values (the actual pivot data)
    let dataValues: PivotData['dataValues'];
    const rowIndices: RecursiveRecord<number> = {};
    let rowCount = 0;

    // Get unique columns
    const uniqueColumns = pivotConfig.metricsAsRows
        ? Array.from(
              new Map(
                  filteredValuesColumns.map((col) => [
                      col.pivotValues
                          .map(
                              ({ referenceField, value }) =>
                                  `${referenceField}:${value}`,
                          )
                          .join('|'),
                      col,
                  ]),
              ).values(),
          )
        : filteredValuesColumns;

    if (pivotConfig.metricsAsRows) {
        // multiply rows per metric
        dataValues = rows.reduce<PivotData['dataValues']>((acc, row) => {
            baseMetricsArray.forEach((metric) => {
                const indexRowValues = [
                    ...indexColumns.map((fieldId) =>
                        String(row[fieldId].value.raw),
                    ),
                    metric,
                ];

                // Build row data for this metric using unique columns
                // For each unique column combination, find the corresponding value for this metric
                const rowData = uniqueColumns.map((uniqueCol) => {
                    // Find the actual column in sortedValuesColumns that matches this unique combination and metric
                    const matchingColumn = filteredValuesColumns.find(
                        (col) =>
                            col.referenceField === metric &&
                            col.pivotValues.every((pv) =>
                                uniqueCol.pivotValues.some(
                                    (upv) =>
                                        upv.referenceField ===
                                            pv.referenceField &&
                                        upv.value === pv.value,
                                ),
                            ),
                    );

                    return matchingColumn && row[matchingColumn.pivotColumnName]
                        ? (reformatCellWithParameters(
                              row[matchingColumn.pivotColumnName].value,
                              getField(metric),
                              parameters,
                          ) ?? null)
                        : null;
                });

                acc.push(rowData);
                setIndexByKey(rowIndices, indexRowValues, rowCount);
                rowCount += 1;
            });
            return acc;
        }, []);
    } else {
        dataValues = rows.map((row, rowIndex) => {
            const indexRowValues = indexColumns.map((fieldId) =>
                String(row[fieldId].value.raw),
            );
            setIndexByKey(rowIndices, indexRowValues, rowIndex);

            return filteredValuesColumns.map((valueCol) =>
                row[valueCol.pivotColumnName]
                    ? (reformatCellWithParameters(
                          row[valueCol.pivotColumnName].value,
                          getField(valueCol.referenceField),
                          parameters,
                      ) ?? null)
                    : null,
            );
        });
        rowCount = rows.length;
    }

    const fullPivotConfig: PivotConfig = {
        pivotDimensions:
            pivotDetails.groupByColumns?.map((col) => col.reference) || [],
        metricsAsRows: pivotConfig.metricsAsRows || false,
        columnOrder: pivotConfig.columnOrder,
        hiddenMetricFieldIds: pivotConfig.hiddenMetricFieldIds || [],
        ...(pivotConfig.visibleMetricFieldIds && {
            visibleMetricFieldIds: pivotConfig.visibleMetricFieldIds,
        }),
        columnTotals: pivotConfig.columnTotals,
        rowTotals: pivotConfig.rowTotals,
    };

    // Compute row totals if requested
    let rowTotalFields: PivotData['rowTotalFields'];
    let rowTotals: PivotData['rowTotals'];
    const hasHeader = headerValueTypes.length > 0;
    const hasIndex = indexValueTypes.length > 0;
    const N_DATA_ROWS = hasIndex ? dataValues.length : 1;
    const N_DATA_COLUMNS = hasHeader ? uniqueColumns.length : 1;

    const summableMetricFieldIds = baseMetricsArray.filter((metricId) => {
        const field = getField(metricId);

        // Skip if field is not found or is a dimension or is hidden
        if (!field || isDimension(field)) return false;
        if (!isMetricVisibleInPivot(metricId)) return false;

        return isSummable(field);
    });

    if (fullPivotConfig.rowTotals && hasHeader) {
        // Row totals are exclusively warehouse-computed: look up the value for a
        // (source row, metric) pair in `warehouseRowTotals`, keyed by the row's
        // index-dim values. Returns null when no warehouse value is available
        // (e.g. still loading, errored, or the source query can't be totalled)
        // — there is no client-side fallback, so the cell renders blank.
        const warehouseRowTotalValue = (
            sourceRowIndex: number,
            metricFieldId: string | undefined,
        ): number | null => {
            if (!warehouseRowTotals || !metricFieldId) return null;
            const warehouseRow =
                warehouseRowTotals[
                    buildPivotRowTotalKey(
                        allIndexColumnRefs.map((ref) => [
                            ref,
                            rows[sourceRowIndex]?.[ref]?.value?.raw,
                        ]),
                    )
                ];
            if (!warehouseRow) return null;
            // The totals query column carries the metric aggregation suffix
            // (`<metric>_any` for Lightdash metrics, matching PivotQueryBuilder
            // naming); fall back to the bare id.
            const value =
                warehouseRow[`${metricFieldId}_any`] ??
                warehouseRow[metricFieldId];
            return typeof value === 'number' ? value : null;
        };

        if (fullPivotConfig.metricsAsRows) {
            const N_TOTAL_COLS = 1;
            const N_TOTAL_ROWS = headerValues.length;
            const N_METRICS = baseMetricsArray.length;

            rowTotalFields = create2DArray(N_TOTAL_ROWS, N_TOTAL_COLS);
            rowTotals = create2DArray(N_DATA_ROWS, N_TOTAL_COLS);

            // set the last header cell as the "Total"
            rowTotalFields[N_TOTAL_ROWS - 1][N_TOTAL_COLS - 1] = {
                fieldId: undefined,
            };

            // Output rows fan out one per metric per source row (see indexValues
            // construction), so row `i` is source `floor(i / N)` × metric `i % N`.
            rowTotals = rowTotals.map((row, rowIndex) =>
                row.map(() => {
                    if (N_METRICS === 0) return null;
                    const sourceRowIndex = Math.floor(rowIndex / N_METRICS);
                    const metricFieldId =
                        baseMetricsArray[rowIndex % N_METRICS];
                    return warehouseRowTotalValue(
                        sourceRowIndex,
                        metricFieldId,
                    );
                }),
            );
        } else {
            // One total column per visible base metric.
            const N_TOTAL_COLS = baseMetricsArray.length;
            const N_TOTAL_ROWS = headerValues.length;

            rowTotalFields = create2DArray(N_TOTAL_ROWS, N_TOTAL_COLS);
            rowTotals = create2DArray(rows.length, N_TOTAL_COLS);

            baseMetricsArray.forEach((fieldId, metricIndex) => {
                rowTotalFields![N_TOTAL_ROWS - 1][metricIndex] = {
                    fieldId,
                };
            });

            rowTotals = rowTotals.map((row, rowIndex) =>
                row.map((_, totalColIndex) =>
                    warehouseRowTotalValue(
                        rowIndex,
                        rowTotalFields![N_TOTAL_ROWS - 1][totalColIndex]
                            ?.fieldId,
                    ),
                ),
            );
        }
    }

    const { columnTotalFields, columnTotals } = getColumnTotals({
        summableMetricFieldIds,
        totalColumns: indexValueTypes.length,
        dataColumns: N_DATA_COLUMNS,
        dataValues,
        rowIndices,
        pivotConfig,
        indexValues,
        hasIndex,
    });

    // Passthrough dims — hidden non-sort pivot dims whose raw values are
    // carried on each row so cross-field richText / image templates can
    // resolve `row.<table>.<field>.raw` even though the dim has no rendered
    // column. Backend AsyncQueryService writes these values onto each row
    // under the field's natural reference.
    //
    // Two sources:
    //   1. `pivotDetails.passthroughDimensions` — set by the backend when the
    //      query was built with the field already in `passthroughDimensions`.
    //   2. `hiddenDimensionFieldIds` ∩ row keys — handles the "user just hid
    //      a previously-visible dim and the cached results haven't refetched
    //      yet" case: the row data still carries the value from when the dim
    //      was visible, so we can opt it into passthrough on the fly. This
    //      makes the image stay rendered immediately on hide without
    //      requiring a re-run of the query.
    //
    // Note: we don't add them to allCombinedData / pivotColumnInfo here —
    // combinedRetrofit (below) rebuilds both, so additions here would be
    // discarded. The merge happens post-combinedRetrofit.
    const declaredPassthroughs = pivotDetails.passthroughDimensions ?? [];
    const declaredPassthroughRefs = new Set(
        declaredPassthroughs.map((d) => d.reference),
    );
    const groupByRefs = new Set(
        (pivotDetails.groupByColumns ?? []).map((c) => c.reference),
    );
    // Use the RAW `pivotDetails.indexColumn` (pre-filter), not the local
    // `indexColumns` array which already has hidden refs removed via
    // `isDimVisibleInPivot`. We're trying to detect "this field is
    // structurally an indexColumn in the cached pivot shape", and the
    // filtered list would always say "not present" for hidden fields.
    const indexColumnRefs = new Set<string>();
    if (pivotDetails.indexColumn) {
        if (Array.isArray(pivotDetails.indexColumn)) {
            for (const col of pivotDetails.indexColumn) {
                indexColumnRefs.add(col.reference);
            }
        } else {
            indexColumnRefs.add(pivotDetails.indexColumn.reference);
        }
    }
    const firstRow = rows[0];
    const inferredPassthroughs: typeof declaredPassthroughs = firstRow
        ? hiddenDimensionFieldIds
              .filter(
                  (fieldId) =>
                      !declaredPassthroughRefs.has(fieldId) &&
                      !groupByRefs.has(fieldId) &&
                      !indexColumnRefs.has(fieldId) &&
                      firstRow[fieldId] !== undefined,
              )
              .map((fieldId) => ({ reference: fieldId }))
        : [];
    const passthroughDimensions = [
        ...declaredPassthroughs,
        ...inferredPassthroughs,
    ];

    // Build retrofit data for backwards compatibility
    const allCombinedData = rows
        .map((row) => {
            const combinedRow: ResultRow = {};

            // Add index columns
            indexColumns.forEach((col) => {
                combinedRow[col] = row[col];
            });

            if (pivotConfig.metricsAsRows) {
                // Add metric label with correct index (after all index columns)
                const labelIndex = indexColumns.length;
                const metricLabel =
                    getFieldLabel(baseMetricsArray[0]) || baseMetricsArray[0];
                combinedRow[`label-${labelIndex}`] = {
                    value: {
                        raw: metricLabel,
                        formatted: metricLabel,
                    },
                };
            }

            // Add data columns with generated field IDs using metadata
            filteredValuesColumns.forEach((valueCol, colIndex) => {
                const pivotDimensions = (pivotDetails.groupByColumns || []).map(
                    (col) => col.reference,
                );
                const fieldId = pivotConfig.metricsAsRows
                    ? `${pivotDimensions.join('__')}__${colIndex}`
                    : `${pivotDimensions.join('__')}__${
                          valueCol.referenceField
                      }__${colIndex}`;

                if (row[valueCol.pivotColumnName]) {
                    const cell = row[valueCol.pivotColumnName];
                    const reformatted = reformatCellWithParameters(
                        cell.value,
                        getField(valueCol.referenceField),
                        parameters,
                    );
                    // Helper short-circuits to the input value reference when
                    // no reformat is needed — fall back to `cell` in that case
                    // so we don't allocate a fresh wrapper per non-parameterised
                    // cell.
                    combinedRow[fieldId] =
                        reformatted && reformatted !== cell.value
                            ? { value: reformatted }
                            : cell;
                }
            });

            return combinedRow;
        })
        .map((combinedRow, rowIndex) => {
            // Add row totals if enabled
            if (fullPivotConfig.rowTotals && rowTotals) {
                const rowTotalValue = rowTotals[rowIndex]?.[0];
                if (rowTotalValue !== undefined) {
                    const field = getField(baseMetricsArray[0]);
                    const formattedValue = field
                        ? formatItemValue(
                              field,
                              rowTotalValue,
                              false,
                              parameters,
                          )
                        : String(rowTotalValue);

                    return {
                        ...combinedRow,
                        'row-total-0': {
                            value: {
                                raw: rowTotalValue,
                                formatted: formattedValue,
                            },
                        },
                    };
                }
            }
            return combinedRow;
        });

    const pivotColumnInfo: PivotColumn[] = [
        ...indexColumns.map((col) => ({
            fieldId: col,
            baseId: undefined,
            underlyingId: undefined,
            columnType: 'indexValue' as const,
        })),
        ...(pivotConfig.metricsAsRows
            ? [
                  {
                      fieldId: `label-${indexColumns.length}`,
                      baseId: undefined,
                      underlyingId: undefined,
                      columnType: 'label' as const,
                  },
              ]
            : []),
        ...filteredValuesColumns.map((valueCol, colIndex) => {
            const pivotDimensions = (pivotDetails.groupByColumns || []).map(
                (col) => col.reference,
            );
            const fieldId = pivotConfig.metricsAsRows
                ? `${pivotDimensions.join('__')}__${colIndex}`
                : `${pivotDimensions.join('__')}__${
                      valueCol.referenceField
                  }__${colIndex}`;

            return {
                fieldId,
                baseId: pivotConfig.metricsAsRows
                    ? pivotDimensions[0]
                    : valueCol.referenceField,
                underlyingId: undefined,
                columnType: undefined,
            };
        }),
        ...(fullPivotConfig.rowTotals
            ? [
                  {
                      fieldId: 'row-total-0',
                      baseId: 'row-total-0',
                      underlyingId: undefined,
                      columnType: 'rowTotal' as const,
                  },
              ]
            : []),
    ];

    const titleFields = getTitleFields({
        hasIndex,
        hasHeader,
        headerValueTypes,
        indexValueTypes,
    });

    const pivotData: PivotData = {
        titleFields,
        headerValueTypes,
        headerValues: filteredHeaderValues,
        indexValueTypes,
        indexValues,
        dataColumnCount: N_DATA_COLUMNS,
        dataValues,
        rowTotalFields,
        columnTotalFields,
        rowTotals,
        columnTotals,
        cellsCount: pivotConfig.metricsAsRows
            ? indexColumns.length +
              1 + // label column
              uniqueColumns.length +
              (rowTotals ? rowTotals[0].length : 0)
            : indexColumns.length +
              uniqueColumns.length +
              (rowTotals ? rowTotals[0].length : 0),
        rowsCount: pivotConfig.metricsAsRows
            ? rows.length * baseMetricsArray.length
            : rows.length,
        pivotConfig: fullPivotConfig,
        retrofitData: {
            allCombinedData,
            pivotColumnInfo,
        },
        groupedSubtotals,
    };

    const retrofitted = combinedRetrofit(
        pivotData,
        getField,
        getFieldLabel,
        parameters,
    );

    // combinedRetrofit rebuilds retrofitData.{allCombinedData,pivotColumnInfo}
    // from indexValues + dataValues + rowTotals, so any passthrough additions
    // we made earlier are gone. Re-attach them here:
    //   - Append passthrough entries to pivotColumnInfo so PivotTable
    //     registers a TanStack column (hidden via columnVisibility).
    //   - Merge passthrough values from the corresponding input row onto
    //     each output row (1-to-1 by index — convertSqlPivotedRowsToPivotData
    //     emits one output row per input row).
    //
    // INVARIANT: combinedRetrofit.retrofitData.allCombinedData.length must
    // equal rows.length — the positional merge below depends on this. If
    // anyone adds row coalescing inside combinedRetrofit (or upstream changes
    // how SQL-pivoted rows fan out), passthrough values would silently shift
    // to the wrong row. The dev-mode warn below catches that during testing
    // without crashing prod for users.
    if (passthroughDimensions.length > 0) {
        // In metricsAsRows mode, combinedRetrofit fans each input row out to
        // baseMetricsArray.length output rows (one per metric). The positional
        // merge below must divide the output index by that factor to land back
        // on the originating input row — otherwise each metric row reads the
        // passthrough value from a *different* input row, surfacing as
        // mismatched images / cross-field template values for repeated row
        // dims (PROD-7873 follow-up to PR #23452).
        const inputRowsPerOutputRow =
            pivotConfig.metricsAsRows && baseMetricsArray.length > 0
                ? baseMetricsArray.length
                : 1;
        const expectedOutputLength = rows.length * inputRowsPerOutputRow;
        if (
            process.env.NODE_ENV !== 'production' &&
            retrofitted.retrofitData.allCombinedData.length !==
                expectedOutputLength
        ) {
            // eslint-disable-next-line no-console
            console.warn(
                `[pivot] passthrough positional merge invariant violated: ` +
                    `allCombinedData.length=${retrofitted.retrofitData.allCombinedData.length} ` +
                    `!= rows.length*metricsFanout=${expectedOutputLength} ` +
                    `(rows.length=${rows.length}, fanout=${inputRowsPerOutputRow}). ` +
                    `Passthrough values may be attached to the wrong rows. ` +
                    `Investigate combinedRetrofit for row coalescing.`,
            );
        }
        retrofitted.retrofitData.pivotColumnInfo = [
            ...retrofitted.retrofitData.pivotColumnInfo,
            ...passthroughDimensions.map((dim) => ({
                fieldId: dim.reference,
                baseId: dim.reference,
                underlyingId: undefined,
                columnType: 'passthrough' as const,
            })),
        ];
        retrofitted.retrofitData.allCombinedData =
            retrofitted.retrofitData.allCombinedData.map(
                (combinedRow, rowIndex) => {
                    const inputRow =
                        rows[Math.floor(rowIndex / inputRowsPerOutputRow)];
                    if (!inputRow) return combinedRow;
                    const enriched: ResultRow = { ...combinedRow };
                    for (const dim of passthroughDimensions) {
                        const value = inputRow[dim.reference];
                        if (value !== undefined) {
                            enriched[dim.reference] = value;
                        }
                    }
                    return enriched;
                },
            );
    }

    return retrofitted;
};

export type PivotResultsDataCell = {
    raw: unknown;
    formatted: string;
    fieldId: string;
};

export type PivotResultsData = {
    headers: string[][];
    dataRows: Array<Array<PivotResultsDataCell>>;
    fieldIds: string[];
    hasIndex: boolean;
};

const NATIVE_DATE_TIME_FRAMES = new Set<TimeFrames>([
    TimeFrames.YEAR,
    TimeFrames.MONTH,
    TimeFrames.DAY,
    TimeFrames.HOUR,
    TimeFrames.MINUTE,
    TimeFrames.SECOND,
    TimeFrames.MILLISECOND,
    TimeFrames.RAW,
]);

export function timeIntervalToExcelNumFmt(
    timeInterval: TimeFrames | undefined,
    dimensionType: DimensionType,
): string | null {
    if (timeInterval && !NATIVE_DATE_TIME_FRAMES.has(timeInterval)) {
        return null;
    }

    switch (timeInterval) {
        case TimeFrames.YEAR:
            return 'yyyy';
        case TimeFrames.MONTH:
            return 'yyyy-mm';
        case TimeFrames.DAY:
            return 'yyyy-mm-dd';
        case TimeFrames.HOUR:
            return 'yyyy-mm-dd hh:00';
        case TimeFrames.MINUTE:
            return 'yyyy-mm-dd hh:mm';
        case TimeFrames.SECOND:
            return 'yyyy-mm-dd hh:mm:ss';
        case TimeFrames.MILLISECOND:
            return 'yyyy-mm-dd hh:mm:ss.000';
        case TimeFrames.RAW:
        case undefined:
            return dimensionType === DimensionType.TIMESTAMP
                ? 'yyyy-mm-dd hh:mm:ss'
                : 'yyyy-mm-dd';
        default:
            return null;
    }
}

type PivotResultsParams = {
    pivotConfig: PivotConfig;
    pivotDetails: NonNullable<ReadyQueryResultsPage['pivotDetails']>;
    rows: ResultRow[];
    itemMap: ItemsMap;
    customLabels: Record<string, string> | undefined;
    onlyRaw: boolean;
    undefinedCharacter?: string;
    // When set + onlyRaw + the cell's field is TIMESTAMP, the emitted value
    // is the warehouse instant shifted into the project tz with an explicit
    // offset suffix. No-op for other modes / fields.
    timezone?: string;
    // When true, shiftable temporal cells (header + body, both modes) emit
    // the wall-clock format spreadsheet apps auto-detect as a date.
    formatTemporalsForSpreadsheet?: boolean;
};

export const pivotResultsAsData = ({
    pivotConfig,
    rows,
    itemMap,
    customLabels,
    onlyRaw,
    undefinedCharacter = '',
    pivotDetails,
    timezone,
    formatTemporalsForSpreadsheet = false,
}: PivotResultsParams): PivotResultsData => {
    const getFieldLabel = (fieldId: string) => {
        const customLabel = customLabels?.[fieldId];
        if (customLabel !== undefined) return customLabel;
        const field = itemMap[fieldId];
        return (field && isField(field) && field?.label) || fieldId;
    };
    const pivotedResults = convertSqlPivotedRowsToPivotData({
        getField: (fieldId: string) => itemMap && itemMap[fieldId],
        getFieldLabel,
        rows,
        pivotDetails,
        pivotConfig,
        groupedSubtotals: undefined,
    });

    const formatField = onlyRaw ? 'raw' : 'formatted';
    const pickValue = (
        cellValue: ResultValue | undefined,
        fieldId: string,
    ): string => {
        const item = itemMap[fieldId];
        if (formatTemporalsForSpreadsheet) {
            const spreadsheetTemporal = formatTemporalCellForSpreadsheet(
                item,
                cellValue?.raw,
                timezone,
            );
            if (spreadsheetTemporal !== undefined) return spreadsheetTemporal;
        }
        const base = (cellValue?.[formatField] as string) ?? '';
        if (!onlyRaw || !timezone) return base;
        if (!shouldShiftItemTimezone(item)) return base;
        const shifted = toIsoWithProjectOffset(cellValue?.raw, timezone);
        return shifted ?? base;
    };
    const headers = pivotedResults.headerValues.reduce<string[][]>(
        (acc, row, i) => {
            const values = row.map((header) =>
                'value' in header
                    ? pickValue(header.value, header.fieldId)
                    : getFieldLabel(header.fieldId),
            );
            const fields = pivotedResults.titleFields[i];
            const fieldLabels = fields.map((field) =>
                field ? getFieldLabel(field.fieldId) : undefinedCharacter,
            );

            const rowTotalLabels =
                pivotedResults.rowTotalFields?.[i]?.map((totalField) =>
                    totalField?.fieldId
                        ? `Total ${getFieldLabel(totalField.fieldId)}`
                        : 'Total',
                ) || [];

            acc[i] = [...fieldLabels, ...values, ...rowTotalLabels];
            return acc;
        },
        [[]],
    );

    // Passthrough columns are registered in pivotColumnInfo so the pivot
    // table can render cross-field richText / image templates that read
    // `row.<table>.<field>.raw`. They must NOT appear in CSV / XLSX
    // exports — the user explicitly hid the column from the visualization,
    // and the "hide" semantic includes exports. Filtered here so every
    // downstream consumer of pivotResultsAsData (CSV, XLSX, etc.) inherits
    // the exclusion.
    const fieldIds = Object.values(pivotedResults.retrofitData.pivotColumnInfo)
        .filter((field) => field.columnType !== 'passthrough')
        .map((field) => field.fieldId);

    const hasIndex = pivotedResults.indexValues.length > 0;
    const dataRows = pivotedResults.retrofitData.allCombinedData.map((row) => {
        const noIndexPrefix: PivotResultsDataCell[] = hasIndex
            ? []
            : [{ raw: '', formatted: '', fieldId: '' }];
        const cells: PivotResultsDataCell[] = fieldIds.map((fieldId) => ({
            raw: row[fieldId]?.value?.raw ?? '',
            formatted:
                pickValue(row[fieldId]?.value, fieldId) || undefinedCharacter,
            fieldId,
        }));
        return [...noIndexPrefix, ...cells];
    });

    return { headers, dataRows, fieldIds, hasIndex };
};

export const pivotResultsAsCsv = (params: PivotResultsParams) => {
    const data = pivotResultsAsData(params);

    const pivotedRows: string[][] = data.dataRows.map((row) =>
        row.map((cell) => cell.formatted),
    );

    return [...data.headers, ...pivotedRows];
};
