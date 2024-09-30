import { TTypeId as DatabricksDataTypes } from '@databricks/sql/thrift/TCLIService_types';
import { CreateDatabricksCredentials, WarehouseTypes } from '@lightdash/common';

export const credentials: CreateDatabricksCredentials = {
    type: WarehouseTypes.DATABRICKS,
    database: 'database',
    serverHostName: 'serverHostName',
    httpPath: 'httpPath',
    personalAccessToken: 'personalAccessToken',
};

export const schema = {
    columns: [
        {
            columnName: 'myStringColumn',
            typeDesc: {
                types: [
                    {
                        primitiveEntry: {
                            type: DatabricksDataTypes.STRING_TYPE,
                        },
                    },
                ],
            },
        },
        {
            columnName: 'myNumberColumn',
            typeDesc: {
                types: [
                    {
                        primitiveEntry: {
                            type: DatabricksDataTypes.INT_TYPE,
                        },
                    },
                ],
            },
        },
        {
            columnName: 'myDateColumn',
            typeDesc: {
                types: [
                    {
                        primitiveEntry: {
                            type: DatabricksDataTypes.DATE_TYPE,
                        },
                    },
                ],
            },
        },
        {
            columnName: 'myTimestampColumn',
            typeDesc: {
                types: [
                    {
                        primitiveEntry: {
                            type: DatabricksDataTypes.TIMESTAMP_TYPE,
                        },
                    },
                ],
            },
        },
        {
            columnName: 'myBooleanColumn',
            typeDesc: {
                types: [
                    {
                        primitiveEntry: {
                            type: DatabricksDataTypes.BOOLEAN_TYPE,
                        },
                    },
                ],
            },
        },
        {
            columnName: 'myArrayColumn',
            typeDesc: {
                types: [
                    {
                        primitiveEntry: {
                            type: DatabricksDataTypes.ARRAY_TYPE,
                        },
                    },
                ],
            },
        },
        {
            columnName: 'myObjectColumn',
            typeDesc: {
                types: [
                    {
                        primitiveEntry: {
                            type: DatabricksDataTypes.STRUCT_TYPE,
                        },
                    },
                ],
            },
        },
    ],
};
export const rows: Record<string, any>[] = [
    {
        myStringColumn: 'string value',
        myNumberColumn: 100,
        myDateColumn: new Date('2021-03-10'),
        myTimestampColumn: new Date('1990-03-02T08:30:00.010Z'),
        myBooleanColumn: false,
        myArrayColumn: ['1', '2', '3'],
        myObjectColumn: { test: '1' },
    },
];
