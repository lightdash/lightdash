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

    // For every row in the results, check the index dimensions to compute the length of the new result set
    const indexValues: Value[][] = [];
    const headerValuesT: Value[][] = [];
    let dimensionRowIndices = {};
    let dimensionColIndices = {};
    let rowCount = 0;
    let columnCount = 0;
    for (let nRow = 0; nRow < N_ROWS; nRow++) {
        const row = rows[nRow];

        // Compute index and header values in pivot table
        const indexDimensionValues = indexDimensions.map((d) => row[d].value);
        const headerDimensionValues = headerDimensions.map((d) => row[d].value);

        // Write the index values
        if (
            setKeyIfNotExists(
                dimensionRowIndices,
                indexDimensionValues.map((r) => r.raw),
                rowCount,
            )
        ) {
            rowCount++;
            if (!pivotConfig.metricsAsRows) {
                indexValues.push(indexDimensionValues);
            } else {
                for (let nMetric = 0; nMetric < metrics.length; nMetric++) {
                    indexValues.push([
                        ...indexDimensionValues,
                        metrics[nMetric],
                    ]);
                }
            }
        }

        // Write the header values
        if (
            setKeyIfNotExists(
                dimensionColIndices,
                headerDimensionValues.map((r) => r.raw),
                columnCount,
            )
        ) {
            columnCount++;
            if (!pivotConfig.metricsAsRows) {
                for (let nMetric = 0; nMetric < metrics.length; nMetric++) {
                    headerValuesT.push([
                        ...headerDimensionValues,
                        metrics[nMetric],
                    ]);
                }
            } else {
                headerValuesT.push(headerDimensionValues);
            }
        }
    }

    const headerValues = headerValuesT[0].map((_, colIndex) =>
        headerValuesT.map((row) => row[colIndex]),
    );

    // Compute the data values
    const N_DATA_ROWS =
        rowCount * (pivotConfig.metricsAsRows ? metrics.length : 1);
    const N_DATA_COLUMNS =
        columnCount * (pivotConfig.metricsAsRows ? 1 : metrics.length);
    const dataValues: Value[][] = [...Array(N_DATA_ROWS)].map((e) =>
        Array(N_DATA_COLUMNS).fill(null),
    );

    // Compute pivoted data
    for (let nRow = 0; nRow < N_ROWS; nRow++) {
        const row = rows[nRow];
        let dimRowIndex = getByKey(
            dimensionRowIndices,
            indexDimensions.map((d) => row[d].value.raw),
        );
        let dimColIndex = getByKey(
            dimensionColIndices,
            headerDimensions.map((d) => row[d].value.raw),
        );
        for (let nMetric = 0; nMetric < metrics.length; nMetric++) {
            const metric = metrics[nMetric];
            const value = row[metric.raw].value;
            if (pivotConfig.metricsAsRows) {
                dataValues[dimRowIndex * metrics.length + nMetric][
                    dimColIndex
                ] = value;
            } else {
                dataValues[dimRowIndex][
                    dimColIndex * metrics.length + nMetric
                ] = value;
            }
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
