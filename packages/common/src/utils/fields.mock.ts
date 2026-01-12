import {
    BinType,
    CustomDimensionType,
    DimensionType,
    FieldType,
    FilterOperator,
    MetricType,
    SupportedDbtAdapter,
    type AdditionalMetric,
    type DateFilterSettings,
    type Explore,
    type Metric,
    type MetricFilterRule,
    type MetricQuery,
    type Source,
} from '../index';

export const metricQuery: MetricQuery = {
    exploreName: 'table1',
    dimensions: ['table1_dim1', 'table2_dim2', 'custom_dimension_1'],
    metrics: ['table1_metric1', 'table2_metric2', 'table1_additional_metric_1'],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [
        {
            name: 'calc2',
            displayName: '',
            sql: 'dim reference ${table1.dim1}',
        },
    ],
    additionalMetrics: [
        {
            name: 'additional_metric_1',
            sql: '${TABLE}.dim1',
            table: 'table1',
            type: MetricType.COUNT,
            description: 'My description',
        },
    ],
    customDimensions: [
        {
            id: 'custom_dimension_1',
            name: 'custom_dimension_1',
            type: CustomDimensionType.BIN,
            dimensionId: 'table1_dim1', // Parent dimension id
            binType: BinType.FIXED_NUMBER,
            binNumber: 5,
            table: 'table1',
        },
    ],
};

const exploreBase: Explore = {
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    name: '',
    label: '',
    tags: [],
    baseTable: 'a',
    joinedTables: [],
    tables: {},
    groupLabel: undefined,
};

const sourceMock: Source = {
    path: '',
    content: '',
    range: {
        start: {
            line: 0,
            character: 0,
        },
        end: {
            line: 0,
            character: 0,
        },
    },
};
export const explore: Explore = {
    ...exploreBase,
    tables: {
        table1: {
            name: 'table1',
            label: 'table1',
            database: 'database',
            schema: 'schema',
            sqlTable: 'test.table',
            sqlWhere: undefined,
            dimensions: {
                dim1: {
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.STRING,
                    name: 'dim1',
                    label: 'dim1',
                    table: 'table1',
                    tableLabel: 'table1',
                    sql: '${TABLE}.dim1',
                    compiledSql: '"table1".dim1',
                    tablesReferences: ['table1'],
                    source: sourceMock,
                    hidden: false,
                    groups: [],
                },
            },
            metrics: {
                metric1: {
                    fieldType: FieldType.METRIC,
                    type: MetricType.AVERAGE,
                    name: 'metric1',
                    label: 'metric1',
                    table: 'table1',
                    tableLabel: 'table1',
                    sql: 'AVG(${TABLE}.metric1)',
                    source: sourceMock,
                    hidden: false,
                    compiledSql: 'AVG("table1".metric1)',
                    tablesReferences: ['table1'],
                    groups: [],
                },
            },
            lineageGraph: {},
            groupLabel: undefined,
            source: sourceMock,
        },
    },
};

export const emptyExplore: Explore = {
    ...exploreBase,
    tables: {},
};

export const emptyMetricQuery: MetricQuery = {
    exploreName: 'test',
    dimensions: [],
    metrics: [],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
};

export const customMetric: AdditionalMetric = {
    type: MetricType.AVERAGE,
    sql: '${TABLE}.dim1',
    table: 'a',
    name: 'average_dim1',
    label: 'Average dim1',
    baseDimensionName: 'dim1',
};
export const metric: Metric = {
    fieldType: FieldType.METRIC,
    type: MetricType.AVERAGE,
    name: 'average_dim1',
    label: 'Average dim1',
    table: 'a',
    tableLabel: 'a',
    sql: '${TABLE}.dim1',
    hidden: false,
    dimensionReference: 'a_dim1',
};

export const metricFilterRule = (args?: {
    fieldRef?: string;
    values?: unknown[];
    operator?: FilterOperator;
    settings?: DateFilterSettings;
}): MetricFilterRule => ({
    id: 'uuid',
    operator: args?.operator || FilterOperator.GREATER_THAN_OR_EQUAL,
    target: {
        fieldRef: args?.fieldRef || 'a_dim1',
    },
    settings: args?.settings || undefined,
    values: args?.values || [14],
});

/**
 * Explore with joined tables for testing getDimensionsWithValidParameters.
 * The joined table "a_joined_table" is alphabetically before the base table "z_base_table"
 * to verify that base table dimensions are returned first regardless of alphabetical order.
 */
export const exploreWithJoinedTables: Explore = {
    ...exploreBase,
    baseTable: 'z_base_table',
    joinedTables: [
        {
            table: 'a_joined_table',
            sqlOn: '${z_base_table.id} = ${a_joined_table.base_id}',
            compiledSqlOn: '"z_base_table".id = "a_joined_table".base_id',
        },
    ],
    tables: {
        a_joined_table: {
            name: 'a_joined_table',
            label: 'A Joined Table',
            database: 'database',
            schema: 'schema',
            sqlTable: 'test.a_joined_table',
            sqlWhere: undefined,
            dimensions: {
                joined_dim1: {
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.STRING,
                    name: 'joined_dim1',
                    label: 'Joined Dim 1',
                    table: 'a_joined_table',
                    tableLabel: 'A Joined Table',
                    sql: '${TABLE}.joined_dim1',
                    compiledSql: '"a_joined_table".joined_dim1',
                    tablesReferences: ['a_joined_table'],
                    source: sourceMock,
                    hidden: false,
                    groups: [],
                },
                joined_dim2: {
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.NUMBER,
                    name: 'joined_dim2',
                    label: 'Joined Dim 2',
                    table: 'a_joined_table',
                    tableLabel: 'A Joined Table',
                    sql: '${TABLE}.joined_dim2',
                    compiledSql: '"a_joined_table".joined_dim2',
                    tablesReferences: ['a_joined_table'],
                    source: sourceMock,
                    hidden: false,
                    groups: [],
                },
            },
            metrics: {},
            lineageGraph: {},
            groupLabel: undefined,
            source: sourceMock,
        },
        z_base_table: {
            name: 'z_base_table',
            label: 'Z Base Table',
            database: 'database',
            schema: 'schema',
            sqlTable: 'test.z_base_table',
            sqlWhere: undefined,
            dimensions: {
                base_dim1: {
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.STRING,
                    name: 'base_dim1',
                    label: 'Base Dim 1',
                    table: 'z_base_table',
                    tableLabel: 'Z Base Table',
                    sql: '${TABLE}.base_dim1',
                    compiledSql: '"z_base_table".base_dim1',
                    tablesReferences: ['z_base_table'],
                    source: sourceMock,
                    hidden: false,
                    groups: [],
                },
                base_dim2: {
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.NUMBER,
                    name: 'base_dim2',
                    label: 'Base Dim 2',
                    table: 'z_base_table',
                    tableLabel: 'Z Base Table',
                    sql: '${TABLE}.base_dim2',
                    compiledSql: '"z_base_table".base_dim2',
                    tablesReferences: ['z_base_table'],
                    source: sourceMock,
                    hidden: false,
                    groups: [],
                },
            },
            metrics: {},
            lineageGraph: {},
            groupLabel: undefined,
            source: sourceMock,
        },
    },
};
