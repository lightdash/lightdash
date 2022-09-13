import {
    CartesianSeriesType,
    CompiledDimension,
    CompiledTable,
    DimensionType,
    Explore,
    FieldType,
    Series,
    SupportedDbtAdapter,
} from '@lightdash/common';
import { GetExpectedSeriesMapArgs } from './utils';

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
            dimensions: ['dimension_x'],
            metrics: [],
            filters: {},
            sorts: [],
            limit: 10,
            tableCalculations: [],
        },
        rows: [
            { dimension_x: { value: { raw: 'a', formatted: 'a' } } },
            { dimension_x: { value: { raw: 'b', formatted: 'b' } } },
        ],
    },
    pivotKey: undefined,
    yFields: ['my_metric', 'my_second_metric'],
    xField: 'my_dimension',
    availableDimensions: ['my_dimension', 'dimension_x'],
};

export const expectedSimpleSeriesMap: Record<string, Series> = {
    'my_dimension|my_metric': {
        type: CartesianSeriesType.BAR,
        areaStyle: undefined,
        stack: undefined,
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
        type: CartesianSeriesType.BAR,
        areaStyle: undefined,
        stack: undefined,
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
    pivotKey: 'dimension_x',
};

export const expectedPivotedSeriesMap: Record<string, Series> = {
    'my_dimension|my_metric.dimension_x.a': {
        type: CartesianSeriesType.BAR,
        areaStyle: undefined,
        stack: undefined,
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
        type: CartesianSeriesType.BAR,
        areaStyle: undefined,
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
        type: CartesianSeriesType.BAR,
        areaStyle: undefined,
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
    },
    'my_dimension|my_second_metric.dimension_x.b': {
        type: CartesianSeriesType.BAR,
        areaStyle: undefined,
        stack: undefined,
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
