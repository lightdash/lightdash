import {
    Field,
    FieldType,
    MetricQuery,
    PivotConfig,
    PivotData,
    PTFieldLabel,
    PTValue,
    ResultRow,
    ResultValue,
    TableCalculation,
} from '@lightdash/common';

type PivotQueryResultsArgs = {
    pivotConfig: PivotConfig;
    metricQuery: Pick<
        MetricQuery,
        'dimensions' | 'metrics' | 'tableCalculations' | 'additionalMetrics'
    >;
    rows: ResultRow[];
    itemsMap: Record<string, TableCalculation | Field>;
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

export const pivotQueryResults = ({
    pivotConfig,
    metricQuery,
    rows,
}: PivotQueryResultsArgs): PivotData => {
    if (rows.length === 0) {
        throw new Error('Cannot pivot results with no rows');
    }

    const hiddenMetricFieldIds = pivotConfig.hiddenMetricFieldIds || [];

    const columnOrder = (pivotConfig.columnOrder || []).filter((id) => {
        return !hiddenMetricFieldIds.includes(id);
    });

    // Headers (column index)
    const headerDimensions = pivotConfig.pivotDimensions.filter(
        (pivotDimension) => metricQuery.dimensions.includes(pivotDimension),
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
    const indexDimensions = metricQuery.dimensions
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
                .map<PTFieldLabel | PTValue>((fieldId) => ({
                    type: 'value',
                    fieldId: fieldId,
                    value: row[fieldId].value,
                }))
                .concat(
                    pivotConfig.metricsAsRows
                        ? [{ type: 'label', fieldId: metric.fieldId }]
                        : [],
                );

            const headerRowValues = headerDimensions
                .map<PTFieldLabel | PTValue>((fieldId) => ({
                    type: 'value',
                    fieldId: fieldId,
                    value: row[fieldId].value,
                }))
                .concat(
                    pivotConfig.metricsAsRows
                        ? []
                        : [{ type: 'label', fieldId: metric.fieldId }],
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
                headerValuesT.push(headerRowValues);
            }
        }
    }

    const headerValues = headerValuesT[0].map((_, colIndex) =>
        headerValuesT.map((row) => row[colIndex]),
    );

    // Compute the size of the data values
    const N_DATA_ROWS = rowCount;
    const N_DATA_COLUMNS = columnCount;
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

            const rowIndex = getIndexByKey(rowIndices, rowKeysString);
            const columnIndex = getIndexByKey(columnIndices, columnKeysString);

            dataValues[rowIndex][columnIndex] = value;
        }
    }

    // compute row totals
    let indexTotalLabels: PivotData['indexTotalLabels'];
    let rowTotals: PivotData['rowTotals'];
    if (pivotConfig.rowTotals && pivotConfig.metricsAsRows) {
        const N_TOTAL_COLS = 1;
        const N_TOTAL_ROWS = headerValues.length;

        indexTotalLabels = create2DArray(N_TOTAL_ROWS, N_TOTAL_COLS);
        rowTotals = create2DArray(N_DATA_ROWS, N_TOTAL_COLS);

        // set the header last cell as the title total
        indexTotalLabels[N_TOTAL_ROWS - 1][N_TOTAL_COLS - 1] = {
            titleDirection: 'header',
            type: 'total',
        };

        rowTotals = rowTotals.map((row, rowIndex) => {
            return row.map(() => {
                const sum = dataValues[rowIndex].reduce((acc, value) => {
                    const parsedVal = Number(value?.raw);
                    const finalVal = Number.isNaN(parsedVal) ? 0 : parsedVal;
                    return acc + finalVal;
                }, 0);

                return { raw: sum };
            });
        });
    }

    let headerTotalLabels: PivotData['headerTotalLabels'];
    let columnTotals: PivotData['columnTotals'];
    if (pivotConfig.columnTotals && pivotConfig.metricsAsRows) {
        const N_TOTAL_ROWS = metrics.length;
        const N_TOTAL_COLS = indexValueTypes.length;

        headerTotalLabels = create2DArray(N_TOTAL_ROWS, N_TOTAL_COLS);
        columnTotals = create2DArray(N_TOTAL_ROWS, N_DATA_COLUMNS);

        metrics.forEach((metric, metricIndex) => {
            headerTotalLabels![metricIndex][N_TOTAL_COLS - 1] = {
                titleDirection: 'index',
                fieldId: metric.fieldId,
                type: 'label',
            };
        });

        columnTotals = columnTotals.map((row, totalRowIndex) => {
            return row.map((_, totalColumnIndex) => {
                const sum = dataValues
                    .filter(
                        (__, index) => index % N_TOTAL_ROWS === totalRowIndex,
                    )
                    .reduce((acc, value) => {
                        const parsedVal = Number(value[totalColumnIndex]?.raw);
                        const finalVal = Number.isNaN(parsedVal)
                            ? 0
                            : parsedVal;
                        return acc + finalVal;
                    }, 0);

                return { raw: sum };
            });
        });
    }

    const titleFields: PivotData['titleFields'] = [
        ...Array(headerValueTypes.length),
    ].map(() => Array(indexValueTypes.length).fill(null));
    headerValueTypes.forEach((headerValueType, headerIndex) => {
        if (headerValueType.type === FieldType.DIMENSION) {
            titleFields[headerIndex][indexValueTypes.length - 1] = {
                fieldId: headerValueType.fieldId,
                type: 'label',
                titleDirection: 'header',
            };
        }
    });
    indexValueTypes.forEach((indexValueType, indexIndex) => {
        if (indexValueType.type === FieldType.DIMENSION) {
            titleFields[headerValueTypes.length - 1][indexIndex] = {
                fieldId: indexValueType.fieldId,
                type: 'label',
                titleDirection: 'index',
            };
        }
    });

    return {
        titleFields,

        headerValueTypes: headerValueTypes,
        headerValues,
        indexValueTypes: indexValueTypes,
        indexValues,

        dataColumnCount: N_DATA_COLUMNS,
        dataValues,

        headerTotalLabels,
        indexTotalLabels,
        rowTotals,
        columnTotals,

        pivotConfig,
    };
};
