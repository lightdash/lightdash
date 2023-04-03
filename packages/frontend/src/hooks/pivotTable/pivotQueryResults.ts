import {
    FieldType,
    MetricQuery,
    PivotConfig,
    PivotData,
    PivotFieldValueType,
    PivotValue,
    ResultRow,
    TitleFieldValue,
} from '@lightdash/common';

type PivotQueryResultsArgs = {
    pivotConfig: PivotConfig;
    metricQuery: Pick<
        MetricQuery,
        'dimensions' | 'metrics' | 'tableCalculations' | 'additionalMetrics'
    >;
    rows: ResultRow[];
};

const setKeyIfNotExists = (obj: any, keys: string[], value: any): boolean => {
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
    return setKeyIfNotExists(obj[key], rest, value);
};

const getByKey = (obj: any, keys: string[]): any => {
    if (keys.length === 0) {
        return undefined;
    }
    const [key, ...rest] = keys;
    if (rest.length === 0) {
        return obj[key];
    }
    return getByKey(obj[key], rest);
};

export const pivotQueryResults = ({
    pivotConfig,
    metricQuery,
    rows,
}: PivotQueryResultsArgs): PivotData => {
    if (rows.length === 0) {
        throw new Error('Cannot pivot results with no rows');
    }
    // Headers (column index)
    const headerDimensions = metricQuery.dimensions.filter((d) =>
        pivotConfig.pivotDimensions.includes(d),
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
    const headerValueTypes: PivotFieldValueType[] = [
        ...headerDimensionValueTypes,
        ...headerMetricValueTypes,
    ];

    // Indices (row index)
    const indexDimensions = metricQuery.dimensions.filter(
        (d) => !pivotConfig.pivotDimensions.includes(d),
    );
    const indexDimensionValueTypes = indexDimensions.map<{
        type: FieldType.DIMENSION;
        fieldId: string;
    }>((d) => ({
        type: FieldType.DIMENSION,
        fieldId: d,
    }));
    const indexMetricValueTypes: { type: FieldType.METRIC }[] =
        pivotConfig.metricsAsRows ? [{ type: FieldType.METRIC }] : [];
    const indexValueTypes: PivotFieldValueType[] = [
        ...indexDimensionValueTypes,
        ...indexMetricValueTypes,
    ];

    // Metrics
    const metrics = [
        ...metricQuery.metrics,
        ...(metricQuery.additionalMetrics || []).map((m) => m.name),
        ...metricQuery.tableCalculations.map((tc) => tc.name),
    ].map((m) => ({ raw: m, formatted: m }));

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
            const indexRowValues = [
                ...indexDimensions.map((d) => row[d].value),
                ...(pivotConfig.metricsAsRows ? [metric] : []),
            ];
            const headerRowValues = [
                ...headerDimensions.map((d) => row[d].value),
                ...(pivotConfig.metricsAsRows ? [] : [metric]),
            ];

            // Write the index values
            if (
                setKeyIfNotExists(
                    rowIndices,
                    indexRowValues.map((r) => r.raw),
                    rowCount,
                )
            ) {
                rowCount++;
                indexValues.push(indexRowValues);
            }

            // Write the header values
            if (
                setKeyIfNotExists(
                    columnIndices,
                    headerRowValues.map((r) => r.raw),
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
    const dataValues: PivotValue[][] = [...Array(N_DATA_ROWS)].map((e) =>
        Array(N_DATA_COLUMNS).fill(null),
    );

    // Compute pivoted data
    for (let nRow = 0; nRow < N_ROWS; nRow++) {
        const row = rows[nRow];
        for (let nMetric = 0; nMetric < metrics.length; nMetric++) {
            const metric = metrics[nMetric];
            const value = row[metric.raw].value;
            const rowKeys = [
                ...indexDimensions.map((d) => row[d].value.raw),
                ...(pivotConfig.metricsAsRows ? [metric.raw] : []),
            ];
            const columnKeys = [
                ...headerDimensions.map((d) => row[d].value.raw),
                ...(pivotConfig.metricsAsRows ? [] : [metric.raw]),
            ];
            const rowIndex = getByKey(rowIndices, rowKeys);
            const columnIndex = getByKey(columnIndices, columnKeys);
            dataValues[rowIndex][columnIndex] = value;
        }
    }

    const titleFields: TitleFieldValue[][] = [
        ...Array(headerValueTypes.length),
    ].map((e) => Array(indexValueTypes.length).fill(null));
    headerValueTypes.forEach((headerValueType, headerIndex) => {
        if (headerValueType.type === FieldType.DIMENSION) {
            titleFields[headerIndex][indexValueTypes.length - 1] = {
                ...headerValueType,
                titleDirection: 'header',
            };
        }
    });
    indexValueTypes.forEach((indexValueType, indexIndex) => {
        if (indexValueType.type === FieldType.DIMENSION) {
            titleFields[headerValueTypes.length - 1][indexIndex] = {
                ...indexValueType,
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
    };
};
