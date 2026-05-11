import {
    AnyType,
    BinType,
    CompiledCustomSqlDimension,
    CompiledDimension,
    CompiledMetric,
    CompiledMetricQuery,
    CompiledTable,
    CreateWarehouseCredentials,
    CustomDimensionType,
    defaultNullSafeEqualSql,
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
    TimeIntervalUnit,
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
    getAsyncQueryResults: async () => ({
        queryId: null,
        queryMetadata: null,
        totalRows: 0,
        durationMs: 0,
        fields: {},
        pageCount: 0,
        rows: [],
    }),
    streamQuery(query, streamCallback) {
        void streamCallback({
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
        void callback?.(rows, columns);
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
            case MetricType.SUM:
                return `SUM(${sql})`;
            default:
                return sql;
        }
    },
    getFieldQuoteChar: () => '"',
    getFloatingType: () => 'FLOAT',
    getNullSafeEqualSql: defaultNullSafeEqualSql,
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
    escapeString: (value) => {
        if (typeof value !== 'string') {
            return value;
        }

        return value
            .replaceAll("'", "''")
            .replaceAll('\\', '\\\\')
            .replace(/--.*$/gm, '')
            .replace(/\/\*[\s\S]*?\*\//g, '');
    },
    castToTimestamp: (date) => `CAST('${date.toISOString()}' AS TIMESTAMP)`,
    getIntervalSql: (value, unit: TimeIntervalUnit) =>
        `INTERVAL '${value} ${unit}'`,
    getTimestampDiffSeconds: (startTimestampSql, endTimestampSql) =>
        `EXTRACT(EPOCH FROM (${endTimestampSql} - ${startTimestampSql}))`,
    getMedianSql: (valueSql) =>
        `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${valueSql})`,
    buildArray: (elements) => `ARRAY[${elements.join(', ')}]`,
    buildArrayAgg: (expression, orderBy) =>
        orderBy
            ? `ARRAY_AGG(${expression} ORDER BY ${orderBy})`
            : `ARRAY_AGG(${expression})`,
};

export const bigqueryClientMock: WarehouseClient = {
    credentials: {
        type: WarehouseTypes.BIGQUERY,
    } as CreateWarehouseCredentials,
    getFieldQuoteChar: () => '`',
    getFloatingType: () => 'FLOAT64',
    getNullSafeEqualSql: defaultNullSafeEqualSql,
    getCatalog: async () => ({
        default: {
            public: {
                table: {
                    id: DimensionType.NUMBER,
                },
            },
        },
    }),
    getAsyncQueryResults: async () => ({
        queryId: null,
        queryMetadata: null,
        totalRows: 0,
        durationMs: 0,
        fields: {},
        pageCount: 0,
        rows: [],
    }),
    streamQuery(query, streamCallback) {
        void streamCallback({
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
    escapeString: (value) => value,
    castToTimestamp: (date) => `TIMESTAMP('${date.toISOString()}')`,
    getIntervalSql: (value, unit: TimeIntervalUnit) =>
        `INTERVAL ${value} ${unit}`,
    getTimestampDiffSeconds: (startTimestampSql, endTimestampSql) =>
        `TIMESTAMP_DIFF(${endTimestampSql}, ${startTimestampSql}, SECOND)`,
    getMedianSql: (valueSql) =>
        `APPROX_QUANTILES(${valueSql}, 100)[OFFSET(50)]`,
    buildArray: (elements) => `ARRAY[${elements.join(', ')}]`,
    buildArrayAgg: (expression, orderBy) =>
        orderBy
            ? `ARRAY_AGG(${expression} ORDER BY ${orderBy})`
            : `ARRAY_AGG(${expression})`,
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

                                            GROUP BY 1 ORDER BY "table5_metric1" DESC LIMIT 5`;

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

                                                      GROUP BY 1 ORDER BY "table5_metric1" DESC LIMIT 5`;

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
            dependsOn: [],
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
            dependsOn: [],
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

                                                      GROUP BY 1 ORDER BY "table1_with_reference" LIMIT 10`;

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
    sorts: [
        {
            fieldId: 'table2_additional_metric',
            descending: true,
        },
    ],
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
            dependsOn: [],
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
            dependsOn: [],
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
                                                                                                 AS \`age_range\`,
                                                                     CASE
                                                                         WHEN "table1".dim1 IS NULL THEN 3
                                                                         WHEN "table1".dim1 >= age_range_cte.min_id +
                                                                                               age_range_cte.bin_width *
                                                                                               0 AND "table1".dim1 <
                                                                                                     age_range_cte.min_id +
                                                                                                     age_range_cte.bin_width *
                                                                                                     1 THEN 0
                                                                         WHEN "table1".dim1 >= age_range_cte.min_id +
                                                                                               age_range_cte.bin_width *
                                                                                               1 AND "table1".dim1 <
                                                                                                     age_range_cte.min_id +
                                                                                                     age_range_cte.bin_width *
                                                                                                     2 THEN 1
                                                                         ELSE 2
                                                                         END
                                                                                                 AS \`age_range_order\`,
                                                                     MAX("table1".number_column) AS \`table1_metric1\`
                                                              FROM "db"."schema"."table1" AS \`table1\`

                                                                       CROSS JOIN age_range_cte

                                                              GROUP BY 1,2,3
                                                              ORDER BY \`table1_metric1\` DESC LIMIT 10`;

export const EXPECTED_SQL_WITH_CUSTOM_DIMENSION_BIN_WIDTH = `SELECT "table1".dim1               AS \`table1_dim1\`,
                                                                    CONCAT(FLOOR("table1".dim1 / 10) * 10, ' - ',
                                                                           (FLOOR("table1".dim1 / 10) + 1) * 10 -
                                                                           1)                   AS \`age_range\`,
                                                                    FLOOR("table1".dim1 / 10) * 10 AS \`age_range_order\`,
                                                                    MAX("table1".number_column) AS \`table1_metric1\`
                                                             FROM "db"."schema"."table1" AS \`table1\`


                                                             GROUP BY 1,2,3
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
                                                                                                                         AS \`age_range\`,
                                                                                             CASE
                                                                                                 WHEN "table1".dim1 IS NULL
                                                                                                     THEN 3
                                                                                                 WHEN "table1".dim1 >=
                                                                                                      age_range_cte.min_id +
                                                                                                      age_range_cte.bin_width *
                                                                                                      0 AND
                                                                                                      "table1".dim1 <
                                                                                                      age_range_cte.min_id +
                                                                                                      age_range_cte.bin_width *
                                                                                                      1
                                                                                                     THEN 0
                                                                                                 WHEN "table1".dim1 >=
                                                                                                      age_range_cte.min_id +
                                                                                                      age_range_cte.bin_width *
                                                                                                      1 AND
                                                                                                      "table1".dim1 <
                                                                                                      age_range_cte.min_id +
                                                                                                      age_range_cte.bin_width *
                                                                                                      2
                                                                                                     THEN 1
                                                                                                 ELSE 2
                                                                                                 END
                                                                                                                         AS \`age_range_order\`,
                                                                                             MAX("table1".number_column) AS \`table1_metric1\`
                                                                                      FROM "db"."schema"."table1" AS \`table1\`

                                                                                               CROSS JOIN age_range_cte

                                                                                      GROUP BY 1,2,3
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
                                                                                FLOOR("table1".dim1 / 10) * 10 AS "age_range_order",
                                                                                MAX("table1".number_column) AS "table1_metric1"
                                                                         FROM "db"."schema"."table1" AS "table1"


                                                                         GROUP BY 1,2,3
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

export const EXPECTED_SQL_WITH_MANY_TO_ONE_JOIN = `WITH cte_keys_table2 AS (
    SELECT DISTINCT "table1".dim1 AS "table1_dim1", "table2".dim2 AS "pk_dim2"
    FROM "db"."schema"."table1" AS "table1"
    LEFT OUTER JOIN "db"."schema"."table2" AS "table2" ON ("table1".shared) = ("table2".shared)
),
cte_metrics_table2 AS (
    SELECT cte_keys_table2."table1_dim1", SUM("table2".number_column) AS "table2_metric3"
    FROM cte_keys_table2
    LEFT JOIN "db"."schema"."table2" AS "table2" ON cte_keys_table2."pk_dim2" = "table2".dim2
    GROUP BY 1
),
cte_unaffected AS (
    SELECT "table1".dim1 AS "table1_dim1", MAX("table1".number_column) AS "table1_metric1"
    FROM "db"."schema"."table1" AS "table1"
    LEFT OUTER JOIN "db"."schema"."table2" AS "table2" ON ("table1".shared) = ("table2".shared)
    GROUP BY 1
),
metrics AS (
    SELECT cte_unaffected.*, cte_metrics_table2."table2_metric3" AS "table2_metric3"
    FROM cte_unaffected
    INNER JOIN cte_metrics_table2 ON ( cte_unaffected."table1_dim1" = cte_metrics_table2."table1_dim1" OR ( cte_unaffected."table1_dim1" IS NULL AND cte_metrics_table2."table1_dim1" IS NULL ) )
)
SELECT
  *,
  table1_dim1 + table2_metric2 AS "calc3"
FROM metrics
ORDER BY "table2_metric2" DESC
LIMIT 10`;

export const EXPECTED_SQL_WITH_CROSS_JOIN = `WITH cte_keys_table2 AS (
    SELECT DISTINCT "table2".dim2 AS "pk_dim2"
    FROM "db"."schema"."table1" AS "table1"
    LEFT OUTER JOIN "db"."schema"."table2" AS "table2" ON ("table1".shared) = ("table2".shared)
), cte_metrics_table2 AS (
    SELECT SUM("table2".number_column) AS "table2_metric3"
    FROM cte_keys_table2
    LEFT JOIN "db"."schema"."table2" AS "table2" ON cte_keys_table2."pk_dim2" = "table2".dim2
), cte_unaffected AS (
    SELECT MAX("table1".number_column) AS "table1_metric1"
    FROM "db"."schema"."table1" AS "table1"
    LEFT OUTER JOIN "db"."schema"."table2" AS "table2" ON ("table1".shared) = ("table2".shared)
), metrics AS (
    SELECT cte_unaffected.*, cte_metrics_table2."table2_metric3" AS "table2_metric3"
    FROM cte_unaffected
    CROSS JOIN cte_metrics_table2
)
SELECT *, table1_dim1 + table2_metric2 AS "calc3" FROM metrics ORDER BY "table2_metric2" DESC LIMIT 10`;

export const EXPECTED_SQL_NO_DIMENSIONS_WITH_FILTER = `WITH cte_keys_table2 AS (
    SELECT DISTINCT "table2".dim2 AS "pk_dim2"
    FROM "db"."schema"."table1" AS "table1"
    LEFT OUTER JOIN "db"."schema"."table2" AS "table2" ON ("table1".shared) = ("table2".shared)
    WHERE (( ("table1".dim1) IN (2025) ))
), cte_metrics_table2 AS (
    SELECT SUM("table2".number_column) AS "table2_metric3"
    FROM cte_keys_table2
    LEFT JOIN "db"."schema"."table2" AS "table2" ON cte_keys_table2."pk_dim2" = "table2".dim2
)
SELECT cte_metrics_table2."table2_metric3" AS "table2_metric3"
FROM cte_metrics_table2
ORDER BY "table2_metric3" DESC
LIMIT 500`;

// Explore without primary keys
export const EXPLORE_WITHOUT_PRIMARY_KEYS: Explore = {
    ...EXPLORE,
    tables: {
        ...EXPLORE.tables,
        table1: {
            ...EXPLORE.tables.table1,
            primaryKey: undefined,
        },
        table2: {
            ...EXPLORE.tables.table2,
            primaryKey: undefined,
        },
    },
};

// Explore without relationship type
export const EXPLORE_WITHOUT_JOIN_RELATIONSHIPS: Explore = {
    ...EXPLORE,
    joinedTables: [
        {
            table: 'table2',
            sqlOn: '${table1.shared} = ${table2.shared}',
            compiledSqlOn: '("table1".shared) = ("table2".shared)',
            type: undefined,
            tablesReferences: ['table1', 'table2'],
            // No relationship defined
        },
    ],
};

// Explore with cross-table metric references
export const EXPLORE_WITH_CROSS_TABLE_METRICS: Explore = {
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    name: 'customers',
    label: 'customers',
    baseTable: 'customers',
    tags: [],
    tables: {
        customers: {
            name: 'customers',
            label: 'customers',
            database: 'mydb',
            schema: 'public',
            sqlTable: 'customers',
            primaryKey: ['customer_id'],
            lineageGraph: {},
            dimensions: {
                customer_id: {
                    type: DimensionType.STRING,
                    name: 'customer_id',
                    label: 'Customer ID',
                    table: 'customers',
                    tableLabel: 'customers',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.customer_id',
                    compiledSql: '"customers".customer_id',
                    tablesReferences: ['customers'],
                    hidden: false,
                },
            },
            metrics: {
                total_customers: {
                    type: MetricType.COUNT,
                    name: 'total_customers',
                    label: 'Total Customers',
                    table: 'customers',
                    tableLabel: 'customers',
                    fieldType: FieldType.METRIC,
                    sql: '${TABLE}.customer_id',
                    compiledSql: 'COUNT("customers".customer_id)',
                    tablesReferences: ['customers'],
                    hidden: false,
                },
            },
        },
        orders: {
            name: 'orders',
            label: 'orders',
            database: 'mydb',
            schema: 'public',
            sqlTable: 'orders',
            primaryKey: ['order_id'],
            lineageGraph: {},
            dimensions: {
                order_id: {
                    type: DimensionType.STRING,
                    name: 'order_id',
                    label: 'Order ID',
                    table: 'orders',
                    tableLabel: 'orders',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.order_id',
                    compiledSql: '"orders".order_id',
                    tablesReferences: ['orders'],
                    hidden: false,
                },
            },
            metrics: {
                total_order_amount: {
                    type: MetricType.SUM,
                    name: 'total_order_amount',
                    label: 'Total Order Amount',
                    table: 'orders',
                    tableLabel: 'orders',
                    fieldType: FieldType.METRIC,
                    sql: '${TABLE}.amount',
                    compiledSql: 'SUM("orders".amount)',
                    tablesReferences: ['orders'],
                    hidden: false,
                },
                revenue_per_customer: {
                    type: MetricType.NUMBER,
                    name: 'revenue_per_customer',
                    label: 'Revenue Per Customer',
                    table: 'orders',
                    tableLabel: 'orders',
                    fieldType: FieldType.METRIC,
                    sql: '${orders.total_order_amount} / ${customers.total_customers}',
                    compiledSql:
                        'SUM("orders".amount) / COUNT("customers".customer_id)',
                    tablesReferences: ['orders', 'customers'],
                    hidden: false,
                },
            },
        },
    },
    joinedTables: [
        {
            table: 'orders',
            sqlOn: '${customers.customer_id} = ${orders.customer_id}',
            compiledSqlOn: '("customers".customer_id) = ("orders".customer_id)',
            type: 'left',
            relationship: JoinRelationship.ONE_TO_MANY,
            tablesReferences: ['customers', 'orders'],
        },
    ],
};

// Metric query with cross-table metric references
export const METRIC_QUERY_CROSS_TABLE: CompiledMetricQuery = {
    exploreName: 'customers',
    dimensions: [],
    metrics: ['orders_revenue_per_customer'],
    filters: {},
    sorts: [],
    limit: 100,
    tableCalculations: [],
    additionalMetrics: [],
    compiledTableCalculations: [],
    compiledAdditionalMetrics: [],
    compiledCustomDimensions: [],
};

// Expected SQL for cross-table metric references with CTEs
export const EXPECTED_SQL_WITH_CROSS_TABLE_METRICS = `WITH cte_keys_customers AS (
    SELECT DISTINCT
      "customers".customer_id AS "pk_customer_id"
    FROM customers AS "customers"
    LEFT OUTER JOIN orders AS "orders"
      ON ("customers".customer_id) = ("orders".customer_id)
    ),
    cte_metrics_customers AS (
    SELECT
      COUNT("customers".customer_id) AS "customers_total_customers"
    FROM cte_keys_customers
    LEFT JOIN customers AS "customers" ON cte_keys_customers."pk_customer_id" = "customers".customer_id

    ),
    cte_unaffected AS (
    SELECT
      SUM("orders".amount) AS "orders_total_order_amount"
    FROM customers AS "customers"
    LEFT OUTER JOIN orders AS "orders"
      ON ("customers".customer_id) = ("orders".customer_id)
    )
    SELECT
      cte_unaffected.*,
      cte_unaffected."orders_total_order_amount" / cte_metrics_customers."customers_total_customers" AS "orders_revenue_per_customer"
    FROM cte_unaffected
    CROSS JOIN cte_metrics_customers
    LIMIT 100`;

// --- Date zoom + filter test data ---

const dateExploreBase: Explore = {
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    name: 'orders',
    label: 'orders',
    baseTable: 'orders',
    tags: [],
    joinedTables: [],
    tables: {
        orders: {
            name: 'orders',
            label: 'orders',
            database: 'database',
            schema: 'schema',
            sqlTable: '"db"."schema"."orders"',
            primaryKey: ['order_id'],
            dimensions: {
                order_id: {
                    type: DimensionType.NUMBER,
                    name: 'order_id',
                    label: 'order_id',
                    table: 'orders',
                    tableLabel: 'orders',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.order_id',
                    compiledSql: '"orders".order_id',
                    tablesReferences: ['orders'],
                    hidden: false,
                },
                created_at: {
                    type: DimensionType.DATE,
                    name: 'created_at',
                    label: 'created_at',
                    table: 'orders',
                    tableLabel: 'orders',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.created_at',
                    compiledSql: '"orders".created_at',
                    tablesReferences: ['orders'],
                    hidden: false,
                },
            },
            metrics: {
                order_count: {
                    type: MetricType.COUNT,
                    fieldType: FieldType.METRIC,
                    table: 'orders',
                    tableLabel: 'orders',
                    name: 'order_count',
                    label: 'order_count',
                    sql: '${TABLE}.order_id',
                    compiledSql: 'COUNT("orders".order_id)',
                    tablesReferences: ['orders'],
                    hidden: false,
                },
            },
            lineageGraph: {},
        },
    },
};

// Original explore (no date zoom)
export const EXPLORE_WITH_DATE_DIMENSION: Explore = dateExploreBase;

// Zoomed explore: created_at dimension has DATE_TRUNC'd compiledSql (simulating month granularity)
export const EXPLORE_WITH_DATE_DIMENSION_ZOOMED: Explore = {
    ...dateExploreBase,
    tables: {
        ...dateExploreBase.tables,
        orders: {
            ...dateExploreBase.tables.orders,
            dimensions: {
                ...dateExploreBase.tables.orders.dimensions,
                created_at: {
                    ...dateExploreBase.tables.orders.dimensions.created_at,
                    compiledSql: 'DATE_TRUNC(\'month\', "orders".created_at)',
                },
            },
        },
    },
};

export const METRIC_QUERY_WITH_DATE_FILTER: CompiledMetricQuery = {
    exploreName: 'orders',
    dimensions: ['orders_created_at'],
    metrics: ['orders_order_count'],
    filters: {
        dimensions: {
            id: 'root',
            and: [
                {
                    id: '1',
                    target: {
                        fieldId: 'orders_created_at',
                    },
                    operator: FilterOperator.IN_BETWEEN,
                    values: ['2024-09-01', '2024-09-04'],
                },
            ],
        },
    },
    sorts: [{ fieldId: 'orders_created_at', descending: false }],
    limit: 10,
    tableCalculations: [],
    compiledTableCalculations: [],
    compiledAdditionalMetrics: [],
    compiledCustomDimensions: [],
};

// Filter with user attribute value (e.g., ${lightdash.user.email}) in filter values
export const METRIC_QUERY_WITH_USER_ATTRIBUTE_FILTER_VALUE: CompiledMetricQuery =
    {
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
                            fieldId: 'table1_shared',
                        },
                        operator: FilterOperator.EQUALS,
                        values: ['${lightdash.user.email}'],
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

export const METRIC_QUERY_WITH_USER_ATTRIBUTE_FILTER_VALUE_SQL = `SELECT "table1".dim1 AS "table1_dim1"
                                             FROM "db"."schema"."table1" AS "table1"

                                             WHERE ((
                                                 ("table1".shared) IN ('mock@lightdash.com')
                                                 ))
                                             GROUP BY 1
                                             ORDER BY "table1_dim1" DESC LIMIT 10`;

// Filter with custom user attribute value (e.g., ${lightdash.attribute.country}) in filter values
export const METRIC_QUERY_WITH_CUSTOM_USER_ATTRIBUTE_FILTER_VALUE: CompiledMetricQuery =
    {
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
                            fieldId: 'table1_shared',
                        },
                        operator: FilterOperator.EQUALS,
                        values: ['${lightdash.attribute.country}'],
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

export const METRIC_QUERY_WITH_CUSTOM_USER_ATTRIBUTE_FILTER_VALUE_SQL = `SELECT "table1".dim1 AS "table1_dim1"
                                             FROM "db"."schema"."table1" AS "table1"

                                             WHERE ((
                                                 ("table1".shared) IN ('EU')
                                                 ))
                                             GROUP BY 1
                                             ORDER BY "table1_dim1" DESC LIMIT 10`;

// --- sum_distinct fixtures ---

export const EXPLORE_WITH_SUM_DISTINCT: Explore = {
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    name: 'orders',
    label: 'orders',
    baseTable: 'orders',
    tags: [],
    joinedTables: [],
    tables: {
        orders: {
            name: 'orders',
            label: 'orders',
            database: 'db',
            schema: 'schema',
            sqlTable: '"db"."schema"."orders"',
            primaryKey: ['order_id'],
            dimensions: {
                order_id: {
                    type: DimensionType.STRING,
                    name: 'order_id',
                    label: 'Order ID',
                    table: 'orders',
                    tableLabel: 'orders',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.order_id',
                    compiledSql: '"orders".order_id',
                    tablesReferences: ['orders'],
                    hidden: false,
                },
                payment_method: {
                    type: DimensionType.STRING,
                    name: 'payment_method',
                    label: 'Payment Method',
                    table: 'orders',
                    tableLabel: 'orders',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.payment_method',
                    compiledSql: '"orders".payment_method',
                    tablesReferences: ['orders'],
                    hidden: false,
                },
                status: {
                    type: DimensionType.STRING,
                    name: 'status',
                    label: 'Status',
                    table: 'orders',
                    tableLabel: 'orders',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.status',
                    compiledSql: '"orders".status',
                    tablesReferences: ['orders'],
                    hidden: false,
                },
            },
            metrics: {
                total_revenue: {
                    type: MetricType.SUM_DISTINCT,
                    fieldType: FieldType.METRIC,
                    table: 'orders',
                    tableLabel: 'orders',
                    name: 'total_revenue',
                    label: 'Total Revenue',
                    sql: '${TABLE}.amount',
                    compiledSql: 'SUM("orders".amount)',
                    compiledValueSql: '"orders".amount',
                    compiledDistinctKeys: ['"orders".line_item_id'],
                    tablesReferences: ['orders'],
                    hidden: false,
                },
            },
            lineageGraph: {},
        },
    },
};

export const METRIC_QUERY_SUM_DISTINCT_WITH_DIMS: CompiledMetricQuery = {
    exploreName: 'orders',
    dimensions: ['orders_payment_method', 'orders_status'],
    metrics: ['orders_total_revenue'],
    filters: {},
    sorts: [{ fieldId: 'orders_total_revenue', descending: true }],
    limit: 10,
    tableCalculations: [],
    compiledTableCalculations: [],
    compiledAdditionalMetrics: [],
    compiledCustomDimensions: [],
};

export const METRIC_QUERY_SUM_DISTINCT_NO_DIMS: CompiledMetricQuery = {
    exploreName: 'orders',
    dimensions: [],
    metrics: ['orders_total_revenue'],
    filters: {},
    sorts: [{ fieldId: 'orders_total_revenue', descending: true }],
    limit: 10,
    tableCalculations: [],
    compiledTableCalculations: [],
    compiledAdditionalMetrics: [],
    compiledCustomDimensions: [],
};

// --- average_distinct fixtures ---

export const EXPLORE_WITH_AVERAGE_DISTINCT: Explore = {
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    name: 'orders',
    label: 'orders',
    baseTable: 'orders',
    tags: [],
    joinedTables: [],
    tables: {
        orders: {
            name: 'orders',
            label: 'orders',
            database: 'db',
            schema: 'schema',
            sqlTable: '"db"."schema"."orders"',
            primaryKey: ['order_id'],
            dimensions: {
                order_id: {
                    type: DimensionType.STRING,
                    name: 'order_id',
                    label: 'Order ID',
                    table: 'orders',
                    tableLabel: 'orders',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.order_id',
                    compiledSql: '"orders".order_id',
                    tablesReferences: ['orders'],
                    hidden: false,
                },
                payment_method: {
                    type: DimensionType.STRING,
                    name: 'payment_method',
                    label: 'Payment Method',
                    table: 'orders',
                    tableLabel: 'orders',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.payment_method',
                    compiledSql: '"orders".payment_method',
                    tablesReferences: ['orders'],
                    hidden: false,
                },
            },
            metrics: {
                avg_shipping_cost: {
                    type: MetricType.AVERAGE_DISTINCT,
                    fieldType: FieldType.METRIC,
                    table: 'orders',
                    tableLabel: 'orders',
                    name: 'avg_shipping_cost',
                    label: 'Avg Shipping Cost',
                    sql: '${TABLE}.shipping_cost',
                    compiledSql: 'AVG("orders".shipping_cost)',
                    compiledValueSql: '"orders".shipping_cost',
                    compiledDistinctKeys: ['"orders".line_item_id'],
                    tablesReferences: ['orders'],
                    hidden: false,
                },
            },
            lineageGraph: {},
        },
    },
};

export const METRIC_QUERY_AVERAGE_DISTINCT_WITH_DIMS: CompiledMetricQuery = {
    exploreName: 'orders',
    dimensions: ['orders_payment_method'],
    metrics: ['orders_avg_shipping_cost'],
    filters: {},
    sorts: [{ fieldId: 'orders_avg_shipping_cost', descending: true }],
    limit: 10,
    tableCalculations: [],
    compiledTableCalculations: [],
    compiledAdditionalMetrics: [],
    compiledCustomDimensions: [],
};

export const METRIC_QUERY_AVERAGE_DISTINCT_NO_DIMS: CompiledMetricQuery = {
    exploreName: 'orders',
    dimensions: [],
    metrics: ['orders_avg_shipping_cost'],
    filters: {},
    sorts: [{ fieldId: 'orders_avg_shipping_cost', descending: true }],
    limit: 10,
    tableCalculations: [],
    compiledTableCalculations: [],
    compiledAdditionalMetrics: [],
    compiledCustomDimensions: [],
};

// Expected: SELECT uses DATE_TRUNC (zoomed), but WHERE uses raw column
export const METRIC_QUERY_WITH_DATE_ZOOM_FILTER_SQL = `SELECT
  DATE_TRUNC('month', "orders".created_at) AS "orders_created_at",
  COUNT("orders".order_id) AS "orders_order_count"
FROM "db"."schema"."orders" AS "orders"

WHERE ((
  (("orders".created_at) >= ('2024-09-01') AND ("orders".created_at) <= ('2024-09-04'))
))
GROUP BY 1
ORDER BY "orders_created_at"
LIMIT 10`;

// ---- Nested aggregate test fixtures ----
// Explore with a type:number metric that wraps an aggregate metric reference
// This creates the nested aggregate pattern: SUM(MAX(...))
export const EXPLORE_WITH_NESTED_AGG: Explore = {
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    name: 'my_table',
    label: 'my_table',
    baseTable: 'my_table',
    tags: [],
    joinedTables: [],
    tables: {
        my_table: {
            name: 'my_table',
            label: 'my_table',
            database: 'db',
            schema: 'schema',
            sqlTable: '"db"."schema"."my_table"',
            primaryKey: ['id'],
            dimensions: {
                category: {
                    type: DimensionType.STRING,
                    name: 'category',
                    label: 'category',
                    table: 'my_table',
                    tableLabel: 'my_table',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.category',
                    compiledSql: '"my_table".category',
                    tablesReferences: ['my_table'],
                    hidden: false,
                },
            },
            metrics: {
                max_value: {
                    type: MetricType.MAX,
                    fieldType: FieldType.METRIC,
                    table: 'my_table',
                    tableLabel: 'my_table',
                    name: 'max_value',
                    label: 'max_value',
                    sql: '${TABLE}.value',
                    compiledSql: 'MAX("my_table".value)',
                    tablesReferences: ['my_table'],
                    hidden: false,
                },
                count_records: {
                    type: MetricType.COUNT,
                    fieldType: FieldType.METRIC,
                    table: 'my_table',
                    tableLabel: 'my_table',
                    name: 'count_records',
                    label: 'count_records',
                    sql: '${TABLE}.id',
                    compiledSql: 'COUNT("my_table".id)',
                    tablesReferences: ['my_table'],
                    hidden: false,
                },
                // type:number with aggregation wrapping an aggregate metric reference
                // This compiles to SUM(MAX(...)) which is invalid SQL
                sum_of_max: {
                    type: MetricType.NUMBER,
                    fieldType: FieldType.METRIC,
                    table: 'my_table',
                    tableLabel: 'my_table',
                    name: 'sum_of_max',
                    label: 'sum_of_max',
                    sql: 'sum(${max_value})',
                    compiledSql: 'SUM(MAX("my_table".value))',
                    tablesReferences: ['my_table'],
                    hidden: false,
                },
                // More complex: aggregation wrapping metric ref + division by another metric
                avg_of_max: {
                    type: MetricType.NUMBER,
                    fieldType: FieldType.METRIC,
                    table: 'my_table',
                    tableLabel: 'my_table',
                    name: 'avg_of_max',
                    label: 'avg_of_max',
                    sql: 'sum(${max_value}) / NULLIF(${count_records}, 0)',
                    compiledSql:
                        'SUM(MAX("my_table".value)) / NULLIF(COUNT("my_table".id), 0)',
                    tablesReferences: ['my_table'],
                    hidden: false,
                },
                // COUNT(DISTINCT) wrapping aggregate metric (PROD-5657: 1 chart)
                count_distinct_of_max: {
                    type: MetricType.NUMBER,
                    fieldType: FieldType.METRIC,
                    table: 'my_table',
                    tableLabel: 'my_table',
                    name: 'count_distinct_of_max',
                    label: 'count_distinct_of_max',
                    sql: 'count(distinct ${max_value})',
                    compiledSql: 'COUNT(DISTINCT MAX("my_table".value))',
                    tablesReferences: ['my_table'],
                    hidden: false,
                },
                // Conditional SUM wrapping aggregate metric (Looker migration pattern)
                conditional_sum_of_max: {
                    type: MetricType.NUMBER,
                    fieldType: FieldType.METRIC,
                    table: 'my_table',
                    tableLabel: 'my_table',
                    name: 'conditional_sum_of_max',
                    label: 'conditional_sum_of_max',
                    sql: 'sum(case when ${max_value} > 100 then ${max_value} else 0 end)',
                    compiledSql:
                        'SUM(CASE WHEN MAX("my_table".value) > 100 THEN MAX("my_table".value) ELSE 0 END)',
                    tablesReferences: ['my_table'],
                    hidden: false,
                },
                // Warehouse-specific aggregation (Snowflake MAX_BY) wrapping metric references
                // This compiles to MAX_BY(MAX(...), MAX(...)) which is a nested aggregate
                max_by_of_agg: {
                    type: MetricType.NUMBER,
                    fieldType: FieldType.METRIC,
                    table: 'my_table',
                    tableLabel: 'my_table',
                    name: 'max_by_of_agg',
                    label: 'max_by_of_agg',
                    sql: 'max_by(${max_value}, ${count_records})',
                    compiledSql:
                        'MAX_BY(MAX("my_table".value), COUNT("my_table".id))',
                    tablesReferences: ['my_table'],
                    hidden: false,
                },
                // MAX_BY wrapping two non-aggregate (type:number) metric refs.
                // Both inner deps compile to raw column references.
                // Reproduces customer pattern: MAX_BY(${active_customers}, ${updated_on})
                // where both helpers are type:number.
                max_by_of_raw: {
                    type: MetricType.NUMBER,
                    fieldType: FieldType.METRIC,
                    table: 'my_table',
                    tableLabel: 'my_table',
                    name: 'max_by_of_raw',
                    label: 'max_by_of_raw',
                    sql: 'max_by(${raw_value}, ${raw_updated_on})',
                    compiledSql:
                        'MAX_BY("my_table".value, "my_table".updated_on)',
                    tablesReferences: ['my_table'],
                    hidden: false,
                },
                // Helper non-aggregate metric (raw column reference)
                raw_updated_on: {
                    type: MetricType.NUMBER,
                    fieldType: FieldType.METRIC,
                    table: 'my_table',
                    tableLabel: 'my_table',
                    name: 'raw_updated_on',
                    label: 'raw_updated_on',
                    sql: '${TABLE}.updated_on',
                    compiledSql: '"my_table".updated_on',
                    tablesReferences: ['my_table'],
                    hidden: true,
                },
                // Raw column aggregation combined with metric reference
                // sql: sum(raw_col) / ${count_records}
                // The sum() wraps a raw column (not a ${ } ref), so this is
                // NOT a nested aggregate — it compiles to SUM(col) / COUNT(col)
                // which is valid SQL (sibling aggregates, not nested).
                raw_agg_with_ref: {
                    type: MetricType.NUMBER,
                    fieldType: FieldType.METRIC,
                    table: 'my_table',
                    tableLabel: 'my_table',
                    name: 'raw_agg_with_ref',
                    label: 'raw_agg_with_ref',
                    sql: 'sum(${TABLE}.value) / NULLIF(${count_records}, 0)',
                    compiledSql:
                        'SUM("my_table".value) / NULLIF(COUNT("my_table".id), 0)',
                    tablesReferences: ['my_table'],
                    hidden: false,
                },
                // Window function wrapping aggregate metric + ${TABLE} reference
                // Reproduces GH-21089: ${TABLE} resolves to base table alias
                // inside nested_agg_results CTE where only nested_agg is in scope
                window_sum_of_max: {
                    type: MetricType.NUMBER,
                    fieldType: FieldType.METRIC,
                    table: 'my_table',
                    tableLabel: 'my_table',
                    name: 'window_sum_of_max',
                    label: 'window_sum_of_max',
                    sql: 'SUM(${max_value}) OVER (PARTITION BY ${TABLE}.category)',
                    compiledSql:
                        'SUM(MAX("my_table".value)) OVER (PARTITION BY "my_table".category)',
                    tablesReferences: ['my_table'],
                    hidden: false,
                },
                // Transitive nested aggregate: type:number referencing another type:number
                // which itself wraps an aggregate metric.
                // sum_case_of_max.sql = SUM(CASE WHEN ${max_value} > 100 THEN 1 ELSE 0 END)
                //   → compiles to SUM(CASE WHEN MAX("my_table".value) > 100 THEN 1 ELSE 0 END)
                // Then ratio_of_sum_case.sql = ${sum_case_of_max} / NULLIF(${count_records}, 0)
                //   → compiles to SUM(CASE WHEN MAX(...) > 100 ...) / NULLIF(COUNT(...), 0)
                // The nesting is two levels deep: ratio → sum_case → max
                sum_case_of_max: {
                    type: MetricType.NUMBER,
                    fieldType: FieldType.METRIC,
                    table: 'my_table',
                    tableLabel: 'my_table',
                    name: 'sum_case_of_max',
                    label: 'sum_case_of_max',
                    sql: 'SUM(CASE WHEN ${max_value} > 100 THEN 1 ELSE 0 END)',
                    compiledSql:
                        'SUM(CASE WHEN MAX("my_table".value) > 100 THEN 1 ELSE 0 END)',
                    tablesReferences: ['my_table'],
                    hidden: false,
                },
                ratio_of_sum_case: {
                    type: MetricType.NUMBER,
                    fieldType: FieldType.METRIC,
                    table: 'my_table',
                    tableLabel: 'my_table',
                    name: 'ratio_of_sum_case',
                    label: 'ratio_of_sum_case',
                    sql: '${sum_case_of_max} / NULLIF(${count_records}, 0)',
                    compiledSql:
                        'SUM(CASE WHEN MAX("my_table".value) > 100 THEN 1 ELSE 0 END) / NULLIF(COUNT("my_table".id), 0)',
                    tablesReferences: ['my_table'],
                    hidden: false,
                },
                // Raw (non-aggregate) helper metric — just a column reference.
                // Used by mixed_raw_agg_repro to test the mix of raw + aggregate deps.
                raw_value: {
                    type: MetricType.NUMBER,
                    fieldType: FieldType.METRIC,
                    table: 'my_table',
                    tableLabel: 'my_table',
                    name: 'raw_value',
                    label: 'raw_value',
                    sql: '${TABLE}.value',
                    compiledSql: '"my_table".value',
                    tablesReferences: ['my_table'],
                    hidden: true,
                },
                // Outer metric mixing raw + aggregate inner deps (GH-21501).
                // Emulates MAX_BY: pick the raw value ordered by the max metric.
                // Compiles to ARRAY_AGG(raw_col ORDER BY MAX(col)) which is a
                // nested aggregate that needs CTE routing.
                mixed_raw_agg_repro: {
                    type: MetricType.NUMBER,
                    fieldType: FieldType.METRIC,
                    table: 'my_table',
                    tableLabel: 'my_table',
                    name: 'mixed_raw_agg_repro',
                    label: 'mixed_raw_agg_repro',
                    sql: '(ARRAY_AGG(${raw_value} ORDER BY ${max_value} DESC))[1]',
                    compiledSql:
                        '(ARRAY_AGG("my_table".value ORDER BY MAX("my_table".value) DESC))[1]',
                    tablesReferences: ['my_table'],
                    hidden: false,
                },
                // Product of aggregates - NO outer aggregation, valid SQL without CTE
                product_of_aggregates: {
                    type: MetricType.NUMBER,
                    fieldType: FieldType.METRIC,
                    table: 'my_table',
                    tableLabel: 'my_table',
                    name: 'product_of_aggregates',
                    label: 'product_of_aggregates',
                    sql: '${max_value} * ${count_records}',
                    compiledSql: 'MAX("my_table".value) * COUNT("my_table".id)',
                    tablesReferences: ['my_table'],
                    hidden: false,
                },
            },
            lineageGraph: {},
        },
    },
};

export const METRIC_QUERY_NESTED_AGG_WITH_DIMS: CompiledMetricQuery = {
    exploreName: 'my_table',
    dimensions: ['my_table_category'],
    metrics: ['my_table_sum_of_max'],
    filters: {},
    sorts: [{ fieldId: 'my_table_sum_of_max', descending: true }],
    limit: 10,
    tableCalculations: [],
    compiledTableCalculations: [],
    compiledAdditionalMetrics: [],
    compiledCustomDimensions: [],
};

export const METRIC_QUERY_NESTED_AGG_NO_DIMS: CompiledMetricQuery = {
    exploreName: 'my_table',
    dimensions: [],
    metrics: ['my_table_sum_of_max'],
    filters: {},
    sorts: [{ fieldId: 'my_table_sum_of_max', descending: true }],
    limit: 10,
    tableCalculations: [],
    compiledTableCalculations: [],
    compiledAdditionalMetrics: [],
    compiledCustomDimensions: [],
};

export const METRIC_QUERY_NESTED_AGG_COMPLEX: CompiledMetricQuery = {
    exploreName: 'my_table',
    dimensions: ['my_table_category'],
    metrics: ['my_table_avg_of_max'],
    filters: {},
    sorts: [{ fieldId: 'my_table_avg_of_max', descending: true }],
    limit: 10,
    tableCalculations: [],
    compiledTableCalculations: [],
    compiledAdditionalMetrics: [],
    compiledCustomDimensions: [],
};

export const METRIC_QUERY_NESTED_AGG_COUNT_DISTINCT: CompiledMetricQuery = {
    exploreName: 'my_table',
    dimensions: ['my_table_category'],
    metrics: ['my_table_count_distinct_of_max'],
    filters: {},
    sorts: [{ fieldId: 'my_table_count_distinct_of_max', descending: true }],
    limit: 10,
    tableCalculations: [],
    compiledTableCalculations: [],
    compiledAdditionalMetrics: [],
    compiledCustomDimensions: [],
};

export const METRIC_QUERY_NESTED_AGG_CONDITIONAL: CompiledMetricQuery = {
    exploreName: 'my_table',
    dimensions: ['my_table_category'],
    metrics: ['my_table_conditional_sum_of_max'],
    filters: {},
    sorts: [{ fieldId: 'my_table_conditional_sum_of_max', descending: true }],
    limit: 10,
    tableCalculations: [],
    compiledTableCalculations: [],
    compiledAdditionalMetrics: [],
    compiledCustomDimensions: [],
};

export const METRIC_QUERY_NESTED_AGG_PRODUCT: CompiledMetricQuery = {
    exploreName: 'my_table',
    dimensions: ['my_table_category'],
    metrics: ['my_table_product_of_aggregates'],
    filters: {},
    sorts: [{ fieldId: 'my_table_product_of_aggregates', descending: true }],
    limit: 10,
    tableCalculations: [],
    compiledTableCalculations: [],
    compiledAdditionalMetrics: [],
    compiledCustomDimensions: [],
};

// Raw column aggregation + metric reference: sum(raw_col) / ${aggregate_metric}
// This is NOT a nested aggregate — both aggregations are at the same level.
// The sum() wraps a raw column (not a metric ref), so it should NOT be
// routed through the nested_agg CTE.
export const METRIC_QUERY_NESTED_AGG_RAW_COL: CompiledMetricQuery = {
    exploreName: 'my_table',
    dimensions: ['my_table_category'],
    metrics: ['my_table_raw_agg_with_ref', 'my_table_sum_of_max'],
    filters: {},
    sorts: [{ fieldId: 'my_table_raw_agg_with_ref', descending: true }],
    limit: 10,
    tableCalculations: [],
    compiledTableCalculations: [],
    compiledAdditionalMetrics: [],
    compiledCustomDimensions: [],
};

// Mixed: nested agg metric + non-nested metric together (reproduces GROUP BY issue)
export const METRIC_QUERY_NESTED_AGG_MIXED: CompiledMetricQuery = {
    exploreName: 'my_table',
    dimensions: [],
    metrics: ['my_table_sum_of_max', 'my_table_product_of_aggregates'],
    filters: {},
    sorts: [{ fieldId: 'my_table_sum_of_max', descending: true }],
    limit: 10,
    tableCalculations: [],
    compiledTableCalculations: [],
    compiledAdditionalMetrics: [],
    compiledCustomDimensions: [],
};

// Window function metric with ${TABLE} reference wrapping aggregate metric
// Reproduces GH-21089: ${TABLE} resolves to base table inside nested_agg_results CTE
export const METRIC_QUERY_NESTED_AGG_WINDOW_TABLE_REF: CompiledMetricQuery = {
    exploreName: 'my_table',
    dimensions: ['my_table_category'],
    metrics: ['my_table_window_sum_of_max'],
    filters: {},
    sorts: [{ fieldId: 'my_table_window_sum_of_max', descending: true }],
    limit: 10,
    tableCalculations: [],
    compiledTableCalculations: [],
    compiledAdditionalMetrics: [],
    compiledCustomDimensions: [],
};

// Transitive nested aggregate: type:number → type:number (with agg) → type:max
// The outer metric (ratio_of_sum_case) has no SQL aggregation itself,
// but its compiledSql contains SUM(CASE WHEN MAX(...)) via transitive inlining.
// Only ratio_of_sum_case is selected — sum_case_of_max is NOT directly selected.
export const METRIC_QUERY_NESTED_AGG_TRANSITIVE: CompiledMetricQuery = {
    exploreName: 'my_table',
    dimensions: ['my_table_category'],
    metrics: ['my_table_ratio_of_sum_case'],
    filters: {},
    sorts: [{ fieldId: 'my_table_ratio_of_sum_case', descending: true }],
    limit: 10,
    tableCalculations: [],
    compiledTableCalculations: [],
    compiledAdditionalMetrics: [],
    compiledCustomDimensions: [],
};

// Transitive nested aggregate mixed with other nested metrics.
// Reproduces bug where ratio_of_sum_case fails when combined with
// other nested metrics like conditional_sum_of_max.
export const METRIC_QUERY_NESTED_AGG_TRANSITIVE_MIXED: CompiledMetricQuery = {
    exploreName: 'my_table',
    dimensions: [],
    metrics: ['my_table_ratio_of_sum_case', 'my_table_conditional_sum_of_max'],
    filters: {},
    sorts: [{ fieldId: 'my_table_ratio_of_sum_case', descending: true }],
    limit: 10,
    tableCalculations: [],
    compiledTableCalculations: [],
    compiledAdditionalMetrics: [],
    compiledCustomDimensions: [],
};

// Mixed raw + aggregate inner deps (GH-21501):
// Outer metric: ARRAY_AGG(${raw_value} ORDER BY ${max_value} DESC)[1]
// raw_value is type:number (raw column), max_value is type:max (aggregate).
// CTE 1 should only pre-compute aggregate deps; CTE 3 (nested_agg_mixed)
// should join base table + CTE 1 so raw columns are accessible.
export const METRIC_QUERY_NESTED_AGG_MIXED_RAW: CompiledMetricQuery = {
    exploreName: 'my_table',
    dimensions: ['my_table_category'],
    metrics: ['my_table_mixed_raw_agg_repro'],
    filters: {},
    sorts: [{ fieldId: 'my_table_mixed_raw_agg_repro', descending: true }],
    limit: 10,
    tableCalculations: [],
    compiledTableCalculations: [],
    compiledAdditionalMetrics: [],
    compiledCustomDimensions: [],
};

// Mixed raw + aggregate alongside a pure aggregate metric in the same query.
// Tests that CTE 2 (nested_agg_results) handles pure-agg metrics and
// CTE 3 (nested_agg_mixed) handles mixed metrics without interfering.
export const METRIC_QUERY_NESTED_AGG_MIXED_RAW_WITH_PURE: CompiledMetricQuery =
    {
        exploreName: 'my_table',
        dimensions: ['my_table_category'],
        metrics: ['my_table_mixed_raw_agg_repro', 'my_table_sum_of_max'],
        filters: {},
        sorts: [{ fieldId: 'my_table_mixed_raw_agg_repro', descending: true }],
        limit: 10,
        tableCalculations: [],
        compiledTableCalculations: [],
        compiledAdditionalMetrics: [],
        compiledCustomDimensions: [],
    };

// Mixed raw + aggregate with no dimensions — tests CROSS JOIN path.
export const METRIC_QUERY_NESTED_AGG_MIXED_RAW_NO_DIMS: CompiledMetricQuery = {
    exploreName: 'my_table',
    dimensions: [],
    metrics: ['my_table_mixed_raw_agg_repro'],
    filters: {},
    sorts: [{ fieldId: 'my_table_mixed_raw_agg_repro', descending: true }],
    limit: 10,
    tableCalculations: [],
    compiledTableCalculations: [],
    compiledAdditionalMetrics: [],
    compiledCustomDimensions: [],
};

// PROD-7503: base table has a hidden helper metric named `met_active_customers`
// (type:number — raw column ref). A joined table has an aggregate metric with
// the SAME name (type:average). The base table also has:
//   - an outer mixed metric `met_active_customers_agg` whose SQL uses the short
//     form `${met_active_customers}` to reference the base table's raw helper.
//   - an outer pure-agg metric `met_active_customers_goal` whose SQL uses the
//     qualified form `${joined_tbl.met_active_customers}` to reference the
//     joined table's aggregate.
// Selecting both triggers the nested_agg_mixed CTE with an aggregate inner dep
// from the joined table whose name collides with the base helper's name.
export const EXPLORE_NESTED_AGG_NAME_COLLISION: Explore = {
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    name: 'base_tbl',
    label: 'base_tbl',
    baseTable: 'base_tbl',
    tags: [],
    tables: {
        base_tbl: {
            name: 'base_tbl',
            label: 'base_tbl',
            database: 'db',
            schema: 'schema',
            sqlTable: '"db"."schema"."base_tbl"',
            primaryKey: ['id'],
            lineageGraph: {},
            dimensions: {
                category: {
                    type: DimensionType.STRING,
                    name: 'category',
                    label: 'category',
                    table: 'base_tbl',
                    tableLabel: 'base_tbl',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.category',
                    compiledSql: '"base_tbl".category',
                    tablesReferences: ['base_tbl'],
                    hidden: false,
                },
            },
            metrics: {
                // Hidden helper: raw column ref. Same NAME as the joined
                // table's aggregate metric — this is the collision.
                met_active_customers: {
                    type: MetricType.NUMBER,
                    fieldType: FieldType.METRIC,
                    table: 'base_tbl',
                    tableLabel: 'base_tbl',
                    name: 'met_active_customers',
                    label: 'met_active_customers',
                    sql: '${TABLE}.active_customers',
                    compiledSql: '"base_tbl".active_customers',
                    tablesReferences: ['base_tbl'],
                    hidden: true,
                },
                // Hidden helper: raw column ref (ordering column for MAX_BY).
                met_updated_on: {
                    type: MetricType.NUMBER,
                    fieldType: FieldType.METRIC,
                    table: 'base_tbl',
                    tableLabel: 'base_tbl',
                    name: 'met_updated_on',
                    label: 'met_updated_on',
                    sql: '${TABLE}.updated_on',
                    compiledSql: '"base_tbl".updated_on',
                    tablesReferences: ['base_tbl'],
                    hidden: true,
                },
                // Outer mixed metric: both inner deps are raw column helpers on
                // base_tbl. The ${met_active_customers} short-form ref must
                // resolve to base_tbl's helper, NOT the joined table's
                // aggregate of the same name.
                met_active_customers_agg: {
                    type: MetricType.NUMBER,
                    fieldType: FieldType.METRIC,
                    table: 'base_tbl',
                    tableLabel: 'base_tbl',
                    name: 'met_active_customers_agg',
                    label: 'met_active_customers_agg',
                    sql: 'MAX_BY(${met_active_customers}, ${met_updated_on})',
                    compiledSql:
                        'MAX_BY("base_tbl".active_customers, "base_tbl".updated_on)',
                    tablesReferences: ['base_tbl'],
                    hidden: false,
                },
                // Outer pure-agg metric: qualified ref to the joined table's
                // aggregate. Forces joined_tbl.met_active_customers into
                // aggregateInnerDeps for the nested_agg CTE.
                met_active_customers_goal: {
                    type: MetricType.NUMBER,
                    fieldType: FieldType.METRIC,
                    table: 'base_tbl',
                    tableLabel: 'base_tbl',
                    name: 'met_active_customers_goal',
                    label: 'met_active_customers_goal',
                    sql: '${joined_tbl.met_active_customers}',
                    compiledSql: 'AVG("joined_tbl".active_customers)',
                    tablesReferences: ['base_tbl', 'joined_tbl'],
                    hidden: false,
                },
            },
        },
        joined_tbl: {
            name: 'joined_tbl',
            label: 'joined_tbl',
            database: 'db',
            schema: 'schema',
            sqlTable: '"db"."schema"."joined_tbl"',
            primaryKey: ['base_id'],
            lineageGraph: {},
            dimensions: {
                joined_dim: {
                    type: DimensionType.STRING,
                    name: 'joined_dim',
                    label: 'joined_dim',
                    table: 'joined_tbl',
                    tableLabel: 'joined_tbl',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.joined_dim',
                    compiledSql: '"joined_tbl".joined_dim',
                    tablesReferences: ['joined_tbl'],
                    hidden: false,
                },
            },
            metrics: {
                // Aggregate metric with the SAME name as base_tbl's helper.
                met_active_customers: {
                    type: MetricType.AVERAGE,
                    fieldType: FieldType.METRIC,
                    table: 'joined_tbl',
                    tableLabel: 'joined_tbl',
                    name: 'met_active_customers',
                    label: 'met_active_customers',
                    sql: '${TABLE}.active_customers',
                    compiledSql: 'AVG("joined_tbl".active_customers)',
                    tablesReferences: ['joined_tbl'],
                    hidden: false,
                },
            },
        },
    },
    joinedTables: [
        {
            table: 'joined_tbl',
            sqlOn: '${base_tbl.id} = ${joined_tbl.base_id}',
            compiledSqlOn: '("base_tbl".id) = ("joined_tbl".base_id)',
            type: 'left',
            relationship: JoinRelationship.ONE_TO_ONE,
            tablesReferences: ['base_tbl', 'joined_tbl'],
        },
    ],
};

export const METRIC_QUERY_NESTED_AGG_NAME_COLLISION: CompiledMetricQuery = {
    exploreName: 'base_tbl',
    dimensions: ['base_tbl_category'],
    metrics: [
        'base_tbl_met_active_customers_agg',
        'base_tbl_met_active_customers_goal',
    ],
    filters: {},
    sorts: [{ fieldId: 'base_tbl_met_active_customers_agg', descending: true }],
    limit: 10,
    tableCalculations: [],
    compiledTableCalculations: [],
    compiledAdditionalMetrics: [],
    compiledCustomDimensions: [],
};

// --- cross-model type:number referencing sum_distinct fixtures ---

export const EXPLORE_WITH_CROSS_MODEL_SUM_DISTINCT: Explore = {
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    name: 'customers',
    label: 'customers',
    baseTable: 'customers',
    tags: [],
    tables: {
        customers: {
            name: 'customers',
            label: 'customers',
            database: 'mydb',
            schema: 'public',
            sqlTable: 'customers',
            primaryKey: ['customer_id'],
            lineageGraph: {},
            dimensions: {
                customer_id: {
                    type: DimensionType.STRING,
                    name: 'customer_id',
                    label: 'Customer ID',
                    table: 'customers',
                    tableLabel: 'customers',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.customer_id',
                    compiledSql: '"customers".customer_id',
                    tablesReferences: ['customers'],
                    hidden: false,
                },
            },
            metrics: {
                adjusted_revenue: {
                    type: MetricType.NUMBER,
                    name: 'adjusted_revenue',
                    label: 'Adjusted Revenue',
                    table: 'customers',
                    tableLabel: 'customers',
                    fieldType: FieldType.METRIC,
                    sql: '${orders.total_revenue} * 1.1',
                    // BUG: compileMetricReference inlines the sum_distinct
                    // fallback SQL instead of preserving distinct metadata
                    compiledSql: '(SUM("orders".amount)) * 1.1',
                    tablesReferences: ['customers', 'orders'],
                    hidden: false,
                },
            },
        },
        orders: {
            name: 'orders',
            label: 'orders',
            database: 'mydb',
            schema: 'public',
            sqlTable: 'orders',
            primaryKey: ['order_id'],
            lineageGraph: {},
            dimensions: {
                order_id: {
                    type: DimensionType.STRING,
                    name: 'order_id',
                    label: 'Order ID',
                    table: 'orders',
                    tableLabel: 'orders',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.order_id',
                    compiledSql: '"orders".order_id',
                    tablesReferences: ['orders'],
                    hidden: false,
                },
                line_item_id: {
                    type: DimensionType.STRING,
                    name: 'line_item_id',
                    label: 'Line Item ID',
                    table: 'orders',
                    tableLabel: 'orders',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.line_item_id',
                    compiledSql: '"orders".line_item_id',
                    tablesReferences: ['orders'],
                    hidden: false,
                },
            },
            metrics: {
                total_revenue: {
                    type: MetricType.SUM_DISTINCT,
                    fieldType: FieldType.METRIC,
                    table: 'orders',
                    tableLabel: 'orders',
                    name: 'total_revenue',
                    label: 'Total Revenue',
                    sql: '${TABLE}.amount',
                    compiledSql: 'SUM("orders".amount)',
                    compiledValueSql: '"orders".amount',
                    compiledDistinctKeys: ['"orders".line_item_id'],
                    tablesReferences: ['orders'],
                    hidden: false,
                },
            },
        },
    },
    joinedTables: [
        {
            table: 'orders',
            sqlOn: '${customers.customer_id} = ${orders.customer_id}',
            compiledSqlOn: '("customers".customer_id) = ("orders".customer_id)',
            type: 'left',
            relationship: JoinRelationship.ONE_TO_MANY,
            tablesReferences: ['customers', 'orders'],
        },
    ],
};

export const METRIC_QUERY_CROSS_MODEL_SUM_DISTINCT: CompiledMetricQuery = {
    exploreName: 'customers',
    dimensions: ['customers_customer_id'],
    metrics: ['customers_adjusted_revenue'],
    filters: {},
    sorts: [{ fieldId: 'customers_adjusted_revenue', descending: true }],
    limit: 10,
    tableCalculations: [],
    compiledTableCalculations: [],
    compiledAdditionalMetrics: [],
    compiledCustomDimensions: [],
};

// Same-model: type:number referencing sum_distinct + regular aggregate
// Tests that references like ${order_count} resolve to dd_base."orders_order_count"
// instead of being recompiled as raw SQL (which breaks in the outer SELECT context).
export const EXPLORE_WITH_SAME_MODEL_NUMBER_AND_SUM_DISTINCT: Explore = {
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    name: 'orders',
    label: 'orders',
    baseTable: 'orders',
    tags: [],
    joinedTables: [],
    tables: {
        orders: {
            name: 'orders',
            label: 'orders',
            database: 'db',
            schema: 'schema',
            sqlTable: '"db"."schema"."orders"',
            primaryKey: ['order_id'],
            lineageGraph: {},
            dimensions: {
                order_id: {
                    type: DimensionType.STRING,
                    name: 'order_id',
                    label: 'Order ID',
                    table: 'orders',
                    tableLabel: 'orders',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.order_id',
                    compiledSql: '"orders".order_id',
                    tablesReferences: ['orders'],
                    hidden: false,
                },
                line_item_id: {
                    type: DimensionType.STRING,
                    name: 'line_item_id',
                    label: 'Line Item ID',
                    table: 'orders',
                    tableLabel: 'orders',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.line_item_id',
                    compiledSql: '"orders".line_item_id',
                    tablesReferences: ['orders'],
                    hidden: false,
                },
                status: {
                    type: DimensionType.STRING,
                    name: 'status',
                    label: 'Status',
                    table: 'orders',
                    tableLabel: 'orders',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.status',
                    compiledSql: '"orders".status',
                    tablesReferences: ['orders'],
                    hidden: false,
                },
            },
            metrics: {
                total_revenue: {
                    type: MetricType.SUM_DISTINCT,
                    fieldType: FieldType.METRIC,
                    table: 'orders',
                    tableLabel: 'orders',
                    name: 'total_revenue',
                    label: 'Total Revenue',
                    sql: '${TABLE}.amount',
                    compiledSql: 'SUM("orders".amount)',
                    compiledValueSql: '"orders".amount',
                    compiledDistinctKeys: ['"orders".line_item_id'],
                    tablesReferences: ['orders'],
                    hidden: false,
                },
                order_count: {
                    type: MetricType.COUNT,
                    fieldType: FieldType.METRIC,
                    table: 'orders',
                    tableLabel: 'orders',
                    name: 'order_count',
                    label: 'Order Count',
                    sql: '${TABLE}.order_id',
                    compiledSql: 'COUNT("orders".order_id)',
                    tablesReferences: ['orders'],
                    hidden: false,
                },
                avg_deduped_revenue: {
                    type: MetricType.NUMBER,
                    fieldType: FieldType.METRIC,
                    table: 'orders',
                    tableLabel: 'orders',
                    name: 'avg_deduped_revenue',
                    label: 'Avg Deduped Revenue',
                    sql: '${total_revenue} / NULLIF(${order_count}, 0)',
                    compiledSql:
                        '(SUM("orders".amount)) / NULLIF(COUNT("orders".order_id), 0)',
                    tablesReferences: ['orders'],
                    hidden: false,
                },
            },
        },
    },
};

export const METRIC_QUERY_SAME_MODEL_NUMBER_WITH_SUM_DISTINCT: CompiledMetricQuery =
    {
        exploreName: 'orders',
        dimensions: ['orders_status'],
        metrics: ['orders_avg_deduped_revenue'],
        filters: {},
        sorts: [{ fieldId: 'orders_avg_deduped_revenue', descending: true }],
        limit: 10,
        tableCalculations: [],
        compiledTableCalculations: [],
        compiledAdditionalMetrics: [],
        compiledCustomDimensions: [],
    };

export const METRIC_QUERY_CROSS_MODEL_SUM_DISTINCT_NO_DIMS: CompiledMetricQuery =
    {
        exploreName: 'customers',
        dimensions: [],
        metrics: ['customers_adjusted_revenue'],
        filters: {},
        sorts: [{ fieldId: 'customers_adjusted_revenue', descending: true }],
        limit: 10,
        tableCalculations: [],
        compiledTableCalculations: [],
        compiledAdditionalMetrics: [],
        compiledCustomDimensions: [],
    };

// Repro for SPK-333: a type:number metric referencing a sum_distinct metric
// is selected alongside a simple sum metric on a joined (one-to-many) table
// that triggers fanout protection. The non-aggregate metric's ${sum_distinct}
// reference must resolve to the dd CTE alias; inlining the fallback SUM breaks
// because the raw table is not in scope of the dd_base outer SELECT.
export const EXPLORE_WITH_FANOUT_AND_DD_REFERENCE: Explore = {
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    name: 'customers',
    label: 'customers',
    baseTable: 'customers',
    tags: [],
    tables: {
        customers: {
            name: 'customers',
            label: 'customers',
            database: 'mydb',
            schema: 'public',
            sqlTable: 'customers',
            primaryKey: ['customer_id'],
            lineageGraph: {},
            dimensions: {
                customer_id: {
                    type: DimensionType.STRING,
                    name: 'customer_id',
                    label: 'Customer ID',
                    table: 'customers',
                    tableLabel: 'customers',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.customer_id',
                    compiledSql: '"customers".customer_id',
                    tablesReferences: ['customers'],
                    hidden: false,
                },
            },
            metrics: {
                unique_customer_count: {
                    type: MetricType.COUNT_DISTINCT,
                    name: 'unique_customer_count',
                    label: 'Unique Customer Count',
                    table: 'customers',
                    tableLabel: 'customers',
                    fieldType: FieldType.METRIC,
                    sql: '${TABLE}.customer_id',
                    compiledSql: 'COUNT(DISTINCT "customers".customer_id)',
                    tablesReferences: ['customers'],
                    hidden: false,
                },
                total_order_amount_deduped: {
                    type: MetricType.SUM_DISTINCT,
                    name: 'total_order_amount_deduped',
                    label: 'Total Order Amount (Deduped)',
                    table: 'customers',
                    tableLabel: 'customers',
                    fieldType: FieldType.METRIC,
                    sql: '${orders.amount}',
                    distinctKeys: ['orders.order_id'],
                    compiledSql: 'SUM("orders".amount)',
                    compiledValueSql: '("orders".amount)',
                    compiledDistinctKeys: ['("orders".order_id)'],
                    tablesReferences: ['customers', 'orders'],
                    hidden: false,
                },
                average_customer_lifetime_value: {
                    type: MetricType.NUMBER,
                    name: 'average_customer_lifetime_value',
                    label: 'Average Customer Lifetime Value',
                    table: 'customers',
                    tableLabel: 'customers',
                    fieldType: FieldType.METRIC,
                    sql: '${total_order_amount_deduped} / NULLIF(${unique_customer_count}, 0)',
                    // compileMetricSql inlines the fallback SUM for the
                    // sum_distinct ref; the query builder must rewrite this
                    // to point at the dd CTE instead of emitting it raw.
                    compiledSql:
                        '(SUM("orders".amount)) / NULLIF(COUNT(DISTINCT "customers".customer_id), 0)',
                    tablesReferences: ['customers', 'orders'],
                    hidden: false,
                },
            },
        },
        orders: {
            name: 'orders',
            label: 'orders',
            database: 'mydb',
            schema: 'public',
            sqlTable: 'orders',
            primaryKey: ['order_id'],
            lineageGraph: {},
            dimensions: {
                order_id: {
                    type: DimensionType.STRING,
                    name: 'order_id',
                    label: 'Order ID',
                    table: 'orders',
                    tableLabel: 'orders',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.order_id',
                    compiledSql: '"orders".order_id',
                    tablesReferences: ['orders'],
                    hidden: false,
                },
                amount: {
                    type: DimensionType.NUMBER,
                    name: 'amount',
                    label: 'Amount',
                    table: 'orders',
                    tableLabel: 'orders',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.amount',
                    compiledSql: '"orders".amount',
                    tablesReferences: ['orders'],
                    hidden: false,
                },
            },
            metrics: {
                total_order_amount: {
                    type: MetricType.SUM,
                    name: 'total_order_amount',
                    label: 'Total Order Amount',
                    table: 'orders',
                    tableLabel: 'orders',
                    fieldType: FieldType.METRIC,
                    sql: '${TABLE}.amount',
                    compiledSql: 'SUM("orders".amount)',
                    tablesReferences: ['orders'],
                    hidden: false,
                },
            },
        },
        payments: {
            name: 'payments',
            label: 'payments',
            database: 'mydb',
            schema: 'public',
            sqlTable: 'payments',
            primaryKey: ['payment_id'],
            lineageGraph: {},
            dimensions: {
                payment_id: {
                    type: DimensionType.STRING,
                    name: 'payment_id',
                    label: 'Payment ID',
                    table: 'payments',
                    tableLabel: 'payments',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.payment_id',
                    compiledSql: '"payments".payment_id',
                    tablesReferences: ['payments'],
                    hidden: false,
                },
            },
            metrics: {
                payment_count: {
                    type: MetricType.COUNT,
                    name: 'payment_count',
                    label: 'Payment Count',
                    table: 'payments',
                    tableLabel: 'payments',
                    fieldType: FieldType.METRIC,
                    sql: '${TABLE}.payment_id',
                    compiledSql: 'COUNT("payments".payment_id)',
                    tablesReferences: ['payments'],
                    hidden: false,
                },
            },
        },
    },
    joinedTables: [
        {
            table: 'orders',
            sqlOn: '${customers.customer_id} = ${orders.customer_id}',
            compiledSqlOn: '("customers".customer_id) = ("orders".customer_id)',
            type: 'left',
            relationship: JoinRelationship.ONE_TO_MANY,
            tablesReferences: ['customers', 'orders'],
        },
        {
            table: 'payments',
            sqlOn: '${orders.order_id} = ${payments.order_id}',
            compiledSqlOn: '("orders".order_id) = ("payments".order_id)',
            type: 'left',
            relationship: JoinRelationship.ONE_TO_MANY,
            tablesReferences: ['orders', 'payments'],
        },
    ],
};

export const METRIC_QUERY_FANOUT_AND_DD_REFERENCE: CompiledMetricQuery = {
    exploreName: 'customers',
    dimensions: [],
    metrics: [
        'customers_average_customer_lifetime_value',
        'customers_total_order_amount_deduped',
        'orders_total_order_amount',
        'payments_payment_count',
    ],
    filters: {},
    sorts: [
        {
            fieldId: 'customers_average_customer_lifetime_value',
            descending: true,
        },
    ],
    limit: 500,
    tableCalculations: [],
    compiledTableCalculations: [],
    compiledAdditionalMetrics: [],
    compiledCustomDimensions: [],
};
