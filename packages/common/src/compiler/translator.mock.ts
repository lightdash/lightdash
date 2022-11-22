import { DbtMetric, DbtModelColumn, DbtModelNode } from '../types/dbt';
import { Table } from '../types/explore';
import { DimensionType, FieldType, MetricType } from '../types/field';
import { TimeFrames } from '../types/timeFrames';

type WarehouseCatalog = {
    [database: string]: {
        [schema: string]: {
            [table: string]: { [column: string]: DimensionType };
        };
    };
};

export const VALID_ID_COLUMN_NAMES = [
    { input: 'userid', output: 'user' },
    { input: 'user_id', output: 'user' },
    { input: 'user__id', output: 'user' },
    { input: 'UNiqUE_*093USER___ID', output: 'unique_user' },
    { input: 'gid', output: 'g' },
    { input: 'userId', output: 'user' },
    { input: 'USERID', output: 'user' },
    { input: '$$__nth.rc*#)id', output: 'nth_rc' },
    { input: '0932_user_id', output: 'user' },
    { input: 'valid_id', output: 'valid' },
];

export const INVALID_ID_COLUMN_NAMES = [
    'isValid',
    'invalid',
    '',
    'id',
    'i',
    'my_fave_column',
    '12345_id',
];

export const DBT_METRIC: DbtMetric = {
    fqn: [],
    expression: '',
    unique_id: 'dbt_metric_1',
    package_name: '',
    path: '',
    root_path: '',
    original_file_path: '',
    model: "ref('myTable')",
    name: 'dbt_metric_1',
    description: 'Description',
    label: 'Label',
    calculation_method: MetricType.SUM,
    timestamp: '',
    filters: [],
    time_grains: [],
    dimensions: [],
    refs: [['myTable']],
};

export const DBT_METRIC_WITH_FILTER: DbtMetric = {
    ...DBT_METRIC,
    name: 'dbt_metric_4',
    filters: [
        {
            field: 'column_filter',
            operator: '>=',
            value: '123',
        },
        {
            field: 'column_filter',
            operator: '<=',
            value: '456',
        },
    ],
};

export const DBT_METRIC_WITH_SQL_FIELD: DbtMetric = {
    ...DBT_METRIC,
    name: 'dbt_metric_2',
    expression: 'dim1',
};

export const DBT_METRIC_WITH_CUSTOM_SQL: DbtMetric = {
    ...DBT_METRIC,
    name: 'dbt_metric_3',
    calculation_method: MetricType.NUMBER,
    expression: 'dim1 + dim2',
};

export const DBT_METRIC_DERIVED: DbtMetric = {
    ...DBT_METRIC,
    name: 'dbt_metric_5',
    calculation_method: 'derived',
    expression: 'dbt_metric_1 / dbt_metric_1',
    metrics: [['dbt_metric_1'], ['dbt_metric_1']], // one per each reference
};

const ID_COLUMN_WITHOUT_METRICS: DbtModelColumn = {
    name: 'user_id',
    meta: {},
    data_type: DimensionType.STRING,
};

const column: DbtModelColumn = {
    name: 'myColumnName',
    meta: {},
};

const COLUMN_WITH_METRICS: Record<string, DbtModelColumn> = {
    user_id: {
        name: 'user_id',
        data_type: DimensionType.STRING,
        meta: {
            metrics: {
                user_count: { type: MetricType.COUNT_DISTINCT },
            },
        },
    },
    num_participating_athletes: {
        name: 'num_participating_athletes',
        data_type: DimensionType.NUMBER,
        meta: {
            dimension: {
                sql: 'num_participating_men + num_participating_women',
            },
            metrics: {
                total_num_participating_athletes: { type: MetricType.SUM },
            },
        },
    },
};

const COLUMN_WITH_DEFAULT_TIME_INTERVALS: Record<string, DbtModelColumn> = {
    user_created: {
        name: 'user_created',
        data_type: DimensionType.TIMESTAMP,
        meta: {
            dimension: {
                time_intervals: 'default',
            },
        },
    },
};

const COLUMN_WITH_NO_TIME_INTERVALS: Record<string, DbtModelColumn> = {
    user_created: {
        name: 'user_created',
        data_type: DimensionType.TIMESTAMP,
        meta: {
            dimension: {
                time_intervals: undefined,
            },
        },
    },
};

const COLUMN_WITH_OFF_TIME_INTERVALS: Record<string, DbtModelColumn> = {
    user_created: {
        name: 'user_created',
        data_type: DimensionType.TIMESTAMP,
        meta: {
            dimension: {
                time_intervals: 'OFF',
            },
        },
    },
};

const COLUMN_WITH_CUSTOM_TIME_INTERVALS: Record<string, DbtModelColumn> = {
    user_created: {
        name: 'user_created',
        data_type: DimensionType.DATE,
        meta: {
            dimension: {
                time_intervals: [TimeFrames.YEAR],
            },
        },
    },
};

export const model: DbtModelNode & { relation_name: string } = {
    alias: '',
    checksum: { name: '', checksum: '' },
    fqn: [],
    language: '',
    package_name: '',
    path: '',
    raw_code: '',
    compiled: true,
    unique_id: 'unique_id',
    description: 'my fun table',
    resource_type: 'model',
    columns: {
        myColumnName: column,
    },
    meta: {},
    database: 'myDatabase',
    schema: 'mySchema',
    name: 'myTable',
    tags: [],
    relation_name: 'relation_name',
    depends_on: { nodes: [] },
    root_path: 'root_path',
    patch_path: null,
    original_file_path: '',
};

export const MODEL_WITH_NO_METRICS: DbtModelNode & { relation_name: string } = {
    ...model,
    columns: {
        [ID_COLUMN_WITHOUT_METRICS.name]: ID_COLUMN_WITHOUT_METRICS,
    },
};

export const LIGHTDASH_TABLE_WITHOUT_AUTO_METRICS: Omit<Table, 'lineageGraph'> =
    {
        name: MODEL_WITH_NO_METRICS.name,
        label: 'My table',
        database: MODEL_WITH_NO_METRICS.database,
        schema: MODEL_WITH_NO_METRICS.schema,
        sqlTable: MODEL_WITH_NO_METRICS.relation_name,
        description: MODEL_WITH_NO_METRICS.description,
        dimensions: {
            user_id: {
                fieldType: FieldType.DIMENSION,
                description: undefined,
                type: DimensionType.STRING,
                sql: '${TABLE}.user_id',
                name: 'user_id',
                label: 'User id',
                table: MODEL_WITH_NO_METRICS.name,
                tableLabel: 'My table',
                source: undefined,
                group: undefined,
                timeInterval: undefined,
                hidden: false,
                format: undefined,
                round: undefined,
                compact: undefined,
                groupLabel: undefined,
            },
        },
        metrics: {},
    };

export const LIGHTDASH_TABLE_WITH_DBT_METRICS: Omit<Table, 'lineageGraph'> = {
    ...LIGHTDASH_TABLE_WITHOUT_AUTO_METRICS,
    metrics: {
        dbt_metric_1: {
            description: 'Description',
            fieldType: FieldType.METRIC,
            hidden: false,
            isAutoGenerated: false,
            label: 'Label',
            name: 'dbt_metric_1',
            sql: '${TABLE}.dbt_metric_1',
            table: 'myTable',
            tableLabel: 'My table',
            type: MetricType.SUM,
            format: undefined,
            round: undefined,
            compact: undefined,
            showUnderlyingValues: undefined,
            source: undefined,
            groupLabel: undefined,
            filters: [],
        },
        dbt_metric_2: {
            description: 'Description',
            fieldType: FieldType.METRIC,
            hidden: false,
            isAutoGenerated: false,
            label: 'Label',
            name: 'dbt_metric_2',
            sql: '${TABLE}.dim1',
            table: 'myTable',
            tableLabel: 'My table',
            type: MetricType.SUM,
            format: undefined,
            round: undefined,
            compact: undefined,
            showUnderlyingValues: undefined,
            source: undefined,
            groupLabel: undefined,
            filters: [],
        },
        dbt_metric_3: {
            description: 'Description',
            fieldType: FieldType.METRIC,
            hidden: false,
            isAutoGenerated: false,
            label: 'Label',
            name: 'dbt_metric_3',
            sql: 'dim1 + dim2',
            table: 'myTable',
            tableLabel: 'My table',
            type: MetricType.NUMBER,
            format: undefined,
            round: undefined,
            compact: undefined,
            showUnderlyingValues: undefined,
            source: undefined,
            groupLabel: undefined,
            filters: [],
        },
        dbt_metric_4: {
            description: 'Description',
            fieldType: FieldType.METRIC,
            hidden: false,
            isAutoGenerated: false,
            label: 'Label',
            name: 'dbt_metric_4',
            sql: 'CASE WHEN (${TABLE}.column_filter >= 123) AND (${TABLE}.column_filter <= 456) THEN ${TABLE}.dbt_metric_4 ELSE NULL END',
            table: 'myTable',
            tableLabel: 'My table',
            type: MetricType.SUM,
            format: undefined,
            round: undefined,
            compact: undefined,
            showUnderlyingValues: undefined,
            source: undefined,
            groupLabel: undefined,
            filters: [],
        },
        dbt_metric_5: {
            description: 'Description',
            fieldType: FieldType.METRIC,
            hidden: false,
            isAutoGenerated: false,
            label: 'Label',
            name: 'dbt_metric_5',
            sql: '${dbt_metric_1} / ${dbt_metric_1}',
            table: 'myTable',
            tableLabel: 'My table',
            type: MetricType.NUMBER,
            format: undefined,
            round: undefined,
            compact: undefined,
            showUnderlyingValues: undefined,
            source: undefined,
            groupLabel: undefined,
            filters: [],
        },
    },
};

export const MODEL_WITH_METRIC: DbtModelNode & { relation_name: string } = {
    ...model,
    description: 'my test table',
    columns: COLUMN_WITH_METRICS,
};

export const MODEL_WITH_WRONG_METRIC: DbtModelNode & { relation_name: string } =
    {
        ...model,
        columns: {
            user_id: {
                name: 'user_id',
                data_type: DimensionType.STRING,
                meta: {
                    metrics: {
                        user_id: { type: MetricType.COUNT_DISTINCT },
                    },
                },
            },
        },
    };

export const MODEL_WITH_WRONG_METRICS: DbtModelNode = {
    ...model,
    columns: {
        user_id: {
            name: 'user_id',
            data_type: DimensionType.STRING,
            meta: {},
        },
        other: {
            name: 'other',
            data_type: DimensionType.STRING,
            meta: {
                metrics: {
                    user_id: { type: MetricType.COUNT_DISTINCT },
                },
            },
        },
        user_id2: {
            name: 'user_id2',
            data_type: DimensionType.STRING,
            meta: {
                metrics: {
                    user_id2: { type: MetricType.COUNT_DISTINCT },
                },
            },
        },
    },
};

export const LIGHTDASH_TABLE_WITH_METRICS: Omit<Table, 'lineageGraph'> = {
    name: MODEL_WITH_METRIC.name,
    label: 'My table',
    database: MODEL_WITH_METRIC.database,
    schema: MODEL_WITH_METRIC.schema,
    sqlTable: MODEL_WITH_METRIC.relation_name,
    description: MODEL_WITH_METRIC.description,
    dimensions: {
        user_id: {
            fieldType: FieldType.DIMENSION,
            description: undefined,
            type: DimensionType.STRING,
            sql: '${TABLE}.user_id',
            name: 'user_id',
            label: 'User id',
            table: MODEL_WITH_METRIC.name,
            tableLabel: 'My table',
            source: undefined,
            group: undefined,
            timeInterval: undefined,
            hidden: false,
            format: undefined,
            round: undefined,
            compact: undefined,
            groupLabel: undefined,
        },
        num_participating_athletes: {
            fieldType: FieldType.DIMENSION,
            description: undefined,
            type: DimensionType.NUMBER,
            sql: 'num_participating_men + num_participating_women',
            name: 'num_participating_athletes',
            label: 'Num participating athletes',
            table: MODEL_WITH_METRIC.name,
            tableLabel: 'My table',
            source: undefined,
            group: undefined,
            timeInterval: undefined,
            hidden: false,
            format: undefined,
            round: undefined,
            compact: undefined,
            groupLabel: undefined,
        },
    },
    metrics: {
        user_count: {
            fieldType: FieldType.METRIC,
            type: MetricType.COUNT_DISTINCT,
            sql: '${TABLE}.user_id',
            name: 'user_count',
            label: 'User count',
            table: MODEL_WITH_METRIC.name,
            tableLabel: 'My table',
            description: 'Count distinct of User id',
            source: undefined,
            isAutoGenerated: false,
            hidden: false,
            format: undefined,
            round: undefined,
            compact: undefined,
            showUnderlyingValues: undefined,
            groupLabel: undefined,
            filters: [],
        },
        total_num_participating_athletes: {
            fieldType: FieldType.METRIC,
            type: MetricType.SUM,
            sql: 'num_participating_men + num_participating_women',
            name: 'total_num_participating_athletes',
            label: 'Total num participating athletes',
            table: MODEL_WITH_METRIC.name,
            tableLabel: 'My table',
            description: 'Sum of Num participating athletes',
            source: undefined,
            isAutoGenerated: false,
            hidden: false,
            format: undefined,
            round: undefined,
            compact: undefined,
            showUnderlyingValues: undefined,
            groupLabel: undefined,
            filters: [],
        },
    },
};

export const MODEL_WITH_DEFAULT_TIME_INTERVAL_DIMENSIONS: DbtModelNode & {
    relation_name: string;
} = {
    ...model,
    columns: COLUMN_WITH_DEFAULT_TIME_INTERVALS,
};

export const MODEL_WITH_NO_TIME_INTERVAL_DIMENSIONS: DbtModelNode = {
    ...model,
    columns: COLUMN_WITH_NO_TIME_INTERVALS,
};

export const LIGHTDASH_TABLE_WITH_DEFAULT_TIME_INTERVAL_DIMENSIONS_BIGQUERY: Omit<
    Table,
    'lineageGraph'
> = {
    name: MODEL_WITH_DEFAULT_TIME_INTERVAL_DIMENSIONS.name,
    label: 'My table',
    database: MODEL_WITH_DEFAULT_TIME_INTERVAL_DIMENSIONS.database,
    schema: MODEL_WITH_DEFAULT_TIME_INTERVAL_DIMENSIONS.schema,
    sqlTable: MODEL_WITH_DEFAULT_TIME_INTERVAL_DIMENSIONS.relation_name,
    description: MODEL_WITH_DEFAULT_TIME_INTERVAL_DIMENSIONS.description,
    dimensions: {
        user_created: {
            fieldType: FieldType.DIMENSION,
            description: undefined,
            type: DimensionType.TIMESTAMP,
            sql: '${TABLE}.user_created',
            name: 'user_created',
            label: 'User created',
            table: MODEL_WITH_DEFAULT_TIME_INTERVAL_DIMENSIONS.name,
            tableLabel: 'My table',
            source: undefined,
            group: undefined,
            timeInterval: undefined,
            hidden: false,
            format: undefined,
            round: undefined,
            compact: undefined,
            groupLabel: undefined,
        },
        user_created_RAW: {
            fieldType: FieldType.DIMENSION,
            description: undefined,
            type: DimensionType.TIMESTAMP,
            sql: '${TABLE}.user_created',
            name: 'user_created_raw',
            label: 'User created raw',
            table: MODEL_WITH_DEFAULT_TIME_INTERVAL_DIMENSIONS.name,
            tableLabel: 'My table',
            source: undefined,
            group: 'user_created',
            timeInterval: TimeFrames.RAW,
            hidden: false,
            format: undefined,
            round: undefined,
            compact: undefined,
            groupLabel: undefined,
        },
        user_created_DAY: {
            fieldType: FieldType.DIMENSION,
            description: undefined,
            type: DimensionType.DATE,
            sql: 'DATETIME_TRUNC(${TABLE}.user_created, DAY)',
            name: 'user_created_day',
            label: 'User created day',
            table: MODEL_WITH_DEFAULT_TIME_INTERVAL_DIMENSIONS.name,
            tableLabel: 'My table',
            source: undefined,
            group: 'user_created',
            timeInterval: TimeFrames.DAY,
            hidden: false,
            format: undefined,
            round: undefined,
            compact: undefined,
            groupLabel: undefined,
        },
        user_created_WEEK: {
            fieldType: FieldType.DIMENSION,
            description: undefined,
            type: DimensionType.DATE,
            sql: 'DATETIME_TRUNC(${TABLE}.user_created, WEEK)',
            name: 'user_created_week',
            label: 'User created week',
            table: MODEL_WITH_DEFAULT_TIME_INTERVAL_DIMENSIONS.name,
            tableLabel: 'My table',
            source: undefined,
            group: 'user_created',
            timeInterval: TimeFrames.WEEK,
            hidden: false,
            format: undefined,
            round: undefined,
            compact: undefined,
            groupLabel: undefined,
        },
        user_created_MONTH: {
            fieldType: FieldType.DIMENSION,
            description: undefined,
            type: DimensionType.DATE,
            sql: 'DATETIME_TRUNC(${TABLE}.user_created, MONTH)',
            name: 'user_created_month',
            label: 'User created month',
            table: MODEL_WITH_DEFAULT_TIME_INTERVAL_DIMENSIONS.name,
            tableLabel: 'My table',
            source: undefined,
            group: 'user_created',
            timeInterval: TimeFrames.MONTH,
            hidden: false,
            format: undefined,
            round: undefined,
            compact: undefined,
            groupLabel: undefined,
        },
        user_created_QUARTER: {
            description: undefined,
            fieldType: FieldType.DIMENSION,
            format: undefined,
            group: 'user_created',
            groupLabel: undefined,
            hidden: false,
            label: 'User created quarter',
            name: 'user_created_quarter',
            round: undefined,
            compact: undefined,
            source: undefined,
            sql: 'DATETIME_TRUNC(${TABLE}.user_created, QUARTER)',
            table: 'myTable',
            tableLabel: 'My table',
            timeInterval: TimeFrames.QUARTER,
            type: DimensionType.DATE,
        },
        user_created_YEAR: {
            fieldType: FieldType.DIMENSION,
            description: undefined,
            type: DimensionType.DATE,
            sql: 'DATETIME_TRUNC(${TABLE}.user_created, YEAR)',
            name: 'user_created_year',
            label: 'User created year',
            table: MODEL_WITH_DEFAULT_TIME_INTERVAL_DIMENSIONS.name,
            tableLabel: 'My table',
            source: undefined,
            group: 'user_created',
            timeInterval: TimeFrames.YEAR,
            hidden: false,
            format: undefined,
            round: undefined,
            compact: undefined,
            groupLabel: undefined,
        },
    },
    metrics: {},
};

export const LIGHTDASH_TABLE_WITH_DEFAULT_TIME_INTERVAL_DIMENSIONS_SNOWFLAKE: Omit<
    Table,
    'lineageGraph'
> = {
    name: MODEL_WITH_DEFAULT_TIME_INTERVAL_DIMENSIONS.name,
    label: 'My table',
    database: MODEL_WITH_DEFAULT_TIME_INTERVAL_DIMENSIONS.database,
    schema: MODEL_WITH_DEFAULT_TIME_INTERVAL_DIMENSIONS.schema,
    sqlTable: MODEL_WITH_DEFAULT_TIME_INTERVAL_DIMENSIONS.relation_name,
    description: MODEL_WITH_DEFAULT_TIME_INTERVAL_DIMENSIONS.description,
    dimensions: {
        user_created: {
            fieldType: FieldType.DIMENSION,
            description: undefined,
            type: DimensionType.TIMESTAMP,
            sql: "TO_TIMESTAMP_NTZ(CONVERT_TIMEZONE('UTC', ${TABLE}.user_created))",
            name: 'user_created',
            table: MODEL_WITH_DEFAULT_TIME_INTERVAL_DIMENSIONS.name,
            tableLabel: 'My table',
            label: 'User created',
            source: undefined,
            group: undefined,
            timeInterval: undefined,
            hidden: false,
            format: undefined,
            round: undefined,
            compact: undefined,
            groupLabel: undefined,
        },
        user_created_RAW: {
            fieldType: FieldType.DIMENSION,
            description: undefined,
            type: DimensionType.TIMESTAMP,
            sql: "TO_TIMESTAMP_NTZ(CONVERT_TIMEZONE('UTC', ${TABLE}.user_created))",
            name: 'user_created_raw',

            table: MODEL_WITH_DEFAULT_TIME_INTERVAL_DIMENSIONS.name,
            tableLabel: 'My table',

            label: 'User created raw',
            source: undefined,
            group: 'user_created',
            timeInterval: TimeFrames.RAW,
            hidden: false,
            format: undefined,
            round: undefined,
            compact: undefined,
            groupLabel: undefined,
        },
        user_created_DAY: {
            fieldType: FieldType.DIMENSION,
            description: undefined,
            type: DimensionType.DATE,
            sql: "DATE_TRUNC('DAY', TO_TIMESTAMP_NTZ(CONVERT_TIMEZONE('UTC', ${TABLE}.user_created)))",
            name: 'user_created_day',
            table: MODEL_WITH_DEFAULT_TIME_INTERVAL_DIMENSIONS.name,
            tableLabel: 'My table',

            label: 'User created day',

            source: undefined,
            group: 'user_created',
            timeInterval: TimeFrames.DAY,
            hidden: false,
            format: undefined,
            round: undefined,
            compact: undefined,
            groupLabel: undefined,
        },
        user_created_WEEK: {
            fieldType: FieldType.DIMENSION,
            description: undefined,
            type: DimensionType.DATE,
            sql: "DATE_TRUNC('WEEK', TO_TIMESTAMP_NTZ(CONVERT_TIMEZONE('UTC', ${TABLE}.user_created)))",
            name: 'user_created_week',

            table: MODEL_WITH_DEFAULT_TIME_INTERVAL_DIMENSIONS.name,
            tableLabel: 'My table',

            label: 'User created week',

            source: undefined,
            group: 'user_created',
            timeInterval: TimeFrames.WEEK,
            hidden: false,
            format: undefined,
            round: undefined,
            compact: undefined,
            groupLabel: undefined,
        },
        user_created_MONTH: {
            fieldType: FieldType.DIMENSION,
            description: undefined,
            type: DimensionType.DATE,
            sql: "DATE_TRUNC('MONTH', TO_TIMESTAMP_NTZ(CONVERT_TIMEZONE('UTC', ${TABLE}.user_created)))",
            name: 'user_created_month',

            table: MODEL_WITH_DEFAULT_TIME_INTERVAL_DIMENSIONS.name,
            tableLabel: 'My table',

            label: 'User created month',

            source: undefined,
            group: 'user_created',
            timeInterval: TimeFrames.MONTH,
            hidden: false,
            format: undefined,
            round: undefined,
            compact: undefined,
            groupLabel: undefined,
        },
        user_created_QUARTER: {
            description: undefined,
            fieldType: FieldType.DIMENSION,
            format: undefined,
            group: 'user_created',
            groupLabel: undefined,
            hidden: false,
            label: 'User created quarter',
            name: 'user_created_quarter',
            round: undefined,
            compact: undefined,
            source: undefined,
            sql: "DATE_TRUNC('QUARTER', TO_TIMESTAMP_NTZ(CONVERT_TIMEZONE('UTC', ${TABLE}.user_created)))",
            table: 'myTable',
            tableLabel: 'My table',
            timeInterval: TimeFrames.QUARTER,
            type: DimensionType.DATE,
        },
        user_created_YEAR: {
            fieldType: FieldType.DIMENSION,
            description: undefined,
            type: DimensionType.DATE,
            sql: "DATE_TRUNC('YEAR', TO_TIMESTAMP_NTZ(CONVERT_TIMEZONE('UTC', ${TABLE}.user_created)))",
            name: 'user_created_year',

            table: MODEL_WITH_DEFAULT_TIME_INTERVAL_DIMENSIONS.name,
            tableLabel: 'My table',

            label: 'User created year',
            source: undefined,
            group: 'user_created',
            timeInterval: TimeFrames.YEAR,
            hidden: false,
            format: undefined,
            round: undefined,
            compact: undefined,
            groupLabel: undefined,
        },
    },
    metrics: {},
};

export const MODEL_WITH_OFF_TIME_INTERVAL_DIMENSIONS: DbtModelNode & {
    relation_name: string;
} = {
    ...model,
    columns: COLUMN_WITH_OFF_TIME_INTERVALS,
};

export const LIGHTDASH_TABLE_WITH_OFF_TIME_INTERVAL_DIMENSIONS: Omit<
    Table,
    'lineageGraph'
> = {
    name: MODEL_WITH_OFF_TIME_INTERVAL_DIMENSIONS.name,
    label: 'My table',
    database: MODEL_WITH_OFF_TIME_INTERVAL_DIMENSIONS.database,
    schema: MODEL_WITH_OFF_TIME_INTERVAL_DIMENSIONS.schema,
    sqlTable: MODEL_WITH_OFF_TIME_INTERVAL_DIMENSIONS.relation_name,
    description: MODEL_WITH_OFF_TIME_INTERVAL_DIMENSIONS.description,
    dimensions: {
        user_created: {
            fieldType: FieldType.DIMENSION,
            description: undefined,
            type: DimensionType.TIMESTAMP,
            sql: '${TABLE}.user_created',
            name: 'user_created',
            label: 'User created',
            table: MODEL_WITH_OFF_TIME_INTERVAL_DIMENSIONS.name,
            tableLabel: 'My table',
            source: undefined,
            group: undefined,
            timeInterval: undefined,
            hidden: false,
            format: undefined,
            round: undefined,
            compact: undefined,
            groupLabel: undefined,
        },
    },
    metrics: {},
};

export const MODEL_WITH_CUSTOM_TIME_INTERVAL_DIMENSIONS: DbtModelNode & {
    relation_name: string;
} = {
    ...model,
    columns: COLUMN_WITH_CUSTOM_TIME_INTERVALS,
};

export const LIGHTDASH_TABLE_WITH_CUSTOM_TIME_INTERVAL_DIMENSIONS: Omit<
    Table,
    'lineageGraph'
> = {
    name: MODEL_WITH_CUSTOM_TIME_INTERVAL_DIMENSIONS.name,
    label: 'My table',
    database: MODEL_WITH_CUSTOM_TIME_INTERVAL_DIMENSIONS.database,
    schema: MODEL_WITH_CUSTOM_TIME_INTERVAL_DIMENSIONS.schema,
    sqlTable: MODEL_WITH_CUSTOM_TIME_INTERVAL_DIMENSIONS.relation_name,
    description: MODEL_WITH_CUSTOM_TIME_INTERVAL_DIMENSIONS.description,
    dimensions: {
        user_created: {
            fieldType: FieldType.DIMENSION,
            description: undefined,
            type: DimensionType.DATE,
            sql: '${TABLE}.user_created',
            name: 'user_created',
            label: 'User created',
            table: MODEL_WITH_CUSTOM_TIME_INTERVAL_DIMENSIONS.name,
            tableLabel: 'My table',
            source: undefined,
            group: undefined,
            timeInterval: undefined,
            hidden: false,
            format: undefined,
            round: undefined,
            compact: undefined,
            groupLabel: undefined,
        },
        user_created_YEAR: {
            fieldType: FieldType.DIMENSION,
            description: undefined,
            type: DimensionType.DATE,
            sql: 'DATE_TRUNC(${TABLE}.user_created, YEAR)',
            name: 'user_created_year',
            label: 'User created year',
            table: MODEL_WITH_CUSTOM_TIME_INTERVAL_DIMENSIONS.name,
            tableLabel: 'My table',
            source: undefined,
            group: 'user_created',
            timeInterval: TimeFrames.YEAR,
            hidden: false,
            format: undefined,
            round: undefined,
            compact: undefined,
            groupLabel: undefined,
        },
    },
    metrics: {},
};

export const warehouseSchema: WarehouseCatalog = {
    [model.database]: {
        [model.schema]: {
            [model.name]: {
                [column.name]: DimensionType.STRING,
            },
        },
    },
};

export const warehouseSchemaWithMissingTable: WarehouseCatalog = {
    [model.database]: {
        [model.schema]: {},
    },
};
export const warehouseSchemaWithMissingColumn: WarehouseCatalog = {
    [model.database]: {
        [model.schema]: {
            [model.name]: {},
        },
    },
};

export const warehouseSchemaWithUpperCaseColumn: WarehouseCatalog = {
    [model.database]: {
        [model.schema]: {
            [model.name]: {
                [column.name.toUpperCase()]: DimensionType.STRING,
            },
        },
    },
};

export const expectedModelWithType: DbtModelNode = {
    ...model,
    columns: {
        myColumnName: { ...column, data_type: DimensionType.STRING },
    },
};
