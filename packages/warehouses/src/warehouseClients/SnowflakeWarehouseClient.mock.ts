import {
    CreateSnowflakeCredentials,
    DimensionType,
    WarehouseTypes,
} from '@lightdash/common';
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
        column_name: 'MYSTRINGCOLUMN',
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
        column_name: 'MYNUMBERCOLUMN',
        data_type: JSON.stringify({
            type: SnowflakeTypes.FIXED,
            precision: 18,
            scale: 0,
            nullable: true,
        }),
    },
    {
        ...columnBase,
        column_name: 'MYDATECOLUMN',
        data_type: JSON.stringify({
            type: SnowflakeTypes.DATE,
            nullable: true,
        }),
    },
    {
        ...columnBase,
        column_name: 'MYTIMESTAMPCOLUMN',
        data_type: JSON.stringify({
            type: SnowflakeTypes.TIMESTAMP_NTZ,
            precision: 0,
            scale: 9,
            nullable: true,
        }),
    },
    {
        ...columnBase,
        column_name: 'MYBOOLEANCOLUMN',
        data_type: JSON.stringify({
            type: SnowflakeTypes.BOOLEAN,
            nullable: true,
        }),
    },
    {
        ...columnBase,
        column_name: 'MYARRAYCOLUMN',
        data_type: JSON.stringify({
            type: SnowflakeTypes.ARRAY,
            nullable: true,
        }),
    },
    {
        ...columnBase,
        column_name: 'MYOBJECTCOLUMN',
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
        column_name: 'COLUMNNOTINMODEL',
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
        column_name: 'COLUMNNOTINMODEL',
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
        column_name: 'COLUMNNOTINMODEL',
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
    new ColumnMock('MYSTRINGCOLUMN', 'string'),
    new ColumnMock('MYNUMBERCOLUMN', 'number'),
    new ColumnMock('MYBOOLEANCOLUMN', 'boolean'),
    new ColumnMock('MYDATECOLUMN', 'date'),
    new ColumnMock('MYTIMESTAMPCOLUMN', 'timestamp'),
    new ColumnMock('MYARRAYCOLUMN', 'array'),
    new ColumnMock('MYOBJECTCOLUMN', 'object'),
];

export const expectedWarehouseSchema = {
    myDatabase: {
        mySchema: {
            myTable: {
                MYSTRINGCOLUMN: DimensionType.STRING,
                MYNUMBERCOLUMN: DimensionType.NUMBER,
                MYDATECOLUMN: DimensionType.DATE,
                MYTIMESTAMPCOLUMN: DimensionType.TIMESTAMP,
                MYBOOLEANCOLUMN: DimensionType.BOOLEAN,
                MYARRAYCOLUMN: DimensionType.STRING,
                MYOBJECTCOLUMN: DimensionType.STRING,
            },
        },
    },
};

export const expectedFields: Record<string, any> = {
    MYSTRINGCOLUMN: { type: DimensionType.STRING },
    MYNUMBERCOLUMN: { type: DimensionType.NUMBER },
    MYDATECOLUMN: { type: DimensionType.DATE },
    MYTIMESTAMPCOLUMN: { type: DimensionType.TIMESTAMP },
    MYBOOLEANCOLUMN: { type: DimensionType.BOOLEAN },
    MYARRAYCOLUMN: { type: DimensionType.STRING },
    MYOBJECTCOLUMN: { type: DimensionType.STRING },
};

export const expectedRow: Record<string, any> = {
    MYSTRINGCOLUMN: 'string value',
    MYNUMBERCOLUMN: 100,
    MYDATECOLUMN: new Date('2021-03-10T00:00:00.000Z'),
    MYTIMESTAMPCOLUMN: new Date('1990-03-02T08:30:00.010Z'),
    MYBOOLEANCOLUMN: false,
    MYARRAYCOLUMN: '1,2,3',
    MYOBJECTCOLUMN: '[object Object]',
};
