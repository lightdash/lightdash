import {
    AnyType,
    BinType,
    CompiledCustomSqlDimension,
    CompiledDimension,
    CompiledMetricQuery,
    CompiledTable,
    CreateWarehouseCredentials,
    CustomDimensionType,
    DimensionType,
    Explore,
    FieldType,
    FilterOperator,
    IntrinsicUserAttributes,
    JoinModelRequiredFilterRule,
    JoinRelationship,
    MetricType,
    SupportedDbtAdapter,
    TimeFrames,
    WarehouseCatalog,
    WarehouseClient,
    WarehouseTables,
    WarehouseTypes,
} from '@lightdash/common';

export const warehouseClientMock: WarehouseClient = {
    credentials: {
        type: WarehouseTypes.POSTGRES,
    } as CreateWarehouseCredentials,
    getCatalog: async () => ({
        default: {
            public: {
                table: {
                    id: DimensionType.NUMBER,
                },
            },
        },
    }),
    streamQuery(query, streamCallback) {
        streamCallback({
            fields: {},
            rows: [],
        });
        return Promise.resolve();
    },
    executeAsyncQuery: async (query, callback) => {
        const rows = [{ field: null }];
        const columns = {
            test: { type: DimensionType.STRING },
        };
        callback?.(rows, columns);
        return {
            queryId: null,
            queryMetadata: null,
            totalRows: 0,
            durationMs: 0,
        };
    },
    runQuery: () =>
        Promise.resolve({
            fields: {},
            rows: [],
        }),
    test: () => Promise.resolve(),
    getStartOfWeek: () => undefined,
    getStringQuoteChar: () => "'",
    getEscapeStringQuoteChar: () => "'",
    getMetricSql: (sql, metric) => {
        switch (metric.type) {
            case MetricType.COUNT:
                return `COUNT(${sql})`;
            default:
                return sql;
        }
    },
    getFieldQuoteChar: () => '"',
    getAdapterType: () => SupportedDbtAdapter.POSTGRES,
    concatString: (...args) => `(${args.join(' || ')})`,
    getAllTables(
        schema?: string | undefined,
        tags?: Record<string, string> | undefined,
    ): Promise<WarehouseTables> {
        throw new Error('Function not implemented.');
    },
    getFields(
        tableName: string,
        schema?: string | undefined,
        database?: string | undefined,
        tags?: Record<string, string> | undefined,
    ): Promise<WarehouseCatalog> {
        throw new Error('Function not implemented.');
    },
    parseWarehouseCatalog(
        rows: Record<string, AnyType>[],
        mapFieldType: (type: string) => DimensionType,
    ): WarehouseCatalog {
        throw new Error('Function not implemented.');
    },
    parseError: (error: Error) => {
        throw error;
    },
};

export const bigqueryClientMock: WarehouseClient = {
    credentials: {
        type: WarehouseTypes.BIGQUERY,
    } as CreateWarehouseCredentials,
    getFieldQuoteChar: () => '`',
    getCatalog: async () => ({
        default: {
            public: {
                table: {
                    id: DimensionType.NUMBER,
                },
            },
        },
    }),
    streamQuery(query, streamCallback) {
        streamCallback({
            fields: {},
            rows: [],
        });
        return Promise.resolve();
    },
    executeAsyncQuery: async () => ({
        queryId: null,
        queryMetadata: null,
        totalRows: 0,
        durationMs: 0,
    }),
    runQuery: () =>
        Promise.resolve({
            fields: {},
            rows: [],
        }),
    test: () => Promise.resolve(),
    getStartOfWeek: () => undefined,
    getStringQuoteChar: () => "'",
    getEscapeStringQuoteChar: () => '\\',
    getMetricSql: () => '',
    getAdapterType: () => SupportedDbtAdapter.BIGQUERY,
    concatString: (...args) => `CONCAT(${args.join(', ')})`,
    getAllTables(
        schema?: string | undefined,
        tags?: Record<string, string> | undefined,
    ): Promise<WarehouseTables> {
        throw new Error('Function not implemented.');
    },
    getFields(
        tableName: string,
        schema?: string | undefined,
        database?: string | undefined,
        tags?: Record<string, string> | undefined,
    ): Promise<WarehouseCatalog> {
        throw new Error('Function not implemented.');
    },
    parseWarehouseCatalog(
        rows: Record<string, AnyType>[],
        mapFieldType: (type: string) => DimensionType,
    ): WarehouseCatalog {
        throw new Error('Function not implemented.');
    },
    parseError: (error: Error) => {
        throw error;
    },
};

export const emptyTable = (name: string): CompiledTable => ({
    name,
    label: name,
    database: 'database',
    schema: 'schema',
    sqlTable: `"db"."schema"."${name}"`,
    dimensions: {},
    metrics: {},
    lineageGraph: {},
});

export const EXPLORE_JOIN_CHAIN: Explore = {
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    name: 'myexplore',
    label: 'myexplore',
    baseTable: 'table1',
    tags: [],
    tables: {
        table1: emptyTable('table1'),
        table2: emptyTable('table2'),
        table3: emptyTable('table3'),
        table4: emptyTable('table4'),
        table5: {
            ...emptyTable('table5'),
            dimensions: {
                dim1: {
                    type: DimensionType.NUMBER,
                    name: 'dim1',
                    label: 'dim1',
                    table: 'table5',
                    tableLabel: 'table5',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.dim1',
                    compiledSql: '"table5".dim1',
                    tablesReferences: ['table5'],
                    hidden: false,
                },
            },
            metrics: {
                metric1: {
                    type: MetricType.MAX,
                    fieldType: FieldType.METRIC,
                    table: 'table5',
                    tableLabel: 'table5',
                    name: 'metric1',
                    label: 'metric1',
                    sql: '${TABLE}.number_column',
                    compiledSql: 'MAX("table5".number_column)',
                    tablesReferences: ['table5'],
                    hidden: false,
                },
            },
        },
    },
    joinedTables: [
        {
            table: 'table2',
            sqlOn: '${table2.col} = ${table1.col}',
            compiledSqlOn: '("table2".col) = ("table1".col)',
            type: undefined,
        },
        {
            table: 'table3',
            sqlOn: '${table3.col} = ${table2.col}',
            compiledSqlOn: '("table3".col) = ("table2".col)',
            type: undefined,
        },
        {
            table: 'table4',
            sqlOn: '${table4.col} = ${table3.col}',
            compiledSqlOn: '("table4".col) = ("table3".col)',
            type: undefined,
        },
        {
            table: 'table5',
            sqlOn: '${table5.col} = ${table4.col}',
            compiledSqlOn: '("table5".col) = ("table4".col)',
            type: undefined,
        },
    ],
};

export const EXPLORE_ALL_JOIN_TYPES_CHAIN: Explore = {
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    name: 'myexplore',
    label: 'myexplore',
    baseTable: 'table1',
    tags: [],
    tables: {
        table1: emptyTable('table1'),
        table2: emptyTable('table2'),
        table3: emptyTable('table3'),
        table4: emptyTable('table4'),
        table5: {
            ...emptyTable('table5'),
            dimensions: {
                dim1: {
                    type: DimensionType.NUMBER,
                    name: 'dim1',
                    label: 'dim1',
                    table: 'table5',
                    tableLabel: 'table5',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.dim1',
                    compiledSql: '"table5".dim1',
                    tablesReferences: ['table5'],
                    hidden: false,
                },
            },
            metrics: {
                metric1: {
                    type: MetricType.MAX,
                    fieldType: FieldType.METRIC,
                    table: 'table5',
                    tableLabel: 'table5',
                    name: 'metric1',
                    label: 'metric1',
                    sql: '${TABLE}.number_column',
                    compiledSql: 'MAX("table5".number_column)',
                    tablesReferences: ['table5'],
                    hidden: false,
                },
            },
        },
    },
    joinedTables: [
        {
            table: 'table2',
            sqlOn: '${table2.col} = ${table1.col}',
            compiledSqlOn: '("table2".col) = ("table1".col)',
            type: 'inner',
        },
        {
            table: 'table3',
            sqlOn: '${table3.col} = ${table2.col}',
            compiledSqlOn: '("table3".col) = ("table2".col)',
            type: 'full',
        },
        {
            table: 'table4',
            sqlOn: '${table4.col} = ${table3.col}',
            compiledSqlOn: '("table4".col) = ("table3".col)',
            type: 'left',
        },
        {
            table: 'table5',
            sqlOn: '${table5.col} = ${table4.col}',
            compiledSqlOn: '("table5".col) = ("table4".col)',
            type: 'right',
        },
    ],
};

export const EXPLORE: Explore = {
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    name: 'table1',
    label: 'table1',
    baseTable: 'table1',
    tags: [],
    joinedTables: [
        {
            table: 'table2',
            sqlOn: '${table1.shared} = ${table2.shared}',
            compiledSqlOn: '("table1".shared) = ("table2".shared)',
            type: undefined,
            tablesReferences: ['table1', 'table2'],
            relationship: JoinRelationship.MANY_TO_ONE,
        },
    ],
    tables: {
        table1: {
            name: 'table1',
            label: 'table1',
            database: 'database',
            schema: 'schema',
            sqlTable: '"db"."schema"."table1"',
            primaryKey: ['dim1'],
            dimensions: {
                dim1: {
                    type: DimensionType.NUMBER,
                    name: 'dim1',
                    label: 'dim1',
                    table: 'table1',
                    tableLabel: 'table1',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.dim1',
                    compiledSql: '"table1".dim1',
                    tablesReferences: ['table1'],
                    hidden: false,
                },
                shared: {
                    type: DimensionType.STRING,
                    name: 'shared',
                    label: 'shared',
                    table: 'table1',
                    tableLabel: 'table1',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.shared',
                    compiledSql: '"table1".shared',
                    tablesReferences: ['table1'],
                    hidden: false,
                },
                with_reference: {
                    type: DimensionType.NUMBER,
                    name: 'with_reference',
                    label: 'with_reference',
                    table: 'table1',
                    tableLabel: 'table1',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.dim1 + ${table2.dim2}',
                    compiledSql: '"table1".dim1 + "table2".dim2',
                    tablesReferences: ['table1', 'table2'],
                    hidden: false,
                },
            },
            metrics: {
                metric1: {
                    type: MetricType.MAX,
                    fieldType: FieldType.METRIC,
                    table: 'table1',
                    tableLabel: 'table1',
                    name: 'metric1',
                    label: 'metric1',
                    sql: '${TABLE}.number_column',
                    compiledSql: 'MAX("table1".number_column)',
                    tablesReferences: ['table1'],
                    hidden: false,
                },
                metric_that_references_dim_from_table2: {
                    type: MetricType.MAX,
                    fieldType: FieldType.METRIC,
                    table: 'table1',
                    tableLabel: 'table1',
                    name: 'metric_that_references_dim_from_table2',
                    label: 'Metric that references dim from table2',
                    sql: '${table2.dim2}',
                    compiledSql: 'MAX("table2".dim2)',
                    tablesReferences: ['table1', 'table2'],
                    hidden: false,
                },
            },
            lineageGraph: {},
        },
        table2: {
            name: 'table2',
            label: 'table2',
            database: 'database',
            schema: 'schema',
            sqlTable: '"db"."schema"."table2"',
            primaryKey: ['dim2'],
            dimensions: {
                dim2: {
                    type: DimensionType.NUMBER,
                    name: 'dim2',
                    label: 'dim2',
                    table: 'table2',
                    tableLabel: 'table2',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.dim2',
                    compiledSql: '"table2".dim2',
                    tablesReferences: ['table2'],
                    hidden: false,
                },
                shared: {
                    type: DimensionType.STRING,
                    name: 'shared',
                    label: 'shared',
                    table: 'table2',
                    tableLabel: 'table2',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.shared',
                    compiledSql: '"table2".shared',
                    tablesReferences: ['table2'],
                    hidden: false,
                },
            },
            metrics: {
                metric2: {
                    type: MetricType.MAX,
                    fieldType: FieldType.METRIC,
                    table: 'table2',
                    tableLabel: 'table2',
                    name: 'metric2',
                    label: 'metric2',
                    sql: '${TABLE}.number_column',
                    compiledSql: 'MAX("table2".number_column)',
                    tablesReferences: ['table2'],
                    hidden: false,
                },
                metric3: {
                    type: MetricType.SUM,
                    fieldType: FieldType.METRIC,
                    table: 'table2',
                    tableLabel: 'table2',
                    name: 'metric3',
                    label: 'metric3',
                    sql: '${TABLE}.number_column',
                    compiledSql: 'SUM("table2".number_column)',
                    tablesReferences: ['table2'],
                    hidden: false,
                },
            },
            lineageGraph: {},
        },
    },
};

export const EXPLORE_BIGQUERY: Explore = {
    targetDatabase: SupportedDbtAdapter.BIGQUERY,
    name: 'table1',
    label: 'table1',
    baseTable: 'table1',
    tags: [],
    joinedTables: [
        {
            table: 'table2',
            sqlOn: '${table1.shared} = ${table2.shared}',
            compiledSqlOn: '(table1.shared) = (table2.shared)',
            type: undefined,
        },
    ],
    tables: {
        table1: {
            name: 'table1',
            label: 'table1',
            database: 'database',
            schema: 'schema',
            sqlTable: '`db`.`schema`.`table1`',
            dimensions: {
                dim1: {
                    type: DimensionType.NUMBER,
                    name: 'dim1',
                    label: 'dim1',
                    table: 'table1',
                    tableLabel: 'table1',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.dim1',
                    compiledSql: '`table1`.dim1',
                    tablesReferences: ['table1'],
                    hidden: false,
                },
                shared: {
                    type: DimensionType.STRING,
                    name: 'shared',
                    label: 'shared',
                    table: 'table1',
                    tableLabel: 'table1',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.shared',
                    compiledSql: '`table1`.shared',
                    tablesReferences: ['table1'],
                    hidden: false,
                },
            },
            metrics: {
                metric1: {
                    type: MetricType.MAX,
                    fieldType: FieldType.METRIC,
                    table: 'table1',
                    tableLabel: 'table1',
                    name: 'metric1',
                    label: 'metric1',
                    sql: '${TABLE}.number_column',
                    compiledSql: 'MAX(`table1`.number_column)',
                    tablesReferences: ['table1'],
                    hidden: false,
                },
            },
            lineageGraph: {},
        },
        table2: {
            name: 'table2',
            label: 'table2',
            database: 'database',
            schema: 'schema',
            sqlTable: '"db"."schema"."table2"',
            dimensions: {
                dim2: {
                    type: DimensionType.NUMBER,
                    name: 'dim2',
                    label: 'dim2',
                    table: 'table2',
                    tableLabel: 'table2',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.dim2',
                    compiledSql: '`table2`.dim2',
                    tablesReferences: ['table2'],
                    hidden: false,
                },
                shared: {
                    type: DimensionType.STRING,
                    name: 'shared',
                    label: 'shared',
                    table: 'table2',
                    tableLabel: 'table2',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.shared',
                    compiledSql: '`table2`.shared',
                    tablesReferences: ['table2'],
                    hidden: false,
                },
            },
            metrics: {
                metric2: {
                    type: MetricType.MAX,
                    fieldType: FieldType.METRIC,
                    table: 'table2',
                    tableLabel: 'table2',
                    name: 'metric2',
                    label: 'metric2',
                    sql: '${TABLE}.number_column',
                    compiledSql: 'MAX(`table2`.number_column)',
                    tablesReferences: ['table2'],
                    hidden: false,
                },
            },
            lineageGraph: {},
        },
    },
};

export const METRIC_QUERY_JOIN_CHAIN: CompiledMetricQuery = {
    exploreName: 'table1',
    dimensions: ['table5_dim1'],
    metrics: ['table5_metric1'],
    filters: {},
    sorts: [],
    limit: 5,
    tableCalculations: [],
    compiledTableCalculations: [],
    compiledAdditionalMetrics: [],
    compiledCustomDimensions: [],
};

export const EXPLORE_WITH_SQL_FILTER: Explore = {
    ...EXPLORE,
    tables: {
        ...EXPLORE.tables,
        table1: {
            ...EXPLORE.tables.table1,
            sqlWhere: "${lightdash.attribute.country} = 'US'",
            uncompiledSqlWhere: "${lightdash.attribute.country} = 'US'",
        },
    },
};

export const METRIC_QUERY_JOIN_CHAIN_SQL = `SELECT "table5".dim1               AS "table5_dim1",
                                                   MAX("table5".number_column) AS "table5_metric1"
                                            FROM "db"."schema"."table1" AS "table1"
                                                     LEFT OUTER JOIN "db"."schema"."table2" AS "table2"
                                                                     ON ("table2".col) = ("table1".col)
                                                     LEFT OUTER JOIN "db"."schema"."table3" AS "table3"
                                                                     ON ("table3".col) = ("table2".col)
                                                     LEFT OUTER JOIN "db"."schema"."table4" AS "table4"
                                                                     ON ("table4".col) = ("table3".col)
                                                     LEFT OUTER JOIN "db"."schema"."table5" AS "table5"
                                                                     ON ("table5".col) = ("table4".col)

                                            GROUP BY 1 LIMIT 5`;

export const METRIC_QUERY_ALL_JOIN_TYPES_CHAIN_SQL = `SELECT "table5".dim1               AS "table5_dim1",
                                                             MAX("table5".number_column) AS "table5_metric1"
                                                      FROM "db"."schema"."table1" AS "table1"
                                                               INNER JOIN "db"."schema"."table2" AS "table2"
                                                                          ON ("table2".col) = ("table1".col)
                                                               FULL OUTER JOIN "db"."schema"."table3" AS "table3"
                                                                               ON ("table3".col) = ("table2".col)
                                                               LEFT OUTER JOIN "db"."schema"."table4" AS "table4"
                                                                               ON ("table4".col) = ("table3".col)
                                                               RIGHT OUTER JOIN "db"."schema"."table5" AS "table5"
                                                                                ON ("table5".col) = ("table4".col)

                                                      GROUP BY 1 LIMIT 5`;

export const METRIC_QUERY: CompiledMetricQuery = {
    exploreName: 'table1',
    dimensions: ['table1_dim1'],
    metrics: ['table1_metric1'],
    filters: {},
    sorts: [{ fieldId: 'table1_metric1', descending: true }],
    limit: 10,
    tableCalculations: [
        {
            name: 'calc3',
            displayName: '',
            sql: '${table1.dim1} + ${table1.metric1}',
        },
    ],
    compiledTableCalculations: [
        {
            name: 'calc3',
            displayName: '',
            sql: '${table1.dim1} + ${table1.metric1}',
            compiledSql: 'table1_dim1 + table1_metric1',
        },
    ],
    compiledAdditionalMetrics: [],
    compiledCustomDimensions: [],
};

export const METRIC_QUERY_WITH_CUSTOM_DIMENSION: CompiledMetricQuery = {
    exploreName: 'table1',
    dimensions: ['table1_dim1', 'age_range'],
    metrics: ['table1_metric1'],
    filters: {},
    sorts: [{ fieldId: 'table1_metric1', descending: true }],
    limit: 10,
    compiledAdditionalMetrics: [],
    compiledTableCalculations: [],
    tableCalculations: [],
    compiledCustomDimensions: [
        {
            id: 'age_range',
            name: 'Age range',
            type: CustomDimensionType.BIN,
            dimensionId: 'table1_dim1',
            table: 'table1',
            binType: BinType.FIXED_NUMBER,
            binNumber: 3,
        },
    ],
};

export const METRIC_QUERY_TWO_TABLES: CompiledMetricQuery = {
    exploreName: 'table1',
    dimensions: ['table1_dim1'],
    metrics: ['table2_metric2'],
    filters: {},
    sorts: [{ fieldId: 'table2_metric2', descending: true }],
    limit: 10,
    tableCalculations: [
        {
            name: 'calc3',
            displayName: '',
            sql: '${table1.dim1} + ${table2.metric2}',
        },
    ],
    compiledTableCalculations: [
        {
            name: 'calc3',
            displayName: '',
            sql: '${table1.dim1} + ${table2.metric2}',
            compiledSql: 'table1_dim1 + table2_metric2',
        },
    ],
    compiledAdditionalMetrics: [],
    compiledCustomDimensions: [],
};

export const METRIC_QUERY_WITH_TABLE_REFERENCE: CompiledMetricQuery = {
    exploreName: 'table1',
    dimensions: ['table1_with_reference'],
    metrics: [],
    filters: {},
    sorts: [],
    limit: 10,
    tableCalculations: [],
    compiledTableCalculations: [],
    compiledAdditionalMetrics: [],
    compiledCustomDimensions: [],
};

export const METRIC_QUERY_WITH_TABLE_REFERENCE_SQL = `SELECT "table1".dim1 + "table2".dim2 AS "table1_with_reference"
                                                      FROM "db"."schema"."table1" AS "table1"
                                                               LEFT OUTER JOIN "db"."schema"."table2" AS "table2"
                                                                               ON ("table1".shared) = ("table2".shared)

                                                      GROUP BY 1 LIMIT 10`;

export const METRIC_QUERY_WITH_FILTER: CompiledMetricQuery = {
    exploreName: 'table1',
    dimensions: ['table1_dim1'],
    metrics: [],
    filters: {
        dimensions: {
            id: 'root',
            and: [
                {
                    id: '1',
                    target: {
                        fieldId: 'table2_dim2',
                    },
                    operator: FilterOperator.EQUALS,
                    values: [0],
                },
            ],
        },
    },
    sorts: [{ fieldId: 'table1_dim1', descending: true }],
    limit: 10,
    tableCalculations: [],
    compiledTableCalculations: [],
    compiledAdditionalMetrics: [],
    compiledCustomDimensions: [],
};

export const METRIC_QUERY_WITH_METRIC_FILTER: CompiledMetricQuery = {
    exploreName: 'table1',
    dimensions: ['table1_dim1'],
    metrics: ['table1_metric1'],
    filters: {
        metrics: {
            id: 'root',
            and: [
                {
                    id: '1',
                    target: {
                        fieldId: 'table1_metric1',
                    },
                    operator: FilterOperator.EQUALS,
                    values: [0],
                },
            ],
        },
    },
    sorts: [{ fieldId: 'table1_metric1', descending: true }],
    limit: 10,
    tableCalculations: [],
    compiledTableCalculations: [],
    compiledAdditionalMetrics: [],
    compiledCustomDimensions: [],
};

export const METRIC_QUERY_WITH_METRIC_DISABLED_FILTER_THAT_REFERENCES_JOINED_TABLE_DIM: CompiledMetricQuery =
    {
        exploreName: 'table1',
        dimensions: [],
        metrics: ['table1_metric_that_references_dim_from_table2'],
        filters: {
            metrics: {
                id: 'root',
                and: [
                    {
                        id: '1',
                        target: {
                            fieldId:
                                'table1_metric_that_references_dim_from_table2',
                        },
                        operator: FilterOperator.EQUALS,
                        values: [],
                        disabled: true,
                    },
                ],
            },
        },
        sorts: [],
        limit: 10,
        tableCalculations: [],
        compiledTableCalculations: [],
        compiledAdditionalMetrics: [],
        compiledCustomDimensions: [],
    };

export const METRIC_QUERY_WITH_NESTED_METRIC_FILTERS: CompiledMetricQuery = {
    exploreName: 'table1',
    dimensions: ['table1_dim1'],
    metrics: ['table1_metric1'],
    filters: {
        metrics: {
            id: 'root',
            and: [
                {
                    id: '1',
                    target: {
                        fieldId: 'table1_metric1',
                    },
                    operator: FilterOperator.NOT_NULL,
                    values: [],
                },
                {
                    id: 'root',
                    or: [
                        {
                            id: '1',
                            target: {
                                fieldId: 'table1_metric1',
                            },
                            operator: FilterOperator.EQUALS,
                            values: [0],
                        },
                        {
                            id: '1',
                            target: {
                                fieldId: 'table1_metric1',
                            },
                            operator: FilterOperator.EQUALS,
                            values: [1],
                        },
                    ],
                },
            ],
        },
    },
    sorts: [{ fieldId: 'table1_metric1', descending: true }],
    limit: 10,
    tableCalculations: [],
    compiledTableCalculations: [],
    compiledAdditionalMetrics: [],
    compiledCustomDimensions: [],
};

export const METRIC_QUERY_WITH_FILTER_OR_OPERATOR: CompiledMetricQuery = {
    exploreName: 'table1',
    dimensions: ['table1_dim1'],
    metrics: [],
    filters: {
        dimensions: {
            id: 'root',
            or: [
                {
                    id: '1',
                    target: {
                        fieldId: 'table2_dim2',
                    },
                    operator: FilterOperator.EQUALS,
                    values: [0],
                },
                {
                    id: '2',
                    target: {
                        fieldId: 'table2_dim2',
                    },
                    operator: FilterOperator.NOT_NULL,
                },
            ],
        },
    },
    sorts: [{ fieldId: 'table1_dim1', descending: true }],
    limit: 10,
    tableCalculations: [],
    compiledTableCalculations: [],
    compiledAdditionalMetrics: [],
    compiledCustomDimensions: [],
};

export const METRIC_QUERY_WITH_DISABLED_FILTER: CompiledMetricQuery = {
    exploreName: 'table1',
    dimensions: ['table1_dim1'],
    metrics: ['table1_metric1'],
    filters: {
        metrics: {
            id: 'root',
            and: [
                {
                    id: '1',
                    target: {
                        fieldId: 'table1_metric1',
                    },
                    operator: FilterOperator.EQUALS,
                    values: [],
                    disabled: true,
                },
            ],
        },
    },
    sorts: [{ fieldId: 'table1_metric1', descending: true }],
    limit: 10,
    tableCalculations: [],
    compiledTableCalculations: [],
    compiledAdditionalMetrics: [],
    compiledCustomDimensions: [],
};

export const METRIC_QUERY_WITH_FILTER_AND_DISABLED_FILTER: CompiledMetricQuery =
    {
        exploreName: 'table1',
        dimensions: ['table1_dim1'],
        metrics: [],
        filters: {
            dimensions: {
                id: 'root',
                and: [
                    {
                        id: '1-2',
                        target: {
                            fieldId: 'table1_dim1',
                        },
                        operator: FilterOperator.EQUALS,
                        values: [1],
                    },
                    {
                        id: '2',
                        target: {
                            fieldId: 'table2_dim2',
                        },
                        operator: FilterOperator.NOT_NULL,
                        disabled: true,
                    },
                ],
            },
        },
        sorts: [{ fieldId: 'table1_dim1', descending: true }],
        limit: 10,
        tableCalculations: [],
        compiledTableCalculations: [],
        compiledAdditionalMetrics: [],
        compiledCustomDimensions: [],
    };

export const METRIC_QUERY_WITH_NESTED_FILTER_OPERATORS: CompiledMetricQuery = {
    exploreName: 'table1',
    dimensions: ['table1_dim1'],
    metrics: [],
    filters: {
        dimensions: {
            id: 'root',
            and: [
                {
                    id: '1',
                    or: [
                        {
                            id: '1-1',
                            target: {
                                fieldId: 'table2_dim2',
                            },
                            operator: FilterOperator.EQUALS,
                            values: [0],
                        },
                        {
                            id: '1-2',
                            target: {
                                fieldId: 'table2_dim2',
                            },
                            operator: FilterOperator.EQUALS,
                            values: [1],
                        },
                    ],
                },
                {
                    id: '2',
                    target: {
                        fieldId: 'table2_dim2',
                    },
                    operator: FilterOperator.NOT_NULL,
                },
            ],
        },
    },
    sorts: [{ fieldId: 'table1_dim1', descending: true }],
    limit: 10,
    tableCalculations: [],
    compiledTableCalculations: [],
    compiledAdditionalMetrics: [],
    compiledCustomDimensions: [],
};

export const METRIC_QUERY_WITH_EMPTY_FILTER: CompiledMetricQuery = {
    exploreName: 'table1',
    dimensions: ['table1_dim1'],
    metrics: [],
    filters: {
        dimensions: {
            id: 'true',
            and: [],
        },
    },
    sorts: [{ fieldId: 'table1_dim1', descending: true }],
    limit: 10,
    tableCalculations: [],
    compiledTableCalculations: [],
    compiledAdditionalMetrics: [],
    compiledCustomDimensions: [],
};

export const METRIC_QUERY_WITH_EMPTY_METRIC_FILTER: CompiledMetricQuery = {
    exploreName: 'table1',
    dimensions: ['table1_dim1'],
    metrics: ['table1_metric1'],
    filters: {
        metrics: {
            id: 'root',
            and: [],
        },
    },
    sorts: [{ fieldId: 'table1_metric1', descending: true }],
    limit: 10,
    tableCalculations: [],
    compiledTableCalculations: [],
    compiledAdditionalMetrics: [],
    compiledCustomDimensions: [],
};

export const METRIC_QUERY_WITH_ADDITIONAL_METRIC: CompiledMetricQuery = {
    exploreName: 'table1',
    dimensions: ['table1_dim1'],
    metrics: ['table2_additional_metric'],
    filters: {},
    sorts: [{ fieldId: 'table2_additional_metric', descending: true }],
    limit: 10,
    tableCalculations: [
        {
            name: 'calc3',
            displayName: '',
            sql: '${table1.dim1} + ${table2.additional_metric}',
        },
    ],
    compiledTableCalculations: [
        {
            name: 'calc3',
            displayName: '',
            sql: '${table1.dim1} + ${table2.additional_metric}',
            compiledSql: 'table1_dim1 + table2_additional_metric',
        },
    ],
    additionalMetrics: [
        {
            type: MetricType.MAX,
            table: 'table2',
            name: 'additional_metric',
            sql: '${TABLE}.number_column',
        },
    ],
    compiledAdditionalMetrics: [
        {
            type: MetricType.MAX,
            fieldType: FieldType.METRIC,
            table: 'table2',
            tableLabel: 'table2',
            name: 'additional_metric',
            label: 'Additional Metric',
            sql: '${TABLE}.number_column',
            compiledSql: 'MAX("table2".number_column)',
            tablesReferences: ['table2'],
            hidden: false,
        },
    ],
    compiledCustomDimensions: [],
};

export const METRIC_QUERY_WITH_EMPTY_FILTER_GROUPS = {
    ...METRIC_QUERY,
    filters: {
        dimensions: {
            id: '1',
            and: [
                {
                    id: '2',
                    or: [],
                },
            ],
        },
    },
};

export const METRIC_QUERY_WITH_TABLE_CALCULATION_FILTER: CompiledMetricQuery = {
    exploreName: 'table1',
    dimensions: ['table1_dim1'],
    metrics: ['table1_metric1'],
    filters: {
        tableCalculations: {
            id: 'root',
            and: [
                {
                    id: '1',
                    target: {
                        fieldId: 'calc3',
                    },
                    operator: FilterOperator.EQUALS,
                    values: ['my value'],
                },
            ],
        },
    },
    sorts: [{ fieldId: 'table1_metric1', descending: true }],
    limit: 10,
    tableCalculations: [
        {
            name: 'calc3',
            displayName: '',
            sql: '${table1.dim1} + ${table1.metric1}',
        },
    ],
    compiledTableCalculations: [
        {
            name: 'calc3',
            displayName: '',
            sql: '${table1.dim1} + ${table1.metric1}',
            compiledSql: 'table1_dim1 + table1_metric1',
        },
    ],
    compiledAdditionalMetrics: [],
    compiledCustomDimensions: [],
};

export const COMPILED_DIMENSION: CompiledDimension = {
    type: DimensionType.NUMBER,
    name: 'dim1',
    label: 'dim1',
    table: 'table5',
    tableLabel: 'table5',
    fieldType: FieldType.DIMENSION,
    sql: '${TABLE}.dim1',
    compiledSql: '"table5".dim1',
    tablesReferences: ['table5'],
    hidden: false,
};

export const METRIC_QUERY_SQL = `WITH metrics AS (
                                    SELECT 
                                        "table1".dim1               AS "table1_dim1",
                                        MAX("table1".number_column) AS "table1_metric1"
                                    FROM "db"."schema"."table1" AS "table1"
                                    GROUP BY 1
                                 )
                                 SELECT *,
                                        table1_dim1 + table1_metric1 AS "calc3"
                                 FROM metrics

                                 ORDER BY "table1_metric1" DESC LIMIT 10`;

export const METRIC_QUERY_SQL_BIGQUERY = `WITH metrics AS (
                                            SELECT \`table1\`.dim1               AS \`table1_dim1\`,
                                            MAX(\`table1\`.number_column) AS \`table1_metric1\`
                                            FROM \`db\`.\`schema\`.\`table1\` AS \`table1\`
                                            GROUP BY 1
                                          )
                                          SELECT *,
                                                 table1_dim1 + table1_metric1 AS \`calc3\`
                                          FROM metrics

                                          ORDER BY \`table1_metric1\` DESC LIMIT 10`;

export const METRIC_QUERY_TWO_TABLES_SQL = `WITH metrics AS (
                                                SELECT "table1".dim1               AS "table1_dim1",
                                                MAX("table2".number_column) AS "table2_metric2"
                                                FROM "db"."schema"."table1" AS "table1"
                                                LEFT OUTER JOIN "db"."schema"."table2" AS "table2"
                                                ON ("table1".shared) = ("table2".shared)
                                                GROUP BY 1
                                            )
                                            SELECT *,
                                                   table1_dim1 + table2_metric2 AS "calc3"
                                            FROM metrics

                                            ORDER BY "table2_metric2" DESC LIMIT 10`;

export const METRIC_QUERY_WITH_ADDITIONAL_METRIC_SQL = `WITH metrics AS (
                                                            SELECT "table1".dim1               AS "table1_dim1",
                                                            MAX("table2".number_column) AS "table2_additional_metric"
                                                            FROM "db"."schema"."table1" AS "table1"
                                                            LEFT OUTER JOIN "db"."schema"."table2" AS "table2"
                                                            ON ("table1".shared) = ("table2".shared)
                                                            GROUP BY 1
                                                        )
                                                        SELECT *,
                                                               table1_dim1 + table2_additional_metric AS "calc3"
                                                        FROM metrics

                                                        ORDER BY "table2_additional_metric" DESC LIMIT 10`;

export const METRIC_QUERY_WITH_FILTER_SQL = `SELECT "table1".dim1 AS "table1_dim1"
                                             FROM "db"."schema"."table1" AS "table1"
                                                      LEFT OUTER JOIN "db"."schema"."table2" AS "table2"
                                                                      ON ("table1".shared) = ("table2".shared)
                                             WHERE ((
                                                 ("table2".dim2) IN (0)
                                                 ))
                                             GROUP BY 1
                                             ORDER BY "table1_dim1" DESC LIMIT 10`;

export const METRIC_QUERY_WITH_EMPTY_FILTER_SQL = `SELECT "table1".dim1 AS "table1_dim1"
                                                   FROM "db"."schema"."table1" AS "table1"


                                                   GROUP BY 1
                                                   ORDER BY "table1_dim1" DESC LIMIT 10`;

export const METRIC_QUERY_WITH_EMPTY_METRIC_FILTER_SQL = `SELECT "table1".dim1               AS "table1_dim1",
                                                                 MAX("table1".number_column) AS "table1_metric1"
                                                          FROM "db"."schema"."table1" AS "table1"


                                                          GROUP BY 1
                                                          ORDER BY "table1_metric1" DESC LIMIT 10`;

export const METRIC_QUERY_WITH_FILTER_OR_OPERATOR_SQL = `SELECT "table1".dim1 AS "table1_dim1"
                                                         FROM "db"."schema"."table1" AS "table1"
                                                                  LEFT OUTER JOIN "db"."schema"."table2" AS "table2"
                                                                                  ON ("table1".shared) = ("table2".shared)
                                                         WHERE ((
                                                                    ("table2".dim2) IN (0)
                                                                    ) OR (
                                                                    ("table2".dim2) IS NOT NULL
                                                                    ))
                                                         GROUP BY 1
                                                         ORDER BY "table1_dim1" DESC LIMIT 10`;

export const METRIC_QUERY_WITH_DISABLED_FILTER_SQL = `WITH metrics AS (
                                                        SELECT "table1".dim1               AS "table1_dim1",
                                                        MAX("table1".number_column) AS "table1_metric1"
                                                        FROM "db"."schema"."table1" AS "table1"
                                                        GROUP BY 1
                                                      )
                                                      SELECT *
                                                      FROM metrics
                                                      WHERE ((
                                                          1=1
                                                          ))
                                                      ORDER BY "table1_metric1" DESC LIMIT 10`;

export const METRIC_QUERY_WITH_NESTED_FILTER_OPERATORS_SQL = `SELECT "table1".dim1 AS "table1_dim1"
                                                              FROM "db"."schema"."table1" AS "table1"
                                                                       LEFT OUTER JOIN "db"."schema"."table2" AS "table2"
                                                                                       ON ("table1".shared) = ("table2".shared)
                                                              WHERE (((
                                                                          ("table2".dim2) IN (0)
                                                                          ) OR (
                                                                          ("table2".dim2) IN (1)
                                                                          )) AND (
                                                                         ("table2".dim2) IS NOT NULL
                                                                         ))
                                                              GROUP BY 1
                                                              ORDER BY "table1_dim1" DESC LIMIT 10`;

export const METRIC_QUERY_WITH_METRIC_FILTER_SQL = `WITH metrics AS (
                                                        SELECT "table1".dim1               AS "table1_dim1",
                                                        MAX("table1".number_column) AS "table1_metric1"
                                                        FROM "db"."schema"."table1" AS "table1"
                                                        GROUP BY 1
                                                    )
                                                    SELECT *
                                                    FROM metrics
                                                    WHERE ((
                                                        ("table1_metric1") IN (0)
                                                        ))
                                                    ORDER BY "table1_metric1" DESC LIMIT 10`;

export const METRIC_QUERY_WITH_METRIC_DISABLED_FILTER_THAT_REFERENCES_JOINED_TABLE_DIM_SQL = `WITH metrics AS (
                                                                                                   SELECT MAX("table2".dim2) AS "table1_metric_that_references_dim_from_table2"
                                                                                                   FROM "db"."schema"."table1" AS "table1"
                                                                                                    LEFT OUTER JOIN "db"."schema"."table2" AS "table2"
                                                                                                    ON ("table1".shared) = ("table2".shared)
                                                                                                )
                                                                                              SELECT *
                                                                                              FROM metrics
                                                                                              WHERE ((
                                                                                                  1=1
                                                                                                  )) LIMIT 10`;

export const METRIC_QUERY_WITH_METRIC_FILTER_AND_ONE_DISABLED_SQL = `SELECT "table1".dim1 AS "table1_dim1"
                                                                     FROM "db"."schema"."table1" AS "table1"
                                                                              LEFT OUTER JOIN "db"."schema"."table2" AS "table2"
                                                                                              ON ("table1".shared) = ("table2".shared)
                                                                     WHERE ((
                                                                                ("table1".dim1) IN (1)
                                                                                ) AND (
                                                                                1=1
                                                                                ))
                                                                     GROUP BY 1
                                                                     ORDER BY "table1_dim1" DESC LIMIT 10`;

export const METRIC_QUERY_WITH_SQL_FILTER = `SELECT "table1".dim1               AS "table1_dim1",
                                                    MAX("table1".number_column) AS "table1_metric1"
                                             FROM "db"."schema"."table1" AS "table1"

                                             WHERE ('EU' = 'US')
                                             GROUP BY 1
                                             ORDER BY "table1_metric1" DESC LIMIT 10`;

export const METRIC_QUERY_WITH_NESTED_METRIC_FILTERS_SQL = `WITH metrics AS (
                                                                            SELECT "table1".dim1               AS "table1_dim1",
                                                                                    MAX("table1".number_column) AS "table1_metric1"
                                                                             FROM "db"."schema"."table1" AS "table1"
                                                                             GROUP BY 1
                                                                             )
                                                            SELECT *
                                                            FROM metrics
                                                            WHERE ((
                                                                       ("table1_metric1") IS NOT NULL
                                                                       ) AND ((
                                                                                  ("table1_metric1") IN (0)
                                                                                  ) OR (
                                                                                  ("table1_metric1") IN (1)
                                                                                  )))
                                                            ORDER BY "table1_metric1" DESC LIMIT 10`;

export const METRIC_QUERY_WITH_TABLE_CALCULATION_FILTER_SQL = `WITH metrics AS (
                                                                                SELECT "table1".dim1               AS "table1_dim1",
                                                                                       MAX("table1".number_column) AS "table1_metric1"
                                                                                FROM "db"."schema"."table1" AS "table1"


                                                                                GROUP BY 1
                                                                                ),
                                                                    table_calculations AS (
                                                                                            SELECT *,
                                                                                                  table1_dim1 + table1_metric1 AS "calc3"
                                                                                           FROM metrics
                                                                                           )
                                                               SELECT *
                                                               FROM table_calculations
                                                               WHERE ((
                                                                   ("calc3") IN ('my value')
                                                                   ))
                                                               ORDER BY "table1_metric1" DESC LIMIT 10`;

export const EXPECTED_SQL_WITH_CUSTOM_DIMENSION_BIN_NUMBER = `WITH age_range_cte
                                                                       AS ( SELECT FLOOR(MIN("table1".dim1))                            AS min_id,
                                                                                  CEIL(MAX("table1".dim1))                             AS max_id,
                                                                                  FLOOR((MAX("table1".dim1) - MIN("table1".dim1)) / 3) AS bin_width
                                                                           FROM "db"."schema"."table1" AS \`table1\` )
                                                              SELECT "table1".dim1               AS \`table1_dim1\`,
                                                                     CASE
                                                                         WHEN "table1".dim1 IS NULL THEN NULL
                                                                         WHEN "table1".dim1 >= age_range_cte.min_id +
                                                                                               age_range_cte.bin_width *
                                                                                               0 AND "table1".dim1 <
                                                                                                     age_range_cte.min_id +
                                                                                                     age_range_cte.bin_width *
                                                                                                     1 THEN CONCAT(age_range_cte.min_id +
                                                                                 age_range_cte.bin_width * 0, ' - ',
                                                                                 age_range_cte.min_id +
                                                                                 age_range_cte.bin_width * 1)
                                                                         WHEN "table1".dim1 >= age_range_cte.min_id +
                                                                                               age_range_cte.bin_width *
                                                                                               1 AND "table1".dim1 <
                                                                                                     age_range_cte.min_id +
                                                                                                     age_range_cte.bin_width *
                                                                                                     2 THEN CONCAT(age_range_cte.min_id +
                                                                                 age_range_cte.bin_width * 1, ' - ',
                                                                                 age_range_cte.min_id +
                                                                                 age_range_cte.bin_width * 2)
                                                                         ELSE CONCAT(age_range_cte.min_id +
                                                                                     age_range_cte.bin_width * 2, ' - ',
                                                                                     age_range_cte.max_id)
                                                                         END
                                                                                                 AS \`age_range\`
                                                                      ,
                                                                     MAX("table1".number_column) AS \`table1_metric1\`
                                                              FROM "db"."schema"."table1" AS \`table1\`

                                                                       CROSS JOIN age_range_cte

                                                              GROUP BY 1,2
                                                              ORDER BY \`table1_metric1\` DESC LIMIT 10`;

export const EXPECTED_SQL_WITH_CUSTOM_DIMENSION_BIN_WIDTH = `SELECT "table1".dim1               AS \`table1_dim1\`,
                                                                    CONCAT(FLOOR("table1".dim1 / 10) * 10, ' - ',
                                                                           (FLOOR("table1".dim1 / 10) + 1) * 10 -
                                                                           1)                   AS \`age_range\`,
                                                                    MAX("table1".number_column) AS \`table1_metric1\`
                                                             FROM "db"."schema"."table1" AS \`table1\`


                                                             GROUP BY 1,2
                                                             ORDER BY \`table1_metric1\` DESC LIMIT 10`;

export const EXPECTED_SQL_WITH_CUSTOM_DIMENSION_AND_TABLE_CALCULATION = `WITH age_range_cte
                                                                                  AS (
                                                                                  SELECT FLOOR(MIN("table1".dim1))                            AS min_id,
                                                                                             CEIL(MAX("table1".dim1))                             AS max_id,
                                                                                             FLOOR((MAX("table1".dim1) - MIN("table1".dim1)) / 3) AS bin_width
                                                                                      FROM "db"."schema"."table1" AS \`table1\`
                                                                                      ),
                                                                              metrics
                                                                                  AS (
                                                                                  SELECT "table1".dim1               AS \`table1_dim1\`,
                                                                                             CASE
                                                                                                 WHEN "table1".dim1 IS NULL
                                                                                                     THEN NULL
                                                                                                 WHEN "table1".dim1 >=
                                                                                                      age_range_cte.min_id +
                                                                                                      age_range_cte.bin_width *
                                                                                                      0 AND
                                                                                                      "table1".dim1 <
                                                                                                      age_range_cte.min_id +
                                                                                                      age_range_cte.bin_width *
                                                                                                      1
                                                                                                     THEN CONCAT(age_range_cte.min_id +
                                                                                                         age_range_cte.bin_width *
                                                                                                         0,
                                                                                                         ' - ',
                                                                                                         age_range_cte.min_id +
                                                                                                         age_range_cte.bin_width *
                                                                                                         1)
                                                                                                 WHEN "table1".dim1 >=
                                                                                                      age_range_cte.min_id +
                                                                                                      age_range_cte.bin_width *
                                                                                                      1 AND
                                                                                                      "table1".dim1 <
                                                                                                      age_range_cte.min_id +
                                                                                                      age_range_cte.bin_width *
                                                                                                      2
                                                                                                     THEN CONCAT(age_range_cte.min_id +
                                                                                                         age_range_cte.bin_width *
                                                                                                         1,
                                                                                                         ' - ',
                                                                                                         age_range_cte.min_id +
                                                                                                         age_range_cte.bin_width *
                                                                                                         2)
                                                                                                 ELSE CONCAT(age_range_cte.min_id +
                                                                                                         age_range_cte.bin_width *
                                                                                                         2,
                                                                                                         ' - ',
                                                                                                         age_range_cte.max_id)
                                                                                                 END
                                                                                                                         AS \`age_range\`
                                                                                              ,
                                                                                             MAX("table1".number_column) AS \`table1_metric1\`
                                                                                      FROM "db"."schema"."table1" AS \`table1\`

                                                                                               CROSS JOIN age_range_cte

                                                                                      GROUP BY 1,2
                                                                                      )
                                                                         SELECT *,
                                                                                table1_dim1 + 1 AS \`calc3\`
                                                                         FROM metrics

                                                                         ORDER BY \`table1_metric1\` DESC LIMIT 10`;

export const EXPECTED_SQL_WITH_SORTED_CUSTOM_DIMENSION = `WITH age_range_cte
                                                                   AS (
                                                                        SELECT FLOOR(MIN("table1".dim1))                            AS min_id,
                                                                              CEIL(MAX("table1".dim1))                             AS max_id,
                                                                              FLOOR((MAX("table1".dim1) - MIN("table1".dim1)) / 3) AS bin_width
                                                                       FROM "db"."schema"."table1" AS \`table1\`
                                                                       )
                                                          SELECT "table1".dim1               AS \`table1_dim1\`,
                                                                 CASE
                                                                     WHEN "table1".dim1 IS NULL THEN NULL
                                                                     WHEN "table1".dim1 >= age_range_cte.min_id +
                                                                                           age_range_cte.bin_width *
                                                                                           0 AND
                                                                          "table1".dim1 < age_range_cte.min_id +
                                                                                          age_range_cte.bin_width * 1
                                                                         THEN CONCAT(age_range_cte.min_id +
                                                                             age_range_cte.bin_width * 0, ' - ',
                                                                             age_range_cte.min_id +
                                                                             age_range_cte.bin_width * 1)
                                                                     WHEN "table1".dim1 >= age_range_cte.min_id +
                                                                                           age_range_cte.bin_width *
                                                                                           1 AND
                                                                          "table1".dim1 < age_range_cte.min_id +
                                                                                          age_range_cte.bin_width * 2
                                                                         THEN CONCAT(age_range_cte.min_id +
                                                                             age_range_cte.bin_width * 1, ' - ',
                                                                             age_range_cte.min_id +
                                                                             age_range_cte.bin_width * 2)
                                                                     ELSE CONCAT(age_range_cte.min_id +
                                                                                 age_range_cte.bin_width * 2, ' - ',
                                                                                 age_range_cte.max_id)
                                                                     END
                                                                                             AS \`age_range\`,
                                                                 CASE
                                                                     WHEN "table1".dim1 IS NULL THEN 3
                                                                     WHEN "table1".dim1 >= age_range_cte.min_id +
                                                                                           age_range_cte.bin_width *
                                                                                           0 AND
                                                                          "table1".dim1 < age_range_cte.min_id +
                                                                                          age_range_cte.bin_width * 1
                                                                         THEN 0
                                                                     WHEN "table1".dim1 >= age_range_cte.min_id +
                                                                                           age_range_cte.bin_width *
                                                                                           1 AND
                                                                          "table1".dim1 < age_range_cte.min_id +
                                                                                          age_range_cte.bin_width * 2
                                                                         THEN 1
                                                                     ELSE 2
                                                                     END
                                                                                             AS \`age_range_order\`,
                                                                 MAX("table1".number_column) AS \`table1_metric1\`
                                                          FROM "db"."schema"."table1" AS \`table1\`

                                                                   CROSS JOIN age_range_cte

                                                          GROUP BY 1,2,3
                                                          ORDER BY \`age_range_order\` DESC LIMIT 10`;

export const EXPECTED_SQL_WITH_CUSTOM_DIMENSION_BIN_WIDTH_ON_POSTGRES = `SELECT "table1".dim1               AS "table1_dim1",
                                                                                (FLOOR("table1".dim1 / 10) *
                                                                                 10 || ' - ' ||
                                                                                 (FLOOR("table1".dim1 / 10) + 1) * 10 -
                                                                                 1)                         AS "age_range",
                                                                                MAX("table1".number_column) AS "table1_metric1"
                                                                         FROM "db"."schema"."table1" AS "table1"


                                                                         GROUP BY 1,2
                                                                         ORDER BY "table1_metric1" DESC LIMIT 10`;

export const INTRINSIC_USER_ATTRIBUTES: IntrinsicUserAttributes = {
    email: 'mock@lightdash.com',
};

export const COMPILED_MONTH_NAME_DIMENSION: CompiledDimension = {
    type: DimensionType.STRING,
    name: 'dim1',
    label: 'dim1',
    table: 'table1',
    tableLabel: 'table1',
    fieldType: FieldType.DIMENSION,
    sql: '${TABLE}.dim1',
    compiledSql: '"table1".dim1',
    tablesReferences: ['table1'],
    timeInterval: TimeFrames.MONTH_NAME,
    hidden: false,
};

export const MONTH_NAME_SORT_SQL = `(
    CASE
        WHEN "table1_dim1" = 'January' THEN 1
        WHEN "table1_dim1" = 'February' THEN 2
        WHEN "table1_dim1" = 'March' THEN 3
        WHEN "table1_dim1" = 'April' THEN 4
        WHEN "table1_dim1" = 'May' THEN 5
        WHEN "table1_dim1" = 'June' THEN 6
        WHEN "table1_dim1" = 'July' THEN 7
        WHEN "table1_dim1" = 'August' THEN 8
        WHEN "table1_dim1" = 'September' THEN 9
        WHEN "table1_dim1" = 'October' THEN 10
        WHEN "table1_dim1" = 'November' THEN 11
        WHEN "table1_dim1" = 'December' THEN 12
        ELSE 0
    END
    )`;

export const MONTH_NAME_SORT_DESCENDING_SQL = `(
        CASE
            WHEN "table1_dim1" = 'January' THEN 1
            WHEN "table1_dim1" = 'February' THEN 2
            WHEN "table1_dim1" = 'March' THEN 3
            WHEN "table1_dim1" = 'April' THEN 4
            WHEN "table1_dim1" = 'May' THEN 5
            WHEN "table1_dim1" = 'June' THEN 6
            WHEN "table1_dim1" = 'July' THEN 7
            WHEN "table1_dim1" = 'August' THEN 8
            WHEN "table1_dim1" = 'September' THEN 9
            WHEN "table1_dim1" = 'October' THEN 10
            WHEN "table1_dim1" = 'November' THEN 11
            WHEN "table1_dim1" = 'December' THEN 12
            ELSE 0
        END
        ) DESC`;

export const COMPILED_WEEK_NAME_DIMENSION: CompiledDimension = {
    type: DimensionType.STRING,
    name: 'dim1',
    label: 'dim1',
    table: 'table1',
    tableLabel: 'table1',
    fieldType: FieldType.DIMENSION,
    sql: '${TABLE}.dim1',
    compiledSql: '"table1".dim1',
    tablesReferences: ['table1'],
    timeInterval: TimeFrames.DAY_OF_WEEK_NAME,
    hidden: false,
};

export const WEEK_NAME_SORT_SQL = `(
    CASE
        WHEN "table1_dim1" = 'Sunday' THEN 1
        WHEN "table1_dim1" = 'Monday' THEN 2
        WHEN "table1_dim1" = 'Tuesday' THEN 3
        WHEN "table1_dim1" = 'Wednesday' THEN 4
        WHEN "table1_dim1" = 'Thursday' THEN 5
        WHEN "table1_dim1" = 'Friday' THEN 6
        WHEN "table1_dim1" = 'Saturday' THEN 7
        ELSE 0
    END
)`;

export const WEEK_NAME_SORT_DESCENDING_SQL = `(
    CASE
        WHEN "table1_dim1" = 'Sunday' THEN 1
        WHEN "table1_dim1" = 'Monday' THEN 2
        WHEN "table1_dim1" = 'Tuesday' THEN 3
        WHEN "table1_dim1" = 'Wednesday' THEN 4
        WHEN "table1_dim1" = 'Thursday' THEN 5
        WHEN "table1_dim1" = 'Friday' THEN 6
        WHEN "table1_dim1" = 'Saturday' THEN 7
        ELSE 0
    END
) DESC`;

export const CUSTOM_SQL_DIMENSION: CompiledCustomSqlDimension = {
    id: 'is_adult',
    name: 'Is adult',
    table: 'table1',
    type: CustomDimensionType.SQL,
    sql: '${table1.dim1} < 18',
    dimensionType: DimensionType.BOOLEAN,
    compiledSql: '"table1".dim1 < 18',
    tablesReferences: ['table1'],
};

// EXPLORE with required filters on joined tables
export const EXPLORE_WITH_REQUIRED_FILTERS: Explore = {
    ...EXPLORE,
    tables: {
        ...EXPLORE.tables,
        table1: {
            ...EXPLORE.tables.table1,
            requiredFilters: [
                {
                    id: 'required_filter_1',
                    target: {
                        fieldRef: 'table2.dim2',
                        tableName: 'table2',
                    },
                    operator: FilterOperator.EQUALS,
                    values: [10],
                    required: true,
                } satisfies JoinModelRequiredFilterRule,
            ],
        },
    },
};

// Metric query with sort by dimension with timeinterval month name
export const METRIC_QUERY_WITH_MONTH_NAME_SORT: CompiledMetricQuery = {
    exploreName: 'table1',
    dimensions: ['table1_dim1'],
    metrics: ['table1_metric1'],
    filters: {},
    sorts: [{ fieldId: 'table1_dim1', descending: true }],
    limit: 10,
    tableCalculations: [],
    compiledTableCalculations: [],
    compiledAdditionalMetrics: [],
    compiledCustomDimensions: [],
};

// Expected SQL for metric query with sort by dimension with timeinterval month name
export const METRIC_QUERY_WITH_MONTH_NAME_SORT_SQL = `WITH metrics AS (
    SELECT "table1".dim1 AS "table1_dim1",
           MAX("table1".number_column) AS "table1_metric1"
    FROM "db"."schema"."table1" AS "table1"
    GROUP BY 1
)

SELECT *
FROM metrics
ORDER BY (
    CASE
        WHEN "table1_dim1" = 'January' THEN 1
        WHEN "table1_dim1" = 'February' THEN 2
        WHEN "table1_dim1" = 'March' THEN 3
        WHEN "table1_dim1" = 'April' THEN 4
        WHEN "table1_dim1" = 'May' THEN 5
        WHEN "table1_dim1" = 'June' THEN 6
        WHEN "table1_dim1" = 'July' THEN 7
        WHEN "table1_dim1" = 'August' THEN 8
        WHEN "table1_dim1" = 'September' THEN 9
        WHEN "table1_dim1" = 'October' THEN 10
        WHEN "table1_dim1" = 'November' THEN 11
        WHEN "table1_dim1" = 'December' THEN 12
        ELSE 0
    END
) DESC
LIMIT 10`;

// Metric query with sort by dimension with timeinterval day of the week name
export const METRIC_QUERY_WITH_DAY_OF_WEEK_NAME_SORT: CompiledMetricQuery = {
    exploreName: 'table1',
    dimensions: ['table1_dim1'],
    metrics: ['table1_metric1'],
    filters: {},
    sorts: [{ fieldId: 'table1_dim1', descending: true }],
    limit: 10,
    tableCalculations: [],
    compiledTableCalculations: [],
    compiledAdditionalMetrics: [],
    compiledCustomDimensions: [],
};

// Expected SQL for metric query with sort by dimension with timeinterval day of the week name
export const METRIC_QUERY_WITH_DAY_OF_WEEK_NAME_SORT_SQL = `WITH metrics AS (
    SELECT "table1".dim1 AS "table1_dim1",
           MAX("table1".number_column) AS "table1_metric1"
    FROM "db"."schema"."table1" AS "table1"
    GROUP BY 1
)

SELECT *
FROM metrics
ORDER BY (
    CASE
        WHEN "table1_dim1" = 'Sunday' THEN 1
        WHEN "table1_dim1" = 'Monday' THEN 2
        WHEN "table1_dim1" = 'Tuesday' THEN 3
        WHEN "table1_dim1" = 'Wednesday' THEN 4
        WHEN "table1_dim1" = 'Thursday' THEN 5
        WHEN "table1_dim1" = 'Friday' THEN 6
        WHEN "table1_dim1" = 'Saturday' THEN 7
        ELSE 0
    END
) DESC
LIMIT 10`;

// Expected SQL for required filters with joined tables
export const METRIC_QUERY_WITH_REQUIRED_FILTERS_SQL = `WITH metrics AS (
    SELECT "table1".dim1 AS "table1_dim1",
    MAX("table1".number_column) AS "table1_metric1"
    FROM "db"."schema"."table1" AS "table1"
    LEFT OUTER JOIN "db"."schema"."table2" AS "table2" ON ("table1".shared) = ("table2".shared)
    WHERE ( ("table2".dim2) IN (10) )
    GROUP BY 1
)
SELECT *, table1_dim1 + table1_metric1 AS "calc3" FROM metrics ORDER BY "table1_metric1" DESC LIMIT 10`;

// Metric query with custom SQL dimension
export const METRIC_QUERY_WITH_CUSTOM_SQL_DIMENSION: CompiledMetricQuery = {
    exploreName: 'table1',
    dimensions: ['table1_dim1', 'is_adult'],
    metrics: ['table1_metric1'],
    filters: {},
    sorts: [{ fieldId: 'table1_metric1', descending: true }],
    limit: 10,
    tableCalculations: [],
    compiledTableCalculations: [],
    compiledAdditionalMetrics: [],
    compiledCustomDimensions: [CUSTOM_SQL_DIMENSION],
};

// Expected SQL for metric query with custom SQL dimension
export const EXPECTED_SQL_WITH_CUSTOM_SQL_DIMENSION = `SELECT "table1".dim1 AS "table1_dim1",
       ("table1".dim1 < 18) AS "is_adult",
       MAX("table1".number_column) AS "table1_metric1"
FROM "db"."schema"."table1" AS "table1"

GROUP BY 1,2
ORDER BY "table1_metric1" DESC LIMIT 10`;

export const QUERY_BUILDER_UTC_TIMEZONE = 'UTC';
