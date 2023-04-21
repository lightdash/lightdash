import {
    FieldType,
    MetricQuery,
    PivotConfig,
    PivotData,
    PivotHeaderType,
    PivotIndexType,
    PivotTitleValue,
    PivotValue,
    ResultRow,
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
                setKeyIfNotExists(
                    rowIndices,
                    indexRowValues.map((l) =>
                        l.type === 'value' ? String(l.value.raw) : l.fieldId,
                    ),
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
    const dataValues: (PivotValue | null)[][] = [...Array(N_DATA_ROWS)].map(
        () => Array(N_DATA_COLUMNS).fill(null),
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

            const rowIndex = getByKey(rowIndices, rowKeys);
            const columnIndex = getByKey(columnIndices, columnKeys);

            dataValues[rowIndex][columnIndex] = {
                type: 'value',
                fieldId: metric.fieldId,
                value: value,
            };
        }
    }

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
    };
};
