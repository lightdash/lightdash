import {
    Field,
    FieldType,
    formatValue,
    isField,
    isMetric,
    MetricQuery,
    PivotConfig,
    PivotData,
    PivotHeaderType,
    PivotIndexType,
    PivotTitleValue,
    PivotValue,
    ResultRow,
    ResultValue,
    TableCalculation,
    TotalTitle,
} from '@lightdash/common';
import last from 'lodash-es/last';

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
    itemsMap = {},
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
    const headerValueTypes: PivotHeaderType[] = [
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
    const indexValueTypes: PivotIndexType[] = [
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
    const indexValues: PivotValue[][] = [];
    const headerValuesT: PivotValue[][] = [];

    let rowIndices = {};
    let columnIndices = {};
    let rowCount = 0;
    let columnCount = 0;
    for (let nRow = 0; nRow < N_ROWS; nRow++) {
        const row = rows[nRow];

        for (let nMetric = 0; nMetric < metrics.length; nMetric++) {
            const metric = metrics[nMetric];

            const indexRowValues: PivotValue[] = indexDimensions
                .map<PivotValue>((fieldId) => ({
                    type: 'value',
                    fieldId: fieldId,
                    value: row[fieldId].value,
                }))
                .concat(
                    pivotConfig.metricsAsRows
                        ? [{ type: 'label', fieldId: metric.fieldId }]
                        : [],
                );

            const headerRowValues: PivotValue[] = headerDimensions
                .map<PivotValue>((fieldId) => ({
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
    let rowTotals: (ResultValue | null)[][] | undefined;
    let headerTotals: (TotalTitle | null)[][] | undefined;

    console.log({ pivotConfig });

    if (pivotConfig.rowTotals && pivotConfig.metricsAsRows) {
        const N_TOTAL_COLS = 1;
        const N_TOTAL_ROWS = headerValues.length;

        rowTotals = create2DArray<ResultValue | null>(
            N_DATA_ROWS,
            N_TOTAL_COLS,
        );
        headerTotals = create2DArray<TotalTitle | null>(
            N_TOTAL_ROWS,
            N_TOTAL_COLS,
        );

        headerTotals[N_TOTAL_ROWS - 1][N_TOTAL_COLS - 1] = {
            title: 'Total',
            titleDirection: 'header',
        };

        rowTotals = rowTotals.map((row, totalRowIndex) => {
            return row.map((_, totalColIndex) => {
                const indexValue = indexValues.map(last)[totalColIndex];
                const item = indexValue ? itemsMap[indexValue?.fieldId] : null;

                const sum = dataValues[totalRowIndex].reduce((acc, value) => {
                    const parsedVal = Number(value?.raw);
                    const finalVal = Number.isNaN(parsedVal) ? 0 : parsedVal;
                    return acc + finalVal;
                }, 0);

                console.log(
                    item && isField(item) && isMetric(item) ? item : undefined,
                );

                const formattedSum = formatValue(
                    sum,
                    item && isField(item) && isMetric(item) ? item : undefined,
                );

                return {
                    raw: sum,
                    formatted: formattedSum,
                };
            });
        });
    }

    console.log(rowTotals);

    const titleFields: (PivotTitleValue | null)[][] = [
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
        headerValueTypes: headerValueTypes,
        headerValues,
        indexValueTypes: indexValueTypes,
        indexValues,
        dataColumnCount: N_DATA_COLUMNS,
        dataValues,
        pivotConfig,
        titleFields,
        headerTotals,
        rowTotals,
    };
};
