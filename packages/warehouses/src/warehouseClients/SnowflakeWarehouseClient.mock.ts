import { CreateSnowflakeCredentials, WarehouseTypes } from '@lightdash/common';
import { SnowflakeTypes } from './SnowflakeWarehouseClient';
import { config } from './WarehouseClient.mock';

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

class ColumnMock {
    private readonly name: string;

    private readonly type: string;

    constructor(name: string, type: string) {
        this.name = name;
        this.type = type;
    }

    getName() {
        return this.name;
    }

    getType() {
        return this.type;
    }
}

export const queryColumnsMock = [
    new ColumnMock('myStringColumn', 'string'),
    new ColumnMock('myNumberColumn', 'number'),
    new ColumnMock('myBooleanColumn', 'boolean'),
    new ColumnMock('myDateColumn', 'date'),
    new ColumnMock('myTimestampColumn', 'timestamp'),
    new ColumnMock('myArrayColumn', 'array'),
    new ColumnMock('myObjectColumn', 'object'),
];
