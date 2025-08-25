import isNumber from 'lodash/isNumber';
import last from 'lodash/last';
import { type Entries } from 'type-fest';
import type { ReadyQueryResultsPage } from '..';
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
        const formattedValue = formatItemValue(item, total);

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

        const formattedValue = formatItemValue(item, total);

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
    const headerDimensionValueTypes = headerDimensions.map<{
        type: FieldType.DIMENSION;
        fieldId: string;
    }>((d) => ({
        type: FieldType.DIMENSION,
        fieldId: d,
    }));
    const headerMetricValueTypes: { type: FieldType.METRIC }[] =
        pivotConfig.metricsAsRows ? [] : [{ type: FieldType.METRIC }];
    const headerValueTypes: PivotData['headerValueTypes'] = [
        ...headerDimensionValueTypes,
        ...headerMetricValueTypes,
    ];

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

    let columnTotalFields: PivotData['columnTotalFields'];
    let columnTotals: PivotData['columnTotals'];
    if (pivotConfig.columnTotals && hasIndex) {
        if (pivotConfig.metricsAsRows) {
            const N_TOTAL_ROWS = summableMetricFieldIds.length;
            const N_TOTAL_COLS = indexValueTypes.length;

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
 * Converts SQL-pivoted results to a normalized table format
 * This handles results that are already pivoted at the SQL level
 * Simply normalizes the existing SQL column structure for table display
 */
export const convertSqlPivotedResults = (
    rows: ResultRow[],
    pivotDetails: NonNullable<ReadyQueryResultsPage['pivotDetails']>,
): PivotData => {
    // Extract index column information
    const { indexColumn } = pivotDetails;
    const indexDimensions: string[] = [];
    if (indexColumn) {
        if (Array.isArray(indexColumn)) {
            indexDimensions.push(...indexColumn.map((col) => col.reference));
        } else {
            indexDimensions.push(indexColumn.reference);
        }
    }

    // Get unique metrics and pivot values from valuesColumns
    const uniqueMetrics = Array.from(
        new Set(pivotDetails.valuesColumns.map((col) => col.referenceField)),
    );

    // Get pivot dimension and its unique values (preserving order from valuesColumns)
    const mainPivotDimension =
        pivotDetails.groupByColumns?.[0]?.reference ||
        'payments_payment_method';
    const seenPivotValues = new Set<string>();
    const uniquePivotValues: unknown[] = [];

    pivotDetails.valuesColumns.forEach((col) => {
        col.pivotValues.forEach((pv) => {
            const valueStr = String(pv.value);
            if (!seenPivotValues.has(valueStr)) {
                seenPivotValues.add(valueStr);
                uniquePivotValues.push(pv.value);
            }
        });
    });

    // Create headerValueTypes
    const headerValueTypes: PivotData['headerValueTypes'] = [
        { type: FieldType.DIMENSION, fieldId: mainPivotDimension },
        { type: FieldType.METRIC },
    ];

    // Create indexValueTypes
    const indexValueTypes: PivotData['indexValueTypes'] = indexDimensions.map(
        (d) => ({
            type: FieldType.DIMENSION,
            fieldId: d,
        }),
    );

    // Build header values structure
    const headerValues: PivotData['headerValues'] = [];

    // First header row: pivot dimension values (e.g., coupon, gift_card, credit_card, bank_transfer) with colSpans
    const dimensionHeaderRow: PivotData['headerValues'][number] = [];
    uniquePivotValues.forEach((pivotValue) => {
        dimensionHeaderRow.push({
            type: 'value',
            fieldId: mainPivotDimension,
            value: {
                raw: pivotValue,
                formatted: String(pivotValue),
            },
            colSpan: uniqueMetrics.length,
        });
    });
    headerValues.push(dimensionHeaderRow);

    // Second header row: metric labels repeated for each pivot value
    const metricHeaderRow: PivotData['headerValues'][number] = [];
    uniquePivotValues.forEach(() => {
        uniqueMetrics.forEach((metric) => {
            metricHeaderRow.push({
                type: 'label',
                fieldId: metric,
            });
        });
    });
    headerValues.push(metricHeaderRow);

    // Build index values from the rows
    const indexValues: PivotData['indexValues'] = [];
    const seenIndexValues = new Set<string>();

    rows.forEach((row) => {
        if (indexColumn && !Array.isArray(indexColumn)) {
            const indexValue = row[indexColumn.reference]?.value;
            const indexKey = String(indexValue?.raw);

            if (!seenIndexValues.has(indexKey)) {
                seenIndexValues.add(indexKey);
                indexValues.push([
                    {
                        type: 'value',
                        fieldId: indexColumn.reference,
                        value: indexValue,
                        colSpan: 1,
                    },
                ]);
            }
        } else if (indexColumn && Array.isArray(indexColumn)) {
            const indexRowValues: PivotData['indexValues'][number] = [];
            const indexKey = indexColumn
                .map((col) => String(row[col.reference]?.value?.raw))
                .join('__');

            if (!seenIndexValues.has(indexKey)) {
                seenIndexValues.add(indexKey);
                indexColumn.forEach((col) => {
                    indexRowValues.push({
                        type: 'value',
                        fieldId: col.reference,
                        value: row[col.reference]?.value,
                        colSpan: 1,
                    });
                });
                indexValues.push(indexRowValues);
            }
        }
    });

    // Build data values - map pivoted columns to 2D array in correct order
    const dataColumnCount = uniquePivotValues.length * uniqueMetrics.length;
    const dataRowCount = indexValues.length;
    const dataValues = create2DArray<ResultValue | null>(
        dataRowCount,
        dataColumnCount,
    );

    // Create a mapping from row index to actual row data
    const rowsByIndexValue = new Map<string, ResultRow>();
    rows.forEach((row) => {
        if (indexColumn && !Array.isArray(indexColumn)) {
            const indexValue = String(
                row[indexColumn.reference]?.value?.raw || '',
            );
            rowsByIndexValue.set(indexValue, row);
        } else if (indexColumn && Array.isArray(indexColumn)) {
            const indexKey = indexColumn
                .map((col) => String(row[col.reference]?.value?.raw || ''))
                .join('__');
            rowsByIndexValue.set(indexKey, row);
        }
    });

    // Map data values in the expected order: for each pivot value, then for each metric
    indexValues.forEach((indexRow, rowIndex) => {
        let indexKey = '';
        if (indexColumn && !Array.isArray(indexColumn)) {
            const firstCell = indexRow[0];
            indexKey = String(
                firstCell && 'value' in firstCell
                    ? firstCell.value?.raw || ''
                    : '',
            );
        } else if (indexColumn && Array.isArray(indexColumn)) {
            indexKey = indexRow
                .map((cell) =>
                    String(
                        cell && 'value' in cell ? cell.value?.raw || '' : '',
                    ),
                )
                .join('__');
        }

        const sourceRow = rowsByIndexValue.get(indexKey);
        if (sourceRow) {
            let colIndex = 0;
            uniquePivotValues.forEach((pivotValue) => {
                uniqueMetrics.forEach((metric) => {
                    // Find the matching column from pivotDetails.valuesColumns
                    const matchingColumn = pivotDetails.valuesColumns.find(
                        (col) =>
                            col.referenceField === metric &&
                            col.pivotValues.some(
                                (pv) => pv.value === pivotValue,
                            ),
                    );

                    if (matchingColumn) {
                        const value =
                            sourceRow[matchingColumn.pivotColumnName]?.value;
                        dataValues[rowIndex][colIndex] = value || null;
                    }
                    colIndex += 1;
                });
            });
        }
    });

    // Build titleFields
    const titleFields: PivotData['titleFields'] = create2DArray(
        headerValueTypes.length || 1,
        indexValueTypes.length || 1,
    );

    headerValueTypes.forEach((headerValueType, headerIndex) => {
        if (headerValueType.type === FieldType.DIMENSION) {
            const indexPos =
                indexValueTypes.length > 0 ? indexValueTypes.length - 1 : 0;
            titleFields[headerIndex][indexPos] = {
                fieldId: headerValueType.fieldId,
                direction: 'header',
            };
        }
    });

    indexValueTypes.forEach((indexValueType, indexIndex) => {
        if (indexValueType.type === FieldType.DIMENSION) {
            const headerPos =
                headerValueTypes.length > 0 ? headerValueTypes.length - 1 : 0;
            titleFields[headerPos][indexIndex] = {
                fieldId: indexValueType.fieldId,
                direction: 'index',
            };
        }
    });

    // Build retrofit data structure for compatibility
    const retrofitData: PivotData['retrofitData'] = {
        allCombinedData: [],
        pivotColumnInfo: [],
    };

    // Add index column info
    if (indexColumn && !Array.isArray(indexColumn)) {
        retrofitData.pivotColumnInfo.push({
            fieldId: indexColumn.reference,
            baseId: undefined,
            underlyingId: undefined,
            columnType: 'indexValue',
        });
    } else if (indexColumn && Array.isArray(indexColumn)) {
        indexColumn.forEach((col) => {
            retrofitData.pivotColumnInfo.push({
                fieldId: col.reference,
                baseId: undefined,
                underlyingId: undefined,
                columnType: 'indexValue',
            });
        });
    }

    // Add data column info in the correct order
    let colIndex = 0;
    uniquePivotValues.forEach((pivotValue) => {
        uniqueMetrics.forEach((metric) => {
            const matchingColumn = pivotDetails.valuesColumns.find(
                (col) =>
                    col.referenceField === metric &&
                    col.pivotValues.some((pv) => pv.value === pivotValue),
            );

            if (matchingColumn) {
                retrofitData.pivotColumnInfo.push({
                    fieldId: `${mainPivotDimension}_${pivotValue}_${metric}_${colIndex}`,
                    baseId: metric,
                    underlyingId: undefined,
                    columnType: 'dataValue',
                });
            }
            colIndex += 1;
        });
    });

    // Build combined data rows
    indexValues.forEach((indexRow) => {
        let indexKey = '';
        if (indexColumn && !Array.isArray(indexColumn)) {
            const firstCell = indexRow[0];
            indexKey = String(
                firstCell && 'value' in firstCell
                    ? firstCell.value?.raw || ''
                    : '',
            );
        }

        const sourceRow = rowsByIndexValue.get(indexKey);
        if (sourceRow) {
            const combinedRow: ResultRow = {};

            // Add index values
            if (indexColumn && !Array.isArray(indexColumn)) {
                const value = sourceRow[indexColumn.reference]?.value;
                if (value) {
                    combinedRow[indexColumn.reference] = { value };
                }
            }

            // Add data values
            let dataColIndex = 0;
            uniquePivotValues.forEach((pivotValue) => {
                uniqueMetrics.forEach((metric) => {
                    const fieldId = `${mainPivotDimension}_${pivotValue}_${metric}_${dataColIndex}`;
                    const matchingColumn = pivotDetails.valuesColumns.find(
                        (col) =>
                            col.referenceField === metric &&
                            col.pivotValues.some(
                                (pv) => pv.value === pivotValue,
                            ),
                    );

                    const value = matchingColumn
                        ? sourceRow[matchingColumn.pivotColumnName]?.value
                        : null;
                    if (value) {
                        combinedRow[fieldId] = { value };
                    }
                    dataColIndex += 1;
                });
            });

            retrofitData.allCombinedData.push(combinedRow);
        }
    });

    let indexColumnCount = 0;
    if (indexColumn) {
        if (Array.isArray(indexColumn)) {
            indexColumnCount = indexColumn.length;
        } else {
            indexColumnCount = 1;
        }
    }
    const cellsCount = dataColumnCount + indexColumnCount;

    const result: PivotData = {
        titleFields,
        headerValueTypes,
        headerValues,
        indexValueTypes,
        indexValues,
        dataColumnCount,
        dataValues,
        rowTotalFields: undefined,
        columnTotalFields: undefined,
        rowTotals: undefined,
        columnTotals: undefined,
        cellsCount,
        rowsCount: dataRowCount,
        pivotConfig: {
            pivotDimensions: [mainPivotDimension],
            metricsAsRows: false,
            columnOrder: [],
            rowTotals: false,
            columnTotals: false,
        },
        retrofitData,
        groupedSubtotals: undefined,
    };

    return result;
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
}: {
    pivotConfig: PivotConfig;
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
    const pivotedResults = pivotQueryResults({
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
