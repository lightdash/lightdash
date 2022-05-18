import { CreatePostgresCredentials, WarehouseTypes } from '@lightdash/common';
import { PostgresTypes } from './PostgresWarehouseClient';
import { config } from './WarehouseClient.mock';

export const credentials: CreatePostgresCredentials = {
    type: WarehouseTypes.POSTGRES,
    host: '',
    user: '',
    password: '',
    dbname: '',
    schema: '',
    threads: 1,
    port: 5432,
};

const columnBase = {
    table_catalog: config[0].database,
    table_schema: config[0].schema,
    table_name: config[0].table,
};

export const columns: Record<string, any>[] = [
    {
        ...columnBase,
        column_name: 'myStringColumn',
        data_type: PostgresTypes.TEXT,
    },
    {
        ...columnBase,
        column_name: 'myNumberColumn',
        data_type: PostgresTypes.NUMERIC,
    },
    {
        ...columnBase,
        column_name: 'myDateColumn',
        data_type: PostgresTypes.DATE,
    },
    {
        ...columnBase,
        column_name: 'myTimestampColumn',
        data_type: PostgresTypes.TIMESTAMP,
    },
    {
        ...columnBase,
        column_name: 'myBooleanColumn',
        data_type: PostgresTypes.BOOLEAN,
    },
    {
        ...columnBase,
        column_name: 'myArrayColumn',
        data_type: PostgresTypes.JSONB,
    },
    {
        ...columnBase,
        column_name: 'myObjectColumn',
        data_type: PostgresTypes.JSON,
    },
];
