import {
    type DbtMetric,
    type DbtModelColumn,
    type DbtModelNode,
    type V9MetricRef,
} from '../types/dbt';
import { type Table } from '../types/explore';
import { DimensionType, FieldType, MetricType } from '../types/field';
import { OrderFieldsByStrategy } from '../types/table';
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
    expression: 'dbt_metric_11 / dbt_metric_1',
    refs: [],
    metrics: [['dbt_metric_11'], ['dbt_metric_1']], // one per each reference
};

export const DBT_V9_METRIC: DbtMetric & { refs: V9MetricRef[] } = {
    ...DBT_METRIC,
    refs: [{ name: 'myTable' }],
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

const COLUMN_WITH_OFF_BOOLEAN_TIME_INTERVALS: Record<string, DbtModelColumn> = {
    user_created: {
        name: 'user_created',
        data_type: DimensionType.TIMESTAMP,
        meta: {
            dimension: {
                time_intervals: false,
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
    alias: 'myTable',
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
    patch_path: null,
    original_file_path: '',
};

export const BASE_LIGHTDASH_TABLE: Omit<Table, 'lineageGraph'> = {
    name: model.name,
    label: 'My table',
    database: model.database,
    schema: model.schema,
    sqlTable: model.relation_name,
    description: model.description,
    sqlWhere: undefined,
    requiredAttributes: undefined,
    dimensions: {
        myColumnName: {
            compact: undefined,
            description: undefined,
            fieldType: FieldType.DIMENSION,
            requiredAttributes: undefined,
            format: undefined,
            groups: [],
            colors: undefined,
            hidden: false,
            index: 0,
            label: 'My column name',
            name: 'myColumnName',
            round: undefined,
            source: undefined,
            sql: '${TABLE}.myColumnName',
            table: 'myTable',
            tableLabel: 'My table',
            timeInterval: undefined,
            type: DimensionType.STRING,
        },
    },
    metrics: {},
    orderFieldsBy: OrderFieldsByStrategy.LABEL,
    groupLabel: undefined,
};

export const MODEL_WITH_GROUP_LABEL: DbtModelNode & { relation_name: string } =
    {
        ...model,
        meta: {
            group_label: 'revenue',
        },
    };

export const MODEL_WITH_GROUPS_BLOCK: DbtModelNode & { relation_name: string } =
    {
        ...model,
        meta: {
            groups: {
                revenue: {
                    label: 'Revenue',
                    description: 'Revenue description',
                },
            },
        },
        columns: {
            user_id: {
                name: 'user_id',
                data_type: DimensionType.STRING,
                meta: {
                    metrics: {
                        user_id_count: {
                            type: MetricType.COUNT_DISTINCT,
                            group: ['revenue'],
                        },
                    },
                },
            },
        },
    };

export const MODEL_WITH_BAD_METRIC_GROUPS: DbtModelNode & {
    relation_name: string;
} = {
    ...model,
    meta: {
        groups: {
            revenue: {
                label: 'Revenue',
                description: 'Revenue description',
            },
        },
    },
    columns: {
        user_id: {
            name: 'user_id',
            data_type: DimensionType.STRING,
            meta: {
                metrics: {
                    user_id_count: {
                        type: MetricType.COUNT_DISTINCT,
                        group: ['non_existent'],
                    },
                },
            },
        },
    },
};

export const LIGHTDASH_TABLE_WITH_GROUP_LABEL: Omit<Table, 'lineageGraph'> = {
    ...BASE_LIGHTDASH_TABLE,
    groupLabel: 'revenue',
};

export const LIGHTDASH_TABLE_WITH_GROUP_BLOCK: Omit<Table, 'lineageGraph'> = {
    ...BASE_LIGHTDASH_TABLE,
    dimensions: {
        user_id: {
            compact: undefined,
            description: undefined,
            fieldType: FieldType.DIMENSION,
            requiredAttributes: undefined,
            format: undefined,
            groups: [],
            colors: undefined,
            hidden: false,
            index: 0,
            label: 'User id',
            name: 'user_id',
            round: undefined,
            source: undefined,
            sql: '${TABLE}.user_id',
            table: 'myTable',
            tableLabel: 'My table',
            timeInterval: undefined,
            type: DimensionType.STRING,
        },
    },
    metrics: {
        user_id_count: {
            compact: undefined,
            description: 'Count distinct of User id',
            dimensionReference: 'myTable_user_id',
            fieldType: FieldType.METRIC,
            filters: [],
            format: undefined,
            groups: [
                {
                    description: 'Revenue description',
                    label: 'Revenue',
                },
            ],
            hidden: false,
            index: 0,
            isAutoGenerated: false,
            label: 'User id count',
            name: 'user_id_count',
            percentile: undefined,
            requiredAttributes: undefined,
            round: undefined,
            showUnderlyingValues: undefined,
            source: undefined,
            sql: '${TABLE}.user_id',
            table: 'myTable',
            tableLabel: 'My table',
            type: MetricType.COUNT_DISTINCT,
        },
    },
};

export const MODEL_WITH_SQL_WHERE: DbtModelNode & {
    relation_name: string;
} = {
    ...model,
    meta: {
        sql_where: '${payment_method} IS NOT NULL',
    },
};

export const MODEL_WITH_SQL_FILTER: DbtModelNode & {
    relation_name: string;
} = {
    ...model,
    meta: {
        sql_filter: '${payment_method} IS NOT NULL',
    },
};
export const MODEL_WITH_NO_METRICS: DbtModelNode & { relation_name: string } = {
    ...model,
    columns: {
        [ID_COLUMN_WITHOUT_METRICS.name]: ID_COLUMN_WITHOUT_METRICS,
    },
};

export const LIGHTDASH_TABLE_WITHOUT_AUTO_METRICS: Omit<Table, 'lineageGraph'> =
    {
        ...BASE_LIGHTDASH_TABLE,
        dimensions: {
            user_id: {
                fieldType: FieldType.DIMENSION,
                requiredAttributes: undefined,
                description: undefined,
                type: DimensionType.STRING,
                sql: '${TABLE}.user_id',
                name: 'user_id',
                label: 'User id',
                table: MODEL_WITH_NO_METRICS.name,
                tableLabel: 'My table',
                source: undefined,
                timeInterval: undefined,
                hidden: false,
                format: undefined,
                round: undefined,
                compact: undefined,
                groups: [],
                colors: undefined,
                index: 0,
            },
        },
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
            percentile: undefined,
            compact: undefined,
            showUnderlyingValues: undefined,
            source: undefined,
            groups: [],
            filters: [],
            index: 0,
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
            percentile: undefined,
            compact: undefined,
            showUnderlyingValues: undefined,
            source: undefined,
            groups: [],
            filters: [],
            index: 1,
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
            percentile: undefined,
            compact: undefined,
            showUnderlyingValues: undefined,
            source: undefined,
            groups: [],
            filters: [],
            index: 2,
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
            percentile: undefined,
            compact: undefined,
            showUnderlyingValues: undefined,
            source: undefined,
            groups: [],
            filters: [],
            index: 3,
        },
        dbt_metric_5: {
            description: 'Description',
            fieldType: FieldType.METRIC,
            hidden: false,
            isAutoGenerated: false,
            label: 'Label',
            name: 'dbt_metric_5',
            sql: '${dbt_metric_11} / ${dbt_metric_1}',
            table: 'myTable',
            tableLabel: 'My table',
            type: MetricType.NUMBER,
            format: undefined,
            round: undefined,
            percentile: undefined,
            compact: undefined,
            showUnderlyingValues: undefined,
            source: undefined,
            groups: [],
            filters: [],
            index: 4,
        },
    },
};

export const LIGHTDASH_TABLE_WITH_DBT_V9_METRICS: Omit<Table, 'lineageGraph'> =
    {
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
                percentile: undefined,
                compact: undefined,
                showUnderlyingValues: undefined,
                source: undefined,
                groups: [],
                filters: [],
                index: 0,
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
    ...BASE_LIGHTDASH_TABLE,
    description: MODEL_WITH_METRIC.description,
    dimensions: {
        user_id: {
            fieldType: FieldType.DIMENSION,
            requiredAttributes: undefined,
            description: undefined,
            type: DimensionType.STRING,
            sql: '${TABLE}.user_id',
            name: 'user_id',
            label: 'User id',
            table: MODEL_WITH_METRIC.name,
            tableLabel: 'My table',
            source: undefined,
            timeInterval: undefined,
            hidden: false,
            format: undefined,
            round: undefined,
            compact: undefined,
            groups: [],
            colors: undefined,
            index: 0,
        },
        num_participating_athletes: {
            fieldType: FieldType.DIMENSION,
            requiredAttributes: undefined,
            description: undefined,
            type: DimensionType.NUMBER,
            sql: 'num_participating_men + num_participating_women',
            name: 'num_participating_athletes',
            label: 'Num participating athletes',
            table: MODEL_WITH_METRIC.name,
            tableLabel: 'My table',
            source: undefined,
            timeInterval: undefined,
            hidden: false,
            format: undefined,
            round: undefined,
            compact: undefined,
            groups: [],
            colors: undefined,

            index: 1,
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
            percentile: undefined,
            compact: undefined,
            showUnderlyingValues: undefined,
            groups: [],
            filters: [],
            index: 0,
            dimensionReference: 'myTable_user_id',
            requiredAttributes: undefined,
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
            percentile: undefined,
            compact: undefined,
            showUnderlyingValues: undefined,
            groups: [],
            filters: [],
            index: 1,
            dimensionReference: 'myTable_num_participating_athletes',
            requiredAttributes: undefined,
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
    ...BASE_LIGHTDASH_TABLE,
    dimensions: {
        user_created: {
            fieldType: FieldType.DIMENSION,
            requiredAttributes: undefined,
            description: undefined,
            type: DimensionType.TIMESTAMP,
            sql: '${TABLE}.user_created',
            name: 'user_created',
            label: 'User created',
            table: MODEL_WITH_DEFAULT_TIME_INTERVAL_DIMENSIONS.name,
            tableLabel: 'My table',
            source: undefined,
            timeInterval: undefined,
            hidden: false,
            format: undefined,
            round: undefined,
            compact: undefined,
            groups: [],
            colors: undefined,
            index: 0,
        },
        user_created_raw: {
            fieldType: FieldType.DIMENSION,
            requiredAttributes: undefined,
            description: undefined,
            type: DimensionType.TIMESTAMP,
            sql: '${TABLE}.user_created',
            name: 'user_created_raw',
            label: 'User created raw',
            table: MODEL_WITH_DEFAULT_TIME_INTERVAL_DIMENSIONS.name,
            tableLabel: 'My table',
            source: undefined,
            timeInterval: TimeFrames.RAW,
            hidden: false,
            format: undefined,
            round: undefined,
            compact: undefined,
            groups: [{ label: 'user_created' }],
            colors: undefined,
            index: 0,
        },
        user_created_day: {
            fieldType: FieldType.DIMENSION,
            requiredAttributes: undefined,
            description: undefined,
            type: DimensionType.DATE,
            sql: 'TIMESTAMP_TRUNC(${TABLE}.user_created, DAY)',
            name: 'user_created_day',
            label: 'User created day',
            table: MODEL_WITH_DEFAULT_TIME_INTERVAL_DIMENSIONS.name,
            tableLabel: 'My table',
            source: undefined,
            timeInterval: TimeFrames.DAY,
            hidden: false,
            format: undefined,
            round: undefined,
            compact: undefined,
            groups: [{ label: 'user_created' }],
            colors: undefined,
            index: 0,
        },
        user_created_week: {
            fieldType: FieldType.DIMENSION,
            requiredAttributes: undefined,
            description: undefined,
            type: DimensionType.DATE,
            sql: 'TIMESTAMP_TRUNC(${TABLE}.user_created, WEEK)',

            name: 'user_created_week',
            label: 'User created week',
            table: MODEL_WITH_DEFAULT_TIME_INTERVAL_DIMENSIONS.name,
            tableLabel: 'My table',
            source: undefined,
            timeInterval: TimeFrames.WEEK,
            hidden: false,
            format: undefined,
            round: undefined,
            compact: undefined,
            groups: [{ label: 'user_created' }],
            colors: undefined,
            index: 0,
        },
        user_created_month: {
            fieldType: FieldType.DIMENSION,
            requiredAttributes: undefined,
            description: undefined,
            type: DimensionType.DATE,
            sql: 'TIMESTAMP_TRUNC(${TABLE}.user_created, MONTH)',

            name: 'user_created_month',
            label: 'User created month',
            table: MODEL_WITH_DEFAULT_TIME_INTERVAL_DIMENSIONS.name,
            tableLabel: 'My table',
            source: undefined,
            timeInterval: TimeFrames.MONTH,
            hidden: false,
            format: undefined,
            round: undefined,
            compact: undefined,
            groups: [{ label: 'user_created' }],
            colors: undefined,

            index: 0,
        },
        user_created_quarter: {
            description: undefined,
            fieldType: FieldType.DIMENSION,
            requiredAttributes: undefined,
            format: undefined,
            groups: [{ label: 'user_created' }],
            colors: undefined,
            hidden: false,
            label: 'User created quarter',
            name: 'user_created_quarter',
            round: undefined,
            compact: undefined,
            source: undefined,
            sql: 'TIMESTAMP_TRUNC(${TABLE}.user_created, QUARTER)',
            table: 'myTable',
            tableLabel: 'My table',
            timeInterval: TimeFrames.QUARTER,
            type: DimensionType.DATE,
            index: 0,
        },
        user_created_year: {
            fieldType: FieldType.DIMENSION,
            requiredAttributes: undefined,
            description: undefined,
            type: DimensionType.DATE,
            sql: 'TIMESTAMP_TRUNC(${TABLE}.user_created, YEAR)',

            name: 'user_created_year',
            label: 'User created year',
            table: MODEL_WITH_DEFAULT_TIME_INTERVAL_DIMENSIONS.name,
            tableLabel: 'My table',
            source: undefined,
            timeInterval: TimeFrames.YEAR,
            hidden: false,
            format: undefined,
            round: undefined,
            compact: undefined,
            groups: [{ label: 'user_created' }],
            colors: undefined,
            index: 0,
        },
    },
};

export const LIGHTDASH_TABLE_WITH_DEFAULT_TIME_INTERVAL_DIMENSIONS_SNOWFLAKE: Omit<
    Table,
    'lineageGraph'
> = {
    ...BASE_LIGHTDASH_TABLE,
    dimensions: {
        user_created: {
            fieldType: FieldType.DIMENSION,
            requiredAttributes: undefined,
            description: undefined,
            type: DimensionType.TIMESTAMP,
            sql: "TO_TIMESTAMP_NTZ(CONVERT_TIMEZONE('UTC', ${TABLE}.user_created))",
            name: 'user_created',
            table: MODEL_WITH_DEFAULT_TIME_INTERVAL_DIMENSIONS.name,
            tableLabel: 'My table',
            label: 'User created',
            source: undefined,
            timeInterval: undefined,
            hidden: false,
            format: undefined,
            round: undefined,
            compact: undefined,
            groups: [],
            colors: undefined,
            index: 0,
        },
        user_created_raw: {
            fieldType: FieldType.DIMENSION,
            requiredAttributes: undefined,
            description: undefined,
            type: DimensionType.TIMESTAMP,
            sql: "TO_TIMESTAMP_NTZ(CONVERT_TIMEZONE('UTC', ${TABLE}.user_created))",
            name: 'user_created_raw',
            table: MODEL_WITH_DEFAULT_TIME_INTERVAL_DIMENSIONS.name,
            tableLabel: 'My table',
            label: 'User created raw',
            source: undefined,
            timeInterval: TimeFrames.RAW,
            hidden: false,
            format: undefined,
            round: undefined,
            compact: undefined,
            groups: [{ label: 'user_created' }],
            colors: undefined,
            index: 0,
        },
        user_created_day: {
            fieldType: FieldType.DIMENSION,
            requiredAttributes: undefined,
            description: undefined,
            type: DimensionType.DATE,
            sql: "DATE_TRUNC('DAY', TO_TIMESTAMP_NTZ(CONVERT_TIMEZONE('UTC', ${TABLE}.user_created)))",

            name: 'user_created_day',
            table: MODEL_WITH_DEFAULT_TIME_INTERVAL_DIMENSIONS.name,
            tableLabel: 'My table',

            label: 'User created day',

            source: undefined,
            timeInterval: TimeFrames.DAY,
            hidden: false,
            format: undefined,
            round: undefined,
            compact: undefined,
            groups: [{ label: 'user_created' }],
            colors: undefined,
            index: 0,
        },
        user_created_week: {
            fieldType: FieldType.DIMENSION,
            requiredAttributes: undefined,
            description: undefined,
            type: DimensionType.DATE,
            sql: "DATE_TRUNC('WEEK', TO_TIMESTAMP_NTZ(CONVERT_TIMEZONE('UTC', ${TABLE}.user_created)))",
            name: 'user_created_week',
            table: MODEL_WITH_DEFAULT_TIME_INTERVAL_DIMENSIONS.name,
            tableLabel: 'My table',
            label: 'User created week',
            source: undefined,
            timeInterval: TimeFrames.WEEK,
            hidden: false,
            format: undefined,
            round: undefined,
            compact: undefined,
            groups: [{ label: 'user_created' }],
            colors: undefined,
            index: 0,
        },
        user_created_month: {
            fieldType: FieldType.DIMENSION,
            requiredAttributes: undefined,
            description: undefined,
            type: DimensionType.DATE,
            sql: "DATE_TRUNC('MONTH', TO_TIMESTAMP_NTZ(CONVERT_TIMEZONE('UTC', ${TABLE}.user_created)))",
            name: 'user_created_month',
            table: MODEL_WITH_DEFAULT_TIME_INTERVAL_DIMENSIONS.name,
            tableLabel: 'My table',
            label: 'User created month',
            source: undefined,
            timeInterval: TimeFrames.MONTH,
            hidden: false,
            format: undefined,
            round: undefined,
            compact: undefined,
            groups: [{ label: 'user_created' }],
            colors: undefined,
            index: 0,
        },
        user_created_quarter: {
            description: undefined,
            fieldType: FieldType.DIMENSION,
            requiredAttributes: undefined,
            format: undefined,
            groups: [{ label: 'user_created' }],
            colors: undefined,
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
            index: 0,
        },
        user_created_year: {
            fieldType: FieldType.DIMENSION,
            requiredAttributes: undefined,
            description: undefined,
            type: DimensionType.DATE,
            sql: "DATE_TRUNC('YEAR', TO_TIMESTAMP_NTZ(CONVERT_TIMEZONE('UTC', ${TABLE}.user_created)))",
            name: 'user_created_year',
            table: MODEL_WITH_DEFAULT_TIME_INTERVAL_DIMENSIONS.name,
            tableLabel: 'My table',
            label: 'User created year',
            source: undefined,
            timeInterval: TimeFrames.YEAR,
            hidden: false,
            format: undefined,
            round: undefined,
            compact: undefined,
            groups: [{ label: 'user_created' }],
            colors: undefined,
            index: 0,
        },
    },
};

export const MODEL_WITH_OFF_TIME_INTERVAL_DIMENSIONS: DbtModelNode & {
    relation_name: string;
} = {
    ...model,
    columns: COLUMN_WITH_OFF_TIME_INTERVALS,
};

export const MODEL_WITH_OFF_BOOLEAN_TIME_INTERVAL_DIMENSIONS: DbtModelNode & {
    relation_name: string;
} = {
    ...model,
    columns: COLUMN_WITH_OFF_BOOLEAN_TIME_INTERVALS,
};
export const LIGHTDASH_TABLE_WITH_OFF_TIME_INTERVAL_DIMENSIONS: Omit<
    Table,
    'lineageGraph'
> = {
    ...BASE_LIGHTDASH_TABLE,
    dimensions: {
        user_created: {
            fieldType: FieldType.DIMENSION,
            requiredAttributes: undefined,
            description: undefined,
            type: DimensionType.TIMESTAMP,
            sql: '${TABLE}.user_created',
            name: 'user_created',
            label: 'User created',
            table: MODEL_WITH_OFF_TIME_INTERVAL_DIMENSIONS.name,
            tableLabel: 'My table',
            source: undefined,
            timeInterval: undefined,
            hidden: false,
            format: undefined,
            round: undefined,
            compact: undefined,
            groups: [],
            colors: undefined,
            index: 0,
        },
    },
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
    ...BASE_LIGHTDASH_TABLE,
    dimensions: {
        user_created: {
            fieldType: FieldType.DIMENSION,
            requiredAttributes: undefined,
            description: undefined,
            type: DimensionType.DATE,
            sql: '${TABLE}.user_created',
            name: 'user_created',
            label: 'User created',
            table: MODEL_WITH_CUSTOM_TIME_INTERVAL_DIMENSIONS.name,
            tableLabel: 'My table',
            source: undefined,
            timeInterval: undefined,
            hidden: false,
            format: undefined,
            round: undefined,
            compact: undefined,
            groups: [],
            colors: undefined,
            index: 0,
        },
        user_created_year: {
            fieldType: FieldType.DIMENSION,
            requiredAttributes: undefined,
            description: undefined,
            type: DimensionType.DATE,
            sql: 'DATE_TRUNC(${TABLE}.user_created, YEAR)',
            name: 'user_created_year',
            label: 'User created year',
            table: MODEL_WITH_CUSTOM_TIME_INTERVAL_DIMENSIONS.name,
            tableLabel: 'My table',
            source: undefined,
            timeInterval: TimeFrames.YEAR,
            hidden: false,
            format: undefined,
            round: undefined,
            compact: undefined,
            groups: [{ label: 'user_created' }],
            colors: undefined,
            index: 0,
        },
    },
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

export const LIGHTDASH_TABLE_SQL_WHERE: Omit<Table, 'lineageGraph'> = {
    ...BASE_LIGHTDASH_TABLE,
    sqlWhere: '${payment_method} IS NOT NULL',
};

export const MODEL_WITH_ADDITIONAL_DIMENSIONS: DbtModelNode & {
    relation_name: string;
} = {
    ...model,
    columns: {
        metadata: {
            name: 'metadata',
            data_type: DimensionType.STRING,
            meta: {
                dimension: {
                    hidden: true,
                },
                additional_dimensions: {
                    version: {
                        type: DimensionType.NUMBER,
                        sql: "${metadata}-->'version'",
                    },
                    created_at: {
                        type: DimensionType.TIMESTAMP,
                        sql: "${metadata}-->'created_at'",
                    },
                },
            },
        },
    },
};

export const LIGHTDASH_TABLE_WITH_ADDITIONAL_DIMENSIONS: Omit<
    Table,
    'lineageGraph'
> = {
    ...BASE_LIGHTDASH_TABLE,
    dimensions: {
        metadata: {
            fieldType: FieldType.DIMENSION,
            requiredAttributes: undefined,
            description: undefined,
            type: DimensionType.STRING,
            sql: '${TABLE}.metadata',
            name: 'metadata',
            label: 'Metadata',
            table: BASE_LIGHTDASH_TABLE.name,
            tableLabel: 'My table',
            source: undefined,
            timeInterval: undefined,
            hidden: true,
            format: undefined,
            round: undefined,
            compact: undefined,
            groups: [],
            colors: undefined,
            index: 0,
        },
        version: {
            fieldType: FieldType.DIMENSION,
            requiredAttributes: undefined,
            description: undefined,
            type: DimensionType.NUMBER,
            sql: "${metadata}-->'version'",
            name: 'version',
            label: 'Version',
            table: BASE_LIGHTDASH_TABLE.name,
            tableLabel: 'My table',
            source: undefined,
            timeInterval: undefined,
            hidden: false,
            format: undefined,
            round: undefined,
            compact: undefined,
            groups: [],
            colors: undefined,
            index: 0,
            isAdditionalDimension: true,
        },
        created_at: {
            fieldType: FieldType.DIMENSION,
            requiredAttributes: undefined,
            description: undefined,
            type: DimensionType.TIMESTAMP,
            sql: "${metadata}-->'created_at'",
            name: 'created_at',
            label: 'Created at',
            table: BASE_LIGHTDASH_TABLE.name,
            tableLabel: 'My table',
            source: undefined,
            timeInterval: undefined,
            hidden: false,
            format: undefined,
            round: undefined,
            compact: undefined,
            groups: [],
            colors: undefined,
            index: 0,
            isAdditionalDimension: true,
        },
    },
};
