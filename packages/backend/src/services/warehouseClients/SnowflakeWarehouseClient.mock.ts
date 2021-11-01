import { CreateSnowflakeCredentials, WarehouseTypes } from 'common';
import { config } from './WarehouseClient.mock';
import { SnowflakeTypes } from './SnowflakeWarehouseClient';

export const credentials: CreateSnowflakeCredentials = {
    type: WarehouseTypes.SNOWFLAKE,
    account: '',
    user: '',
    password: '',
    role: '',
    database: '',
    warehouse: '',
    schema: '',
    threads: 1,
    clientSessionKeepAlive: true,
};

const columnBase = {
    kind: 'COLUMN',
    database_name: config[0].database.toUpperCase(),
    schema_name: config[0].schema.toUpperCase(),
    table_name: config[0].table.toUpperCase(),
};

export const columns: Record<string, any>[] = [
    {
        ...columnBase,
        column_name: 'myStringColumn',
        data_type: JSON.stringify({
            type: SnowflakeTypes.TEXT,
            length: 16777216,
            byteLength: 16777216,
            nullable: true,
            fixed: false,
        }),
    },
    {
        ...columnBase,
        column_name: 'myNumberColumn',
        data_type: JSON.stringify({
            type: SnowflakeTypes.FIXED,
            precision: 18,
            scale: 0,
            nullable: true,
        }),
    },
    {
        ...columnBase,
        column_name: 'myDateColumn',
        data_type: JSON.stringify({
            type: SnowflakeTypes.DATE,
            nullable: true,
        }),
    },
    {
        ...columnBase,
        column_name: 'myTimestampColumn',
        data_type: JSON.stringify({
            type: SnowflakeTypes.TIMESTAMP_NTZ,
            precision: 0,
            scale: 9,
            nullable: true,
        }),
    },
    {
        ...columnBase,
        column_name: 'myBooleanColumn',
        data_type: JSON.stringify({
            type: SnowflakeTypes.BOOLEAN,
            nullable: true,
        }),
    },
    {
        ...columnBase,
        column_name: 'myArrayColumn',
        data_type: JSON.stringify({
            type: SnowflakeTypes.ARRAY,
            nullable: true,
        }),
    },
    {
        ...columnBase,
        column_name: 'myObjectColumn',
        data_type: JSON.stringify({
            type: SnowflakeTypes.OBJECT,
            nullable: true,
        }),
    },
    {
        kind: 'COLUMN',
        database_name: 'databaseNotInModel',
        schema_name: 'schemaNotInModel',
        table_name: 'tableNotInModel',
        column_name: 'columnNotInModel',
        data_type: JSON.stringify({
            type: SnowflakeTypes.BOOLEAN,
            nullable: true,
        }),
    },
    {
        kind: 'COLUMN',
        database_name: columnBase.database_name,
        schema_name: 'schemaNotInModel',
        table_name: 'tableNotInModel',
        column_name: 'columnNotInModel',
        data_type: JSON.stringify({
            type: SnowflakeTypes.BOOLEAN,
            nullable: true,
        }),
    },
    {
        kind: 'COLUMN',
        database_name: columnBase.database_name,
        schema_name: columnBase.schema_name,
        table_name: 'tableNotInModel',
        column_name: 'columnNotInModel',
        data_type: JSON.stringify({
            type: SnowflakeTypes.BOOLEAN,
            nullable: true,
        }),
    },
];
