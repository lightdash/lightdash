import {
    AnyType,
    CreateDuckdbCredentials,
    WarehouseTypes,
} from '@lightdash/common';
import { DuckdbTypes } from './DuckdbWarehouseClient';
import { config } from './WarehouseClient.mock';

export const credentials: CreateDuckdbCredentials = {
    type: WarehouseTypes.DUCKDB,
    path: ':memory:',
    schema: 'main',
};

const columnBase = {
    table_catalog: config[0].database,
    table_schema: config[0].schema,
    table_name: config[0].table,
};

export const columns: Record<string, AnyType>[] = [
    {
        ...columnBase,
        column_name: 'myStringColumn',
        data_type: DuckdbTypes.VARCHAR,
    },
    {
        ...columnBase,
        column_name: 'myNumberColumn',
        data_type: DuckdbTypes.DOUBLE,
    },
    {
        ...columnBase,
        column_name: 'myDateColumn',
        data_type: DuckdbTypes.DATE,
    },
    {
        ...columnBase,
        column_name: 'myTimestampColumn',
        data_type: DuckdbTypes.TIMESTAMP,
    },
    {
        ...columnBase,
        column_name: 'myBooleanColumn',
        data_type: DuckdbTypes.BOOLEAN,
    },
    {
        ...columnBase,
        column_name: 'myArrayColumn',
        data_type: DuckdbTypes.JSON,
    },
    {
        ...columnBase,
        column_name: 'myObjectColumn',
        data_type: DuckdbTypes.JSON,
    },
];

export const expectedRow: Record<string, AnyType> = {
    myStringColumn: 'string value',
    myNumberColumn: 100,
    myDateColumn: new Date('2021-03-10T00:00:00.000Z'),
    myTimestampColumn: new Date('1990-03-02T08:30:00.010Z'),
    myBooleanColumn: false,
    myArrayColumn: '[1,2,3]',
    myObjectColumn: '{"key": "value"}',
};
