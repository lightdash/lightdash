import { BigQueryDate, BigQueryTimestamp } from '@google-cloud/bigquery';
import { CreateBigqueryCredentials, WarehouseTypes } from '@lightdash/common';
import { BigqueryFieldType } from './BigqueryWarehouseClient';

export const credentials: CreateBigqueryCredentials = {
    type: WarehouseTypes.BIGQUERY,
    project: '',
    dataset: '',
    timeoutSeconds: 0,
    priority: 'interactive',
    keyfileContents: {},
    retries: 0,
    location: '',
    maximumBytesBilled: 0,
};

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
        myTimestampColumn: new BigQueryTimestamp('1990-03-02T08:30:00.010Z'),
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
