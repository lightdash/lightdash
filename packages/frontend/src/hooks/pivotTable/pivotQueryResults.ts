import { MetricQuery, ResultRow } from '@lightdash/common';

type PivotConfig = {
    pivotDimensions: string[];
    metricsAsRows: boolean;
};

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

type Value = {
    raw: unknown;
    formatted: string;
};

export const pivotQueryResults = ({
    pivotConfig,
    metricQuery,
    rows,
}: PivotQueryResultsArgs) => {
    // Headers (column index)
    const headerDimensions = metricQuery.dimensions.filter((d) =>
        pivotConfig.pivotDimensions.includes(d),
    );
    const headerValueTypes = [
        ...headerDimensions.map((d) => ({ type: 'dimension', field: d })),
        ...(pivotConfig.metricsAsRows ? [] : [{ type: 'metrics' }]),
    ];

    // Indices (row index)
    const indexDimensions = metricQuery.dimensions.filter(
        (d) => !pivotConfig.pivotDimensions.includes(d),
    );
    const indexValueTypes = [
        ...indexDimensions.map((d) => ({ type: 'dimension', field: d })),
        ...(pivotConfig.metricsAsRows ? [{ type: 'metrics' }] : []),
    ];

    // Metrics
    const metrics = [
        ...metricQuery.metrics,
        ...(metricQuery.additionalMetrics || []).map((m) => m.name),
        ...metricQuery.tableCalculations.map((tc) => tc.name),
    ].map((m) => ({ raw: m, formatted: m }));

    const N_ROWS = rows.length;

    // For each row in the result set, check the header and index dimensions
    // For every row in the results, compute the index and header values to determine the shape o
    // For every row in the results, check the index dimensions to compute the length of the new result set
    const indexValues: Value[][] = [];
    const headerValuesT: Value[][] = [];
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
    const dataValues: Value[][] = [...Array(N_DATA_ROWS)].map((e) =>
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

    return {
        metrics: {},
        dimensions: {},
        headerValueTypes: headerValueTypes,
        headerValues,
        indexValueTypes: indexValueTypes,
        indexValues,
        dataColumnCount: N_DATA_COLUMNS,
        dataValues,
    };
};
