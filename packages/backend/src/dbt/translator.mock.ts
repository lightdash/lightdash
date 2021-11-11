import {
    DbtModelColumn,
    DbtModelNode,
    DimensionType,
    FieldType,
    MetricType,
    Table,
} from 'common';
import { WarehouseCatalog } from '../types';

const column: DbtModelColumn = {
    name: 'myColumnName',
    meta: {},
};

const COLUMN_WITH_METRIC: Record<string, DbtModelColumn> = {
    user_id: {
        name: 'user_id',
        data_type: DimensionType.STRING,
        meta: {
            metrics: {
                user_count: { type: MetricType.COUNT_DISTINCT },
            },
        },
    },
};

export const model: DbtModelNode = {
    unique_id: 'unique_id',
    resource_type: 'resource_type',
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
};

export const MODEL_WITH_METRIC: DbtModelNode = {
    ...model,
    description: 'my test table',
    columns: COLUMN_WITH_METRIC,
};

export const LIGHTDASH_TABLE_WITH_METRIC: Omit<Table, 'lineageGraph'> = {
    name: MODEL_WITH_METRIC.name,
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
            table: MODEL_WITH_METRIC.name,
            source: undefined,
        },
    },
    metrics: {
        user_count: {
            fieldType: FieldType.METRIC,
            type: MetricType.COUNT_DISTINCT,
            sql: '${TABLE}.user_id',
            name: 'user_count',
            table: MODEL_WITH_METRIC.name,
            description: 'Count distinct of User id',
            source: undefined,
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

export const expectedModelWithType: DbtModelNode = {
    ...model,
    columns: {
        myColumnName: { ...column, data_type: DimensionType.STRING },
    },
};
