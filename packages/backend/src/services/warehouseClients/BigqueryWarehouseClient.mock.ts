import { BigQueryDate, BigQueryTimestamp } from '@google-cloud/bigquery';
import {
    CreateBigqueryCredentials,
    DimensionType,
    WarehouseTypes,
} from 'common';
import { WarehouseCatalog } from '../../types';
import { BigqueryFieldType } from './BigqueryWarehouseClient';

export const credentials: CreateBigqueryCredentials = {
    type: WarehouseTypes.BIGQUERY,
    project: '',
    dataset: '',
    threads: 0,
    timeoutSeconds: 0,
    priority: 'interactive',
    keyfileContents: {},
    retries: 0,
    location: '',
    maximumBytesBilled: 0,
};

export const config: { database: string; schema: string; table: string }[] = [
    {
        database: 'myDatabase',
        schema: 'mySchema',
        table: 'myTable',
    },
];

const metadata = {
    schema: {
        fields: [
            {
                name: 'myStringColumn',
                type: BigqueryFieldType.STRING,
            },
            {
                name: 'myNumberColumn',
                type: BigqueryFieldType.NUMERIC,
            },
            {
                name: 'myDateColumn',
                type: BigqueryFieldType.DATE,
            },
            {
                name: 'myTimestampColumn',
                type: BigqueryFieldType.TIMESTAMP,
            },
            {
                name: 'myBooleanColumn',
                type: BigqueryFieldType.BOOLEAN,
            },
            {
                name: 'myArrayColumn',
                type: BigqueryFieldType.ARRAY,
            },
            {
                name: 'myObjectColumn',
                type: BigqueryFieldType.STRUCT,
            },
        ],
    },
};

export const getTableResponse = {
    getMetadata: jest.fn(() => [metadata]),
};
export const getDatasetResponse = {
    id: 'mySchema',
    bigQuery: { projectId: 'myDatabase' },
    table: jest.fn(() => getTableResponse),
};

const rows: Record<string, any>[] = [
    {
        myStringColumn: 'string value',
        myNumberColumn: 100,
        myDateColumn: new BigQueryDate('2021-03-10'),
        myTimestampColumn: new BigQueryTimestamp(
            '1990-03-02 08:30:00.010000000000',
        ),
        myBooleanColumn: false,
        myArrayColumn: ['1', '2', '3'],
        myObjectColumn: { test: '1' },
    },
];

export const createJobResponse = [
    {
        getQueryResults: jest.fn(() => [rows, undefined, metadata]),
    },
];

export const expectedWarehouseSchema: WarehouseCatalog = {
    myDatabase: {
        mySchema: {
            myTable: {
                myStringColumn: DimensionType.STRING,
                myNumberColumn: DimensionType.NUMBER,
                myDateColumn: DimensionType.DATE,
                myTimestampColumn: DimensionType.TIMESTAMP,
                myBooleanColumn: DimensionType.BOOLEAN,
                myArrayColumn: DimensionType.STRING,
                myObjectColumn: DimensionType.STRING,
            },
        },
    },
};

export const expectedRow: Record<string, any> = {
    myStringColumn: 'string value',
    myNumberColumn: 100,
    myDateColumn: new Date('2021-03-10T00:00:00.000Z'),
    myTimestampColumn: new Date('1990-03-02T08:30:00.010Z'),
    myBooleanColumn: false,
    myArrayColumn: '1,2,3',
    myObjectColumn: '[object Object]',
};
