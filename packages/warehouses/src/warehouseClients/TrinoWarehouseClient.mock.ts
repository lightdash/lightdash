import {
    CreateTrinoCredentials,
    DimensionType,
    WarehouseTypes,
} from '@lightdash/common';
import { SnowflakeTypes } from './SnowflakeWarehouseClient';
import { config } from './WarehouseClient.mock';

export const credentials: CreateTrinoCredentials = {
    type: WarehouseTypes.TRINO,
    host: '',
    user: '',
    password: '',
    port: 443,
    dbname: '',
    schema: '',
    http_scheme: '',
};

export const queryResponse = {
    columns: [
        {
            name: 'myStringColumn',
            type: 'varchar',
            typeSignature: { rawType: 'varchar' },
        },
        {
            name: 'myNumberColumn',
            type: 'integer',
            typeSignature: { rawType: 'integer' },
        },
        {
            name: 'myDateColumn',
            type: 'date',
            typeSignature: { rawType: 'date' },
        },
        {
            name: 'myTimestampColumn',
            type: 'timestamp',
            typeSignature: { rawType: 'timestamp' },
        },
        {
            name: 'myBooleanColumn',
            type: 'boolean',
            typeSignature: { rawType: 'boolean' },
        },
        {
            name: 'myArrayColumn',
            type: 'array',
            typeSignature: { rawType: 'array' },
        },
        {
            name: 'myObjectColumn',
            type: 'json',
            typeSignature: { rawType: 'json' },
        },
    ],
    data: [
        [
            'string value',
            100,
            new Date('2021-03-10T00:00:00.000Z'),
            new Date('1990-03-02T08:30:00.010Z'),
            false,
            '1,2,3',
            '[object Object]',
        ],
    ],
};

export const querySchemaResponse = {
    columns: [
        {
            name: 'table_catalog',
            type: 'varchar',
            typeSignature: { rawType: 'varchar' },
        },
        {
            name: 'table_schema',
            type: 'varchar',
            typeSignature: { rawType: 'varchar' },
        },
        {
            name: 'table_name',
            type: 'varchar',
            typeSignature: { rawType: 'varchar' },
        },
        {
            name: 'columns_name',
            type: 'varchar',
            typeSignature: { rawType: 'varchar' },
        },
        {
            name: 'data_type',
            type: 'varchar',
            typeSignature: { rawType: 'varchar' },
        },
    ],
    data: [
        ['myDatabase', 'mySchema', 'myTable', 'myStringColumn', 'varchar'],
        ['myDatabase', 'mySchema', 'myTable', 'myNumberColumn', 'integer'],
        ['myDatabase', 'mySchema', 'myTable', 'myDateColumn', 'date'],
        ['myDatabase', 'mySchema', 'myTable', 'myTimestampColumn', 'timestamp'],
        ['myDatabase', 'mySchema', 'myTable', 'myBooleanColumn', 'boolean'],
        ['myDatabase', 'mySchema', 'myTable', 'myArrayColumn', 'array'],
        ['myDatabase', 'mySchema', 'myTable', 'myObjectColumn', 'json'],
    ],
};
