import isNumber from 'lodash/isNumber';
import last from 'lodash/last';
import { type Entries } from 'type-fest';
import type { ReadyQueryResultsPage } from '../index';
import { UnexpectedIndexError, UnexpectedServerError } from '../types/errors';
import {
    FieldType,
    isDimension,
    isField,
    isSummable,
    type ItemsMap,
} from '../types/field';
import { type MetricQuery } from '../types/metricQuery';
import {
    type PivotColumn,
    type PivotConfig,
    type PivotData,
    type TotalField,
} from '../types/pivot';
import { type ResultRow, type ResultValue } from '../types/results';
import { getArrayValue, getObjectValue } from '../utils/accessors';
import { formatItemValue } from '../utils/formatting';

type FieldFunction = (fieldId: string) => ItemsMap[string] | undefined;

type FieldLabelFunction = (fieldId: string) => string | undefined;

type PivotQueryResultsArgs = {
    pivotConfig: PivotConfig;
    metricQuery: Pick<
        MetricQuery,
        | 'dimensions'
        | 'metrics'
        | 'tableCalculations'
        | 'additionalMetrics'
        | 'customDimensions'
    >;
    rows: ResultRow[];
    groupedSubtotals?: Record<string, Record<string, number>[]>;
    options: {
        maxColumns: number;
    };
    getField: FieldFunction;
    getFieldLabel: FieldLabelFunction;
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

const getIndexByKey = (
    obj: RecursiveRecord<number>,
    keys: string[],
): number => {
    if (keys.length === 0) {
        throw new Error('Cannot get key from empty keys array');
    }

    const [key, ...rest] = keys;
    if (key === undefined) {
        throw new UnexpectedServerError(
            `getIndexByKey: Cannot get key from keys ${keys.length}`,
        );
    }
    if (rest.length === 0) {
        const value = obj[key];

        if (typeof value !== 'number') {
            throw new Error('Expected a number');
        } else {
            return value;
        }
    } else {
        const nextObj = obj[key];
        if (isRecursiveRecord(nextObj)) {
            return getIndexByKey(nextObj, rest);
        }
        throw new Error('Expected a RecursiveRecord object');
    }
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

const getAllIndices = (obj: RecursiveRecord<number>): number[] =>
    Object.values(obj).reduce<number[]>((acc, value) => {
        if (isNumber(value)) {
            return [...acc, value];
        }
        return [...acc, ...getAllIndices(value)];
    }, []);

const getAllIndicesByKey = (
    obj: RecursiveRecord<number>,
    keys: string[],
): number[] => {
    const [key, ...rest] = keys;
    if (key === undefined) {
        throw new UnexpectedIndexError('Cannot set key on undefined');
    }
    if (rest.length === 0) {
        const value = getObjectValue(obj, key);
        if (isNumber(value)) {
            return [value];
        }
        return getAllIndices(value);
    }
    const nextObj = obj[key];
    if (isRecursiveRecord(nextObj)) {
        return getAllIndicesByKey(nextObj, rest);
    }
    throw new Error('Expected a RecursiveRecord object');
};

const getColSpanByKey = (
    currentColumnPosition: number,
    obj: RecursiveRecord<number>,
    keys: string[],
): number => {
    const allIndices = getAllIndicesByKey(obj, keys).sort((a, b) => a - b);

    if (allIndices.length === 0) {
        throw new Error('Cannot get span from empty indices array');
    }

    const currentColumnPositionIndex: number | undefined = allIndices.indexOf(
        currentColumnPosition,
    );
    const previousColumnPosition: number | undefined =
        allIndices[currentColumnPositionIndex - 1];

    if (currentColumnPositionIndex < 0) {
        throw new Error(
            'Cannot get span for index that does not exist in indices array',
        );
    }

    const isFirstColInSpan =
        !isNumber(previousColumnPosition) ||
        previousColumnPosition !== currentColumnPosition - 1;

    if (!isFirstColInSpan) {
        return 0;
    }

    return allIndices
        .slice(currentColumnPositionIndex)
        .reduce<number>((acc, curr, i) => {
            if (curr === currentColumnPosition + i) {
                return acc + 1;
            }
            return acc;
        }, 0);
};

const combinedRetrofit = (
    data: PivotData,
    getField: FieldFunction,
    getFieldLabel: FieldLabelFunction,
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

    const getMetricAsRowTotalValueFromAxis = (
        total: unknown,
        rowIndex: number,
    ): ResultValue | null => {
        const value = last(data.indexValues[rowIndex]);
        if (!value || !value.fieldId) throw new Error('Invalid pivot data');

        const item = getField(value.fieldId);
        if (!isSummable(item)) {
            return null;
        }
        const formattedValue = formatItemValue(item, total, false, undefined);

        return {
            raw: total,
            formatted: formattedValue,
        };
    };

    const getRowTotalValueFromAxis = (
        field: TotalField | undefined,
        total: unknown,
    ): ResultValue => {
        if (!field || !field.fieldId) throw new Error('Invalid pivot data');
        const item = getField(field.fieldId);

        const formattedValue = formatItemValue(item, total, false, undefined);

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

export const pivotQueryResults = ({
    pivotConfig,
    metricQuery,
    rows,
    options,
    getField,
    getFieldLabel,
    groupedSubtotals,
}: PivotQueryResultsArgs): PivotData => {
    if (rows.length === 0) {
        throw new Error('Cannot pivot results with no rows');
    }

    const hiddenMetricFieldIds = pivotConfig.hiddenMetricFieldIds || [];

    const summableMetricFieldIds = metricQuery.metrics.filter((metricId) => {
        const field = getField(metricId);

        // Skip if field is not found or is a dimension or is hidden
        if (!field || isDimension(field)) return false;
        if (hiddenMetricFieldIds.includes(metricId)) return false;

        return isSummable(field);
    });

    const columnOrder = (pivotConfig.columnOrder || []).filter(
        (id) => !hiddenMetricFieldIds.includes(id),
    );

    const dimensions = [...metricQuery.dimensions];

    // Headers (column index)
    const headerDimensions = pivotConfig.pivotDimensions.filter(
        (pivotDimension) => dimensions.includes(pivotDimension),
    );
    const headerValueTypes = getHeaderValueTypes({
        metricsAsRows: pivotConfig.metricsAsRows,
        pivotDimensionNames: headerDimensions,
    });

    // Indices (row index)
    const indexDimensions = dimensions
        .filter((d) => !pivotConfig.pivotDimensions.includes(d))
        .slice()
        .sort((a, b) => columnOrder.indexOf(a) - columnOrder.indexOf(b));
    const indexDimensionValueTypes = indexDimensions.map<{
        type: FieldType.DIMENSION;
        fieldId: string;
    }>((d) => ({
        type: FieldType.DIMENSION,
        fieldId: d,
    }));
    const indexMetricValueTypes: { type: FieldType.METRIC }[] =
        pivotConfig.metricsAsRows ? [{ type: FieldType.METRIC }] : [];
    const indexValueTypes: PivotData['indexValueTypes'] = [
        ...indexDimensionValueTypes,
        ...indexMetricValueTypes,
    ];

    // Metrics
    const metrics: { fieldId: string }[] = [
        ...metricQuery.metrics,
        ...metricQuery.tableCalculations.map((tc) => tc.name),
    ]
        .filter((m) => !hiddenMetricFieldIds.includes(m))
        .sort((a, b) => columnOrder.indexOf(a) - columnOrder.indexOf(b))
        .map((id) => ({ fieldId: id }));

    if (metrics.length === 0) {
        throw new Error('Cannot pivot results with no metrics');
    }

    const N_ROWS = rows.length;

    // For every row in the results, compute the index and header values to determine the shape of the result set
    const indexValues: PivotData['indexValues'] = [];
    const headerValuesT: PivotData['headerValues'] = [];

    const rowIndices = {};
    const columnIndices = {};
    let rowCount = 0;
    let columnCount = 0;
    for (let nRow = 0; nRow < N_ROWS; nRow += 1) {
        const row = rows[nRow];

        for (let nMetric = 0; nMetric < metrics.length; nMetric += 1) {
            const indexRowValues = indexDimensions
                .map<PivotData['indexValues'][number][number]>((fieldId) => ({
                    type: 'value',
                    fieldId,
                    value: getObjectValue(row, fieldId).value,
                    colSpan: 1,
                }))
                .concat(
                    pivotConfig.metricsAsRows
                        ? [
                              {
                                  type: 'label',
                                  fieldId: getArrayValue(metrics, nMetric)
                                      .fieldId,
                              },
                          ]
                        : [],
                );

            const headerRowValues = headerDimensions
                .map<PivotData['headerValues'][number][number]>((fieldId) => ({
                    type: 'value',
                    fieldId,
                    value: getObjectValue(row, fieldId).value,
                    colSpan: 1,
                }))
                .concat(
                    pivotConfig.metricsAsRows
                        ? []
                        : [
                              {
                                  type: 'label',
                                  fieldId: getArrayValue(metrics, nMetric)
                                      .fieldId,
                              },
                          ],
                );

            // Write the index values
            if (
                setIndexByKey(
                    rowIndices,
                    indexRowValues.map((l) =>
                        l.type === 'value' ? String(l.value?.raw) : l.fieldId,
                    ),
                    rowCount,
                )
            ) {
                rowCount += 1;
                indexValues.push(indexRowValues);
            }

            // Write the header values
            if (
                setIndexByKey(
                    columnIndices,
                    headerRowValues.map((l) =>
                        l.type === 'value' ? String(l.value.raw) : l.fieldId,
                    ),
                    columnCount,
                )
            ) {
                columnCount += 1;

                if (columnCount > options.maxColumns) {
                    throw new Error(
                        `Cannot pivot results with more than ${options.maxColumns} columns. Try adding a filter to limit your results.`,
                    );
                }

                headerValuesT.push(headerRowValues);
            }
        }
    }
    const headerValues =
        headerValuesT[0]?.map((_, colIndex) =>
            headerValuesT.map<PivotData['headerValues'][number][number]>(
                (row, rowIndex) => {
                    const cell = getArrayValue(row, colIndex);
                    if (cell.type === 'label') {
                        return cell;
                    }
                    const keys = row
                        .slice(0, colIndex + 1)
                        .reduce<string[]>(
                            (acc, l) =>
                                l.type === 'value'
                                    ? [...acc, String(l.value.raw)]
                                    : acc,
                            [],
                        );
                    const cellWithSpan: PivotData['headerValues'][number][number] =
                        {
                            ...cell,
                            colSpan: getColSpanByKey(
                                rowIndex,
                                columnIndices,
                                keys,
                            ),
                        };
                    return cellWithSpan;
                },
            ),
        ) ?? [];

    const hasIndex = indexValueTypes.length > 0;
    const hasHeader = headerValueTypes.length > 0;

    // Compute the size of the data values
    const N_DATA_ROWS = hasIndex ? rowCount : 1;
    const N_DATA_COLUMNS = hasHeader ? columnCount : 1;

    // Compute the data values
    const dataValues = create2DArray<ResultValue | null>(
        N_DATA_ROWS,
        N_DATA_COLUMNS,
    );

    if (N_DATA_ROWS === 0 || N_DATA_COLUMNS === 0) {
        throw new Error('Cannot pivot results with no data');
    }

    // Compute pivoted data
    for (let nRow = 0; nRow < N_ROWS; nRow += 1) {
        const row = rows[nRow];
        for (let nMetric = 0; nMetric < metrics.length; nMetric += 1) {
            const metric = metrics[nMetric];
            const { value } = row?.[metric.fieldId] ?? {};

            const rowKeys = [
                ...indexDimensions.map((d) => row[d].value.raw),
                ...(pivotConfig.metricsAsRows ? [metric.fieldId] : []),
            ];
            const columnKeys = [
                ...headerDimensions.map((d) => row[d].value.raw),
                ...(pivotConfig.metricsAsRows ? [] : [metric.fieldId]),
            ];

            const rowKeysString = rowKeys.map(String);
            const columnKeysString = columnKeys.map(String);

            const rowIndex = hasIndex
                ? getIndexByKey(rowIndices, rowKeysString)
                : 0;
            const columnIndex = hasHeader
                ? getIndexByKey(columnIndices, columnKeysString)
                : 0;

            dataValues[rowIndex][columnIndex] = value;
        }
    }

    // compute row totals
    let rowTotalFields: PivotData['rowTotalFields'];
    let rowTotals: PivotData['rowTotals'];
    if (pivotConfig.rowTotals && hasHeader) {
        if (pivotConfig.metricsAsRows) {
            const N_TOTAL_COLS = 1;
            const N_TOTAL_ROWS = headerValues.length;

            rowTotalFields = create2DArray(N_TOTAL_ROWS, N_TOTAL_COLS);
            rowTotals = create2DArray(N_DATA_ROWS, N_TOTAL_COLS);

            // set the last header cell as the "Total"
            rowTotalFields[N_TOTAL_ROWS - 1][N_TOTAL_COLS - 1] = {
                fieldId: undefined,
            };

            rowTotals = rowTotals.map((row, rowIndex) =>
                row.map(() =>
                    dataValues[rowIndex].reduce(
                        (acc, value) => acc + parseNumericValue(value),
                        0,
                    ),
                ),
            );
        } else {
            const N_TOTAL_COLS = summableMetricFieldIds.length;
            const N_TOTAL_ROWS = headerValues.length;

            rowTotalFields = create2DArray(N_TOTAL_ROWS, N_TOTAL_COLS);
            rowTotals = create2DArray(N_DATA_ROWS, N_TOTAL_COLS);

            summableMetricFieldIds.forEach((fieldId, metricIndex) => {
                rowTotalFields![N_TOTAL_ROWS - 1][metricIndex] = {
                    fieldId,
                };
            });

            rowTotals = rowTotals.map((row, rowIndex) =>
                row.map((_, totalColIndex) => {
                    const totalColFieldId =
                        rowTotalFields![N_TOTAL_ROWS - 1][totalColIndex]
                            ?.fieldId;
                    const valueColIndices = totalColFieldId
                        ? getAllIndicesForFieldId(
                              columnIndices,
                              totalColFieldId,
                          )
                        : [];
                    return dataValues[rowIndex]
                        .filter((__, dataValueColIndex) =>
                            valueColIndices.includes(dataValueColIndex),
                        )
                        .reduce(
                            (acc, value) => acc + parseNumericValue(value),
                            0,
                        );
                }),
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

    const titleFields = getTitleFields({
        hasIndex,
        hasHeader,
        headerValueTypes,
        indexValueTypes,
    });

    const cellsCount =
        (indexValueTypes.length === 0 ? titleFields[0].length : 0) +
        indexValueTypes.length +
        dataValues[0].length +
        (pivotConfig.rowTotals && rowTotals ? rowTotals[0].length : 0);

    const rowsCount = dataValues.length || 0;

    const pivotData: PivotData = {
        titleFields,

        headerValueTypes,
        headerValues,
        indexValueTypes,
        indexValues,

        dataColumnCount: N_DATA_COLUMNS,
        dataValues,

        rowTotalFields,
        columnTotalFields,
        rowTotals,
        columnTotals,
        cellsCount,
        rowsCount,
        pivotConfig,

        retrofitData: {
            allCombinedData: [],
            pivotColumnInfo: [],
        },
        groupedSubtotals,
    };
    return combinedRetrofit(pivotData, getField, getFieldLabel);
};

/**
 * Converts SQL-pivoted results to PivotData format
 * This handles results that are already pivoted at the SQL level (e.g., payments_total_revenue_any_bank_transfer)
 * and transforms them into the same PivotData structure as pivotQueryResults
 */
export const convertSqlPivotedRowsToPivotData = ({
    rows,
    pivotDetails,
    pivotConfig,
    getField,
    getFieldLabel,
    groupedSubtotals,
}: {
    rows: ResultRow[];
    pivotDetails: NonNullable<ReadyQueryResultsPage['pivotDetails']>;
    pivotConfig: Pick<
        PivotConfig,
        | 'rowTotals'
        | 'columnTotals'
        | 'metricsAsRows'
        | 'hiddenMetricFieldIds'
        | 'columnOrder'
    >; // only use properties that are not part of pivot details metadata
    getField: FieldFunction;
    getFieldLabel: FieldLabelFunction;
    groupedSubtotals: PivotQueryResultsArgs['groupedSubtotals'];
}): PivotData => {
    if (rows.length === 0) {
        throw new Error('Cannot convert SQL pivoted results with no rows');
    }

    const hiddenMetricFieldIds = pivotConfig.hiddenMetricFieldIds || [];
    const columnOrder = pivotConfig.columnOrder || [];

    // Extract information from pivot details metadata
    let indexColumns: string[];
    if (pivotDetails.indexColumn) {
        if (Array.isArray(pivotDetails.indexColumn)) {
            indexColumns = pivotDetails.indexColumn
                .map((col) => col.reference)
                .sort(
                    (a, b) => columnOrder.indexOf(a) - columnOrder.indexOf(b),
                );
        } else {
            indexColumns = [pivotDetails.indexColumn.reference];
        }
    } else {
        indexColumns = [];
    }

    const filteredValuesColumns = pivotDetails.valuesColumns.filter(
        ({ referenceField }) => !hiddenMetricFieldIds.includes(referenceField),
    );

    // Get unique base metrics from valuesColumns
    const baseMetricsArray = Array.from(
        new Set(filteredValuesColumns.map((col) => col.referenceField)),
    );

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
                              undefined,
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
                        ? row[matchingColumn.pivotColumnName].value
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
                    ? row[valueCol.pivotColumnName].value
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

    // Build column indices using unique columns
    const columnIndices = uniqueColumns.reduce<RecursiveRecord<number>>(
        (acc, valuesColumn, index) => {
            const pivotValues = (pivotDetails.groupByColumns || []).map(
                (col) =>
                    valuesColumn.pivotValues.find(
                        ({ referenceField }) =>
                            referenceField === col.reference,
                    )?.value,
            );

            // Create nested structure based on pivotValues
            let current = acc;
            for (let i = 0; i < pivotValues.length; i += 1) {
                const pivotValue = String(pivotValues[i]);
                if (
                    !Object.prototype.hasOwnProperty.call(current, pivotValue)
                ) {
                    Object.defineProperty(current, pivotValue, {
                        value: {},
                        writable: true,
                        enumerable: true,
                        configurable: true,
                    });
                }
                current = current[pivotValue] as RecursiveRecord<number>;
            }

            // For metricsAsRows, don't include metric in column key
            if (!pivotConfig.metricsAsRows) {
                Object.defineProperty(current, valuesColumn.referenceField, {
                    value: index,
                    writable: true,
                    enumerable: true,
                    configurable: true,
                });
            } else {
                // Use a generic key since metrics are in rows, not columns
                Object.defineProperty(current, 'value', {
                    value: index,
                    writable: true,
                    enumerable: true,
                    configurable: true,
                });
            }

            return acc;
        },
        {},
    );

    const summableMetricFieldIds = baseMetricsArray.filter((metricId) => {
        const field = getField(metricId);

        // Skip if field is not found or is a dimension or is hidden
        if (!field || isDimension(field)) return false;
        if (hiddenMetricFieldIds.includes(metricId)) return false;

        return isSummable(field);
    });

    if (fullPivotConfig.rowTotals && hasHeader) {
        if (fullPivotConfig.metricsAsRows) {
            const N_TOTAL_COLS = 1;
            const N_TOTAL_ROWS = headerValues.length;

            rowTotalFields = create2DArray(N_TOTAL_ROWS, N_TOTAL_COLS);
            rowTotals = create2DArray(N_DATA_ROWS, N_TOTAL_COLS);

            // set the last header cell as the "Total"
            rowTotalFields[N_TOTAL_ROWS - 1][N_TOTAL_COLS - 1] = {
                fieldId: undefined,
            };

            rowTotals = rowTotals.map((row, rowIndex) =>
                row.map(() =>
                    dataValues[rowIndex].reduce(
                        (acc, value) => acc + parseNumericValue(value),
                        0,
                    ),
                ),
            );
        } else {
            const N_TOTAL_COLS = summableMetricFieldIds.length;
            const N_TOTAL_ROWS = headerValues.length;

            rowTotalFields = create2DArray(N_TOTAL_ROWS, N_TOTAL_COLS);
            rowTotals = create2DArray(rows.length, N_TOTAL_COLS);

            // Set the last header cell as the "Total"
            summableMetricFieldIds.forEach((fieldId, metricIndex) => {
                rowTotalFields![N_TOTAL_ROWS - 1][metricIndex] = {
                    fieldId,
                };
            });

            rowTotals = rowTotals.map((row, rowIndex) =>
                row.map((_, totalColIndex) => {
                    const totalColFieldId =
                        rowTotalFields![N_TOTAL_ROWS - 1][totalColIndex]
                            ?.fieldId;
                    const valueColIndices = totalColFieldId
                        ? getAllIndicesForFieldId(
                              columnIndices,
                              totalColFieldId,
                          )
                        : [];
                    return dataValues[rowIndex]
                        .filter((__, dataValueColIndex) =>
                            valueColIndices.includes(dataValueColIndex),
                        )
                        .reduce(
                            (acc, value) => acc + parseNumericValue(value),
                            0,
                        );
                }),
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
                    combinedRow[fieldId] = row[valueCol.pivotColumnName];
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
                              undefined,
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

    return combinedRetrofit(pivotData, getField, getFieldLabel);
};

export const pivotResultsAsCsv = ({
    pivotConfig,
    rows,
    itemMap,
    metricQuery,
    customLabels,
    onlyRaw,
    maxColumnLimit,
    undefinedCharacter = '',
    pivotDetails,
}: {
    pivotConfig: PivotConfig;
    pivotDetails: ReadyQueryResultsPage['pivotDetails'];
    rows: ResultRow[];
    itemMap: ItemsMap;
    metricQuery: MetricQuery;
    customLabels: Record<string, string> | undefined;
    onlyRaw: boolean;
    maxColumnLimit: number;
    undefinedCharacter?: string;
}) => {
    const getFieldLabel = (fieldId: string) => {
        const customLabel = customLabels?.[fieldId];
        if (customLabel !== undefined) return customLabel;
        const field = itemMap[fieldId];
        return (field && isField(field) && field?.label) || fieldId;
    };
    const pivotedResults = pivotDetails
        ? convertSqlPivotedRowsToPivotData({
              getField: (fieldId: string) => itemMap && itemMap[fieldId],
              getFieldLabel,
              rows,
              pivotDetails,
              pivotConfig,
              groupedSubtotals: undefined, // TODO: is this something that we have?
          })
        : pivotQueryResults({
              pivotConfig,
              metricQuery,
              rows,
              options: {
                  maxColumns: maxColumnLimit,
              },
              getField: (fieldId: string) => itemMap && itemMap[fieldId], // itemsMap && itemsMap[fieldId],
              getFieldLabel,
          });
    const formatField = onlyRaw ? 'raw' : 'formatted';
    const headers = pivotedResults.headerValues.reduce<string[][]>(
        (acc, row, i) => {
            const values = row.map((header) =>
                'value' in header
                    ? (header.value[formatField] as string)
                    : getFieldLabel(header.fieldId),
            );
            const fields = pivotedResults.titleFields[i];
            const fieldLabels = fields.map((field) =>
                field ? getFieldLabel(field.fieldId) : undefinedCharacter,
            );

            // Row totals
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
    const fieldIds = Object.values(
        pivotedResults.retrofitData.pivotColumnInfo,
    ).map((field) => field.fieldId);

    const hasIndex = pivotedResults.indexValues.length > 0;
    const pivotedRows: string[][] =
        pivotedResults.retrofitData.allCombinedData.map((row) => {
            // Fields that return `null` don't appear in the pivot table
            // If there are no index fields, we need to add an empty string to the beginning of the row
            const noIndexPrefix = hasIndex ? [] : [''];
            const formattedRows = fieldIds.map(
                (fieldId) =>
                    (row[fieldId]?.value?.[formatField] as string) ||
                    undefinedCharacter,
            );
            return [...noIndexPrefix, ...formattedRows];
        });

    return [...headers, ...pivotedRows];
};
