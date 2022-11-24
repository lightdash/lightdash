import { CreateTrinoCredentials, WarehouseTypes } from '@lightdash/common';
import { TrinoTypes } from './TrinoWarehouseClient';
import { config } from './WarehouseClient.mock';

// TODO rever parametros necessarios para essa função
export const credentials: CreateTrinoCredentials = {
    type: WarehouseTypes.TRINO,
    host: '',
    user: '',
    password: '',
    catalog: '',
    dbname: '',
    schema: '',
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
        data_type: TrinoTypes.VARCHAR,
    },
    {
        ...columnBase,
        column_name: 'myNumberColumn',
        data_type: TrinoTypes.REAL,
    },
    {
        ...columnBase,
        column_name: 'myDateColumn',
        data_type: TrinoTypes.DATE,
    },
    {
        ...columnBase,
        column_name: 'myTimestampColumn',
        data_type: TrinoTypes.TIMESTAMP,
    },
    {
        ...columnBase,
        column_name: 'myBooleanColumn',
        data_type: TrinoTypes.BOOLEAN,
    },
    {
        ...columnBase,
        column_name: 'myArrayColumn',
        data_type: TrinoTypes.ARRAY,
    },
    {
        ...columnBase,
        column_name: 'myObjectColumn',
        data_type: TrinoTypes.JSON,
    },
];

export const queryColumnsMock = [
    { name: 'myStringColumn', dataTypeID: 1043 },
    { name: 'myNumberColumn', dataTypeID: 1700 },
    { name: 'myBooleanColumn', dataTypeID: 16 },
    { name: 'myDateColumn', dataTypeID: 1082 },
    { name: 'myTimestampColumn', dataTypeID: 1114 },
    { name: 'myArrayColumn', dataTypeID: 3802 },
    { name: 'myObjectColumn', dataTypeID: 3802 },
];
