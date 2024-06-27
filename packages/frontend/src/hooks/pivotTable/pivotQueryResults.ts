import {
    FieldType,
    formatItemValue,
    type ItemsMap,
    type MetricQuery,
    type PivotConfig,
    type PivotData,
    type ResultRow,
    type ResultValue,
    type TotalField,
} from '@lightdash/common';
import isNumber from 'lodash/isNumber';
import last from 'lodash/last';
import { type Entries } from 'type-fest';
import { isSummable } from '../useColumnTotals';

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
    options: {
        maxColumns: number;
    };
    getField: FieldFunction;
    getFieldLabel: FieldLabelFunction;
};

type RecursiveRecord<T = unknown> = {
    [key: string]: RecursiveRecord<T> | T;
};

const isRecursiveRecord = (value: unknown): value is RecursiveRecord => {
    return typeof value === 'object' && value !== null;
};

const create2DArray = <T>(
    rows: number,
    columns: number,
    value: T | null = null,
): (T | null)[][] => {
    return Array.from({ length: rows }, () => {
        return Array.from({ length: columns }, () => value);
    });
};

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
    if (rest.length === 0) {
        if (obj[key] === undefined) {
            obj[key] = value;
            return true;
        }
        return false;
    }
    if (obj[key] === undefined) {
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
        } else {
            throw new Error('Expected a RecursiveRecord object');
        }
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
        } else if (isRecursiveRecord(value)) {
            return [...acc, ...getAllIndicesForFieldId(value, fieldId)];
        }
        return acc;
    }, []);
};

const getAllIndices = (obj: RecursiveRecord<number>): number[] => {
    return Object.values(obj).reduce<number[]>((acc, value) => {
        if (isNumber(value)) {
            return [...acc, value];
        }
        return [...acc, ...getAllIndices(value)];
    }, []);
};

const getAllIndicesByKey = (
    obj: RecursiveRecord<number>,
    keys: string[],
): number[] => {
    const [key, ...rest] = keys;
    if (rest.length === 0) {
        const value = obj[key];
        if (isNumber(value)) {
            return [value];
        }
        return getAllIndices(value);
    } else {
        const nextObj = obj[key];
        if (isRecursiveRecord(nextObj)) {
            return getAllIndicesByKey(nextObj, rest);
        } else {
            throw new Error('Expected a RecursiveRecord object');
        }
    }
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
    const uniqueIdsForDataValueColumns: string[] = Array(
        data.headerValues[0].length,
    );

    data.headerValues.forEach((headerRow) => {
        headerRow.forEach((headerColValue, colIndex) => {
            uniqueIdsForDataValueColumns[colIndex] =
                uniqueIdsForDataValueColumns[colIndex] +
                headerColValue.fieldId +
                '__';
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

    let firstRowOnly = [] as any[];
    const allCombinedData = indexValues.map((row, rowIndex) => {
        const newRow = row.map((cell, colIndex) => {
            if (cell.type === 'label') {
                const cellValue = getFieldLabel(cell.fieldId);
                return {
                    ...cell,
                    fieldId: 'label-' + colIndex,
                    value: {
                        raw: cellValue,
                        formatted: cellValue,
                    },
                    meta: {
                        type: 'label',
                    },
                };
            }
            return {
                ...cell,
                meta: {
                    type: 'indexValue',
                },
            };
        });

        const remappedDataValues = data.dataValues[rowIndex].map(
            (dataValue, colIndex) => {
                const baseIdInfoForCol = baseIdInfo
                    ? baseIdInfo[colIndex]
                    : undefined;
                const baseId = baseIdInfoForCol?.fieldId;
                const id = uniqueIdsForDataValueColumns[colIndex] + colIndex;
                return {
                    baseId: baseId,
                    fieldId: id,
                    value: dataValue || {},
                };
            },
        );

        const remappedRowTotals = data.rowTotals?.[rowIndex]?.map(
            (total, colIndex) => {
                const baseId = 'row-total-' + colIndex;
                const id = baseId;
                const underlyingData = last(data.rowTotalFields)?.[colIndex];

                const value = data.pivotConfig.metricsAsRows
                    ? getMetricAsRowTotalValueFromAxis(total, rowIndex)
                    : getRowTotalValueFromAxis(underlyingData, total);
                const underlyingId = data.pivotConfig.metricsAsRows
                    ? undefined
                    : underlyingData?.fieldId;
                return {
                    baseId: baseId,
                    fieldId: id,
                    underlyingId: underlyingId,
                    value: value,
                    meta: {
                        type: 'rowTotal',
                    },
                };
            },
        );

        const entireRow = [
            ...newRow,
            ...remappedDataValues,
            ...(remappedRowTotals || []),
        ];

        if (rowIndex === 0) {
            firstRowOnly = entireRow;
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

    data.retrofitData = { allCombinedData, firstRowOnly };
    return data;
};

export const pivotQueryResults = ({
    pivotConfig,
    metricQuery,
    rows,
    options,
    getField,
    getFieldLabel,
}: PivotQueryResultsArgs): PivotData => {
    if (rows.length === 0) {
        throw new Error('Cannot pivot results with no rows');
    }

    const hiddenMetricFieldIds = pivotConfig.hiddenMetricFieldIds || [];
    const summableMetricFieldIds = pivotConfig.summableMetricFieldIds || [];

    const columnOrder = (pivotConfig.columnOrder || []).filter((id) => {
        return !hiddenMetricFieldIds.includes(id);
    });

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

    let rowIndices = {};
    let columnIndices = {};
    let rowCount = 0;
    let columnCount = 0;
    for (let nRow = 0; nRow < N_ROWS; nRow++) {
        const row = rows[nRow];

        for (let nMetric = 0; nMetric < metrics.length; nMetric++) {
            const metric = metrics[nMetric];

            const indexRowValues = indexDimensions
                .map<PivotData['indexValues'][number][number]>((fieldId) => ({
                    type: 'value',
                    fieldId: fieldId,
                    value: row[fieldId].value,
                    colSpan: 1,
                }))
                .concat(
                    pivotConfig.metricsAsRows
                        ? [
                              {
                                  type: 'label',
                                  fieldId: metric.fieldId,
                              },
                          ]
                        : [],
                );

            const headerRowValues = headerDimensions
                .map<PivotData['headerValues'][number][number]>((fieldId) => ({
                    type: 'value',
                    fieldId: fieldId,
                    value: row[fieldId].value,
                    colSpan: 1,
                }))
                .concat(
                    pivotConfig.metricsAsRows
                        ? []
                        : [
                              {
                                  type: 'label',
                                  fieldId: metric.fieldId,
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
                rowCount++;
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
                columnCount++;

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
                    const cell = row[colIndex];
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
    for (let nRow = 0; nRow < N_ROWS; nRow++) {
        const row = rows[nRow];
        for (let nMetric = 0; nMetric < metrics.length; nMetric++) {
            const metric = metrics[nMetric];
            const value = row[metric.fieldId].value;

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
                        .filter((__, dataValueColIndex) => {
                            return valueColIndices.includes(dataValueColIndex);
                        })
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

        headerValueTypes: headerValueTypes,
        headerValues,
        indexValueTypes: indexValueTypes,
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
            firstRowOnly: [],
        },
    };

    return combinedRetrofit(pivotData, getField, getFieldLabel);
};
