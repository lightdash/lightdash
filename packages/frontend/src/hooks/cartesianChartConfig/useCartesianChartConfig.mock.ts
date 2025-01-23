import {
    CartesianSeriesType,
    ChartType,
    DimensionType,
    FieldType,
    SupportedDbtAdapter,
    type CompiledDimension,
    type CompiledTable,
    type Explore,
    type Series,
} from '@lightdash/common';
import { type GetExpectedSeriesMapArgs } from './utils';

const generateCompiledDimension = (
    name: string,
    type: DimensionType,
): CompiledDimension => {
    return {
        compiledSql: '',
        tablesReferences: [],
        fieldType: FieldType.DIMENSION,
        hidden: false,
        label: '',
        name: name,
        sql: '',
        table: 'dimension',
        tableLabel: '',
        type: type,
    };
};

const compiledTable: CompiledTable = {
    name: 'dimension',
    label: 'Dimension',
    database: '',
    schema: '',
    sqlTable: 'dimension',
    dimensions: {
        string: generateCompiledDimension('string', DimensionType.STRING),
        date_1: generateCompiledDimension('date_1', DimensionType.DATE),
        date_2: generateCompiledDimension('date_2', DimensionType.DATE),
        boolean: generateCompiledDimension('boolean', DimensionType.BOOLEAN),
        timestamp: generateCompiledDimension(
            'timestamp',
            DimensionType.TIMESTAMP,
        ),
    },
    metrics: {},
    lineageGraph: {},
};
export const explore: Explore = {
    name: '',
    label: '',
    tags: [],
    baseTable: '',
    joinedTables: [],
    tables: { dimension: compiledTable },
    targetDatabase: SupportedDbtAdapter.BIGQUERY,
};

export const simpleSeriesMapArgs: GetExpectedSeriesMapArgs = {
    defaultCartesianType: CartesianSeriesType.BAR,
    defaultAreaStyle: undefined,
    isStacked: false,
    resultsData: {
        metricQuery: {
            exploreName: '',
            dimensions: ['dimension_x'],
            metrics: [],
            filters: {},
            sorts: [],
            limit: 10,
            tableCalculations: [],
        },
        cacheMetadata: {
            cacheHit: false,
        },
        rows: [
            {
                dimension_x: { value: { raw: 'a', formatted: 'a' } },
                my_dimension: { value: { raw: 'a', formatted: 'a' } },
                my_metric: { value: { raw: 'a', formatted: 'a' } },
                my_second_metric: { value: { raw: 'a', formatted: 'a' } },
            },
            {
                dimension_x: { value: { raw: 'b', formatted: 'b' } },
                my_dimension: { value: { raw: 'a', formatted: 'a' } },
                my_metric: { value: { raw: 'a', formatted: 'a' } },
                my_second_metric: { value: { raw: 'a', formatted: 'a' } },
            },
        ],
        fields: {},
    },
    pivotKeys: undefined,
    yFields: ['my_metric', 'my_second_metric'],
    xField: 'my_dimension',
    availableDimensions: ['my_dimension', 'dimension_x'],
};

export const expectedSimpleSeriesMap: Record<string, Series> = {
    'my_dimension|my_metric': {
        label: undefined,
        type: CartesianSeriesType.BAR,
        areaStyle: undefined,
        stack: undefined,
        showSymbol: undefined,
        smooth: undefined,
        yAxisIndex: 0,
        encode: {
            xRef: {
                field: 'my_dimension',
            },
            yRef: {
                field: 'my_metric',
            },
        },
    },
    'my_dimension|my_second_metric': {
        label: undefined,
        type: CartesianSeriesType.BAR,
        areaStyle: undefined,
        stack: undefined,
        showSymbol: undefined,
        smooth: undefined,
        yAxisIndex: 0,
        encode: {
            xRef: {
                field: 'my_dimension',
            },
            yRef: {
                field: 'my_second_metric',
            },
        },
    },
};

export const pivotSeriesMapArgs: GetExpectedSeriesMapArgs = {
    ...simpleSeriesMapArgs,
    pivotKeys: ['dimension_x'],
};

export const expectedPivotedSeriesMap: Record<string, Series> = {
    'my_dimension|my_metric.dimension_x.a': {
        label: undefined,
        type: CartesianSeriesType.BAR,
        areaStyle: undefined,
        stack: undefined,
        showSymbol: undefined,
        smooth: undefined,
        yAxisIndex: 0,
        encode: {
            xRef: {
                field: 'my_dimension',
            },
            yRef: {
                field: 'my_metric',
                pivotValues: [{ field: 'dimension_x', value: 'a' }],
            },
        },
    },
    'my_dimension|my_metric.dimension_x.b': {
        label: undefined,
        type: CartesianSeriesType.BAR,
        areaStyle: undefined,
        stack: undefined,
        showSymbol: undefined,
        smooth: undefined,
        yAxisIndex: 0,
        encode: {
            xRef: {
                field: 'my_dimension',
            },
            yRef: {
                field: 'my_metric',
                pivotValues: [{ field: 'dimension_x', value: 'b' }],
            },
        },
    },
    'my_dimension|my_second_metric.dimension_x.a': {
        label: undefined,
        type: CartesianSeriesType.BAR,
        areaStyle: undefined,
        stack: undefined,
        showSymbol: undefined,
        smooth: undefined,
        yAxisIndex: 0,
        encode: {
            xRef: {
                field: 'my_dimension',
            },
            yRef: {
                field: 'my_second_metric',
                pivotValues: [{ field: 'dimension_x', value: 'a' }],
            },
        },
    },
    'my_dimension|my_second_metric.dimension_x.b': {
        label: undefined,
        type: CartesianSeriesType.BAR,
        areaStyle: undefined,
        stack: undefined,
        showSymbol: undefined,
        smooth: undefined,
        yAxisIndex: 0,
        encode: {
            xRef: {
                field: 'my_dimension',
            },
            yRef: {
                field: 'my_second_metric',
                pivotValues: [{ field: 'dimension_x', value: 'b' }],
            },
        },
    },
};

export const multiPivotSeriesMapArgs: GetExpectedSeriesMapArgs = {
    ...simpleSeriesMapArgs,
    pivotKeys: ['dimension_x', 'dimension_y'],
    yFields: ['my_metric'],
    resultsData: {
        metricQuery: {
            exploreName: '',
            dimensions: ['dimension_x', 'dimension_y'],
            metrics: [],
            filters: {},
            sorts: [],
            limit: 10,
            tableCalculations: [],
        },
        cacheMetadata: {
            cacheHit: false,
        },
        rows: [
            {
                dimension_x: { value: { raw: 'a', formatted: 'a' } },
                dimension_y: { value: { raw: 'a', formatted: 'a' } },
                my_dimension: { value: { raw: 'a', formatted: 'a' } },
                my_metric: { value: { raw: 'a', formatted: 'a' } },
            },
            {
                dimension_x: { value: { raw: 'b', formatted: 'b' } },
                dimension_y: { value: { raw: 'b', formatted: 'b' } },
                my_dimension: { value: { raw: 'a', formatted: 'a' } },
                my_metric: { value: { raw: 'a', formatted: 'a' } },
            },
            {
                dimension_x: { value: { raw: 'a', formatted: 'a' } },
                dimension_y: { value: { raw: 'b', formatted: 'b' } },
                my_dimension: { value: { raw: 'a', formatted: 'a' } },
                my_metric: { value: { raw: 'a', formatted: 'a' } },
            },
            {
                dimension_x: { value: { raw: 'b', formatted: 'b' } },
                dimension_y: { value: { raw: 'a', formatted: 'a' } },
                my_dimension: { value: { raw: 'a', formatted: 'a' } },
                my_metric: { value: { raw: 'a', formatted: 'a' } },
            },
        ],
        fields: {},
    },
};

export const expectedMultiPivotedSeriesMap: Record<string, Series> = {
    'my_dimension|my_metric.dimension_x.a.dimension_y.a': {
        label: undefined,
        type: CartesianSeriesType.BAR,
        showSymbol: undefined,
        smooth: undefined,
        areaStyle: undefined,
        stack: undefined,
        yAxisIndex: 0,
        encode: {
            xRef: {
                field: 'my_dimension',
            },
            yRef: {
                field: 'my_metric',
                pivotValues: [
                    { field: 'dimension_x', value: 'a' },
                    { field: 'dimension_y', value: 'a' },
                ],
            },
        },
    },
    'my_dimension|my_metric.dimension_x.b.dimension_y.a': {
        label: undefined,
        type: CartesianSeriesType.BAR,
        areaStyle: undefined,
        stack: undefined,
        showSymbol: undefined,
        smooth: undefined,
        yAxisIndex: 0,
        encode: {
            xRef: {
                field: 'my_dimension',
            },
            yRef: {
                field: 'my_metric',
                pivotValues: [
                    { field: 'dimension_x', value: 'b' },
                    { field: 'dimension_y', value: 'a' },
                ],
            },
        },
    },
    'my_dimension|my_metric.dimension_x.b.dimension_y.b': {
        label: undefined,
        type: CartesianSeriesType.BAR,
        areaStyle: undefined,
        showSymbol: undefined,
        smooth: undefined,
        stack: undefined,
        yAxisIndex: 0,
        encode: {
            xRef: {
                field: 'my_dimension',
            },
            yRef: {
                field: 'my_metric',
                pivotValues: [
                    { field: 'dimension_x', value: 'b' },
                    { field: 'dimension_y', value: 'b' },
                ],
            },
        },
    },
    'my_dimension|my_metric.dimension_x.a.dimension_y.b': {
        label: undefined,
        type: CartesianSeriesType.BAR,
        areaStyle: undefined,
        stack: undefined,
        showSymbol: undefined,
        smooth: undefined,
        yAxisIndex: 0,
        encode: {
            xRef: {
                field: 'my_dimension',
            },
            yRef: {
                field: 'my_metric',
                pivotValues: [
                    { field: 'dimension_x', value: 'a' },
                    { field: 'dimension_y', value: 'b' },
                ],
            },
        },
    },
};

export const existingMixedSeries: Series[] = [
    {
        label: undefined,
        type: CartesianSeriesType.BAR,
        areaStyle: undefined,
        stack: undefined,
        showSymbol: undefined,
        smooth: undefined,
        yAxisIndex: 0,
        encode: {
            xRef: {
                field: 'my_dimension',
            },
            yRef: {
                field: 'my_second_dimension',
            },
        },
        hidden: true,
    },
    {
        label: undefined,
        type: CartesianSeriesType.BAR,
        areaStyle: undefined,
        showSymbol: undefined,
        smooth: undefined,
        yAxisIndex: 0,
        stack: undefined,
        encode: {
            xRef: {
                field: 'my_dimension',
            },
            yRef: {
                field: 'my_second_metric',
                pivotValues: [{ field: 'dimension_x', value: 'a' }],
            },
        },
        name: 'custom label',
    },
];

export const expectedMixedSeriesMap: Record<string, Series> = {
    'my_dimension|my_second_dimension': {
        label: undefined,
        type: CartesianSeriesType.BAR,
        areaStyle: undefined,
        stack: undefined,
        showSymbol: undefined,
        smooth: undefined,
        yAxisIndex: 0,
        encode: {
            xRef: {
                field: 'my_dimension',
            },
            yRef: {
                field: 'my_second_dimension',
            },
        },
    },
    'my_dimension|my_metric.dimension_x.a': {
        label: undefined,
        type: CartesianSeriesType.BAR,
        areaStyle: undefined,
        stack: undefined,
        showSymbol: undefined,
        smooth: undefined,
        yAxisIndex: 0,
        encode: {
            xRef: {
                field: 'my_dimension',
            },
            yRef: {
                field: 'my_metric',
                pivotValues: [{ field: 'dimension_x', value: 'a' }],
            },
        },
    },
    'my_dimension|my_metric.dimension_x.b': {
        label: undefined,
        type: CartesianSeriesType.BAR,
        areaStyle: undefined,
        showSymbol: undefined,
        smooth: undefined,
        yAxisIndex: 0,
        stack: undefined,
        encode: {
            xRef: {
                field: 'my_dimension',
            },
            yRef: {
                field: 'my_metric',
                pivotValues: [{ field: 'dimension_x', value: 'b' }],
            },
        },
    },
    'my_dimension|my_second_metric.dimension_x.a': {
        label: undefined,
        type: CartesianSeriesType.BAR,
        areaStyle: undefined,
        stack: undefined,
        showSymbol: undefined,
        smooth: undefined,
        yAxisIndex: 0,
        encode: {
            xRef: {
                field: 'my_dimension',
            },
            yRef: {
                field: 'my_second_metric',
                pivotValues: [{ field: 'dimension_x', value: 'a' }],
            },
        },
    },
    'my_dimension|my_second_metric.dimension_x.b': {
        label: undefined,
        type: CartesianSeriesType.BAR,
        areaStyle: undefined,
        stack: undefined,
        showSymbol: undefined,
        smooth: undefined,
        yAxisIndex: 0,
        encode: {
            xRef: {
                field: 'my_dimension',
            },
            yRef: {
                field: 'my_second_metric',
                pivotValues: [{ field: 'dimension_x', value: 'b' }],
            },
        },
    },
    'my_dimension|my_third_dimension': {
        label: undefined,
        type: CartesianSeriesType.BAR,
        areaStyle: undefined,
        stack: undefined,
        showSymbol: undefined,
        smooth: undefined,
        yAxisIndex: 0,
        encode: {
            xRef: {
                field: 'my_dimension',
            },
            yRef: {
                field: 'my_third_dimension',
            },
        },
    },
};

export const mergedMixedSeries: Series[] = [
    {
        label: undefined,
        type: CartesianSeriesType.BAR,
        areaStyle: undefined,
        stack: undefined,
        showSymbol: undefined,
        smooth: undefined,
        yAxisIndex: 0,
        encode: {
            xRef: {
                field: 'my_dimension',
            },
            yRef: {
                field: 'my_second_dimension',
            },
        },
        hidden: true,
    },
    {
        label: undefined,
        type: CartesianSeriesType.BAR,
        areaStyle: undefined,
        stack: undefined,
        showSymbol: undefined,
        smooth: undefined,
        yAxisIndex: 0,
        encode: {
            xRef: {
                field: 'my_dimension',
            },
            yRef: {
                field: 'my_second_metric',
                pivotValues: [{ field: 'dimension_x', value: 'a' }],
            },
        },
        name: 'custom label',
    },
    {
        label: undefined,
        type: CartesianSeriesType.BAR,
        areaStyle: undefined,
        stack: undefined,
        showSymbol: undefined,
        smooth: undefined,
        yAxisIndex: 0,
        encode: {
            xRef: {
                field: 'my_dimension',
            },
            yRef: {
                field: 'my_second_metric',
                pivotValues: [{ field: 'dimension_x', value: 'b' }],
            },
        },
    },
    {
        label: undefined,
        type: CartesianSeriesType.BAR,
        areaStyle: undefined,
        stack: undefined,
        showSymbol: undefined,
        smooth: undefined,
        yAxisIndex: 0,
        encode: {
            xRef: {
                field: 'my_dimension',
            },
            yRef: {
                field: 'my_metric',
                pivotValues: [{ field: 'dimension_x', value: 'a' }],
            },
        },
    },
    {
        label: undefined,
        type: CartesianSeriesType.BAR,
        areaStyle: undefined,
        stack: undefined,
        showSymbol: undefined,
        smooth: undefined,
        yAxisIndex: 0,
        encode: {
            xRef: {
                field: 'my_dimension',
            },
            yRef: {
                field: 'my_metric',
                pivotValues: [{ field: 'dimension_x', value: 'b' }],
            },
        },
    },
    {
        label: undefined,
        type: CartesianSeriesType.BAR,
        areaStyle: undefined,
        stack: undefined,
        showSymbol: undefined,
        smooth: undefined,
        yAxisIndex: 0,
        encode: {
            xRef: {
                field: 'my_dimension',
            },
            yRef: {
                field: 'my_third_dimension',
            },
        },
    },
];

export const groupedMixedSeries: Array<{ index: number; value: Series[] }> = [
    {
        index: 0,
        value: [mergedMixedSeries[0]],
    },
    {
        index: 1,
        value: [mergedMixedSeries[1], mergedMixedSeries[2]],
    },
    {
        index: 3,
        value: [mergedMixedSeries[3], mergedMixedSeries[4]],
    },
    {
        index: 5,
        value: [mergedMixedSeries[5]],
    },
];

export const useCartesianChartConfigParamsMock = {
    pivotKeys: undefined,
    setPivotDimensions: () => {},
    chartType: ChartType.CARTESIAN,
    initialChartConfig: {
        layout: {
            xField: 'orders_customer_id',
            yField: ['orders_total_order_amount', 'orders_fulfillment_rate'],
        },
        eChartsConfig: {
            series: [],
        },
    },
    resultsData: {
        rows: [],
        metricQuery: {
            dimensions: ['orders_customer_id'],
            metrics: ['orders_total_order_amount', 'orders_fulfillment_rate'],
            filters: {},
            sorts: [
                {
                    fieldId: 'orders_total_order_amount',
                    descending: true,
                },
            ],
            limit: 500,
            tableCalculations: [],
            additionalMetrics: [],
        },
    },
    columnOrder: [
        'orders_customer_id',
        'orders_total_order_amount',
        'orders_fulfillment_rate',
    ],
};
