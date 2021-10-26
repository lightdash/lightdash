import { BigQueryDate, BigQueryTimestamp } from '@google-cloud/bigquery';
import { CreateBigqueryCredentials, WarehouseTypes } from 'common';
import { BigqueryFieldType } from './BigqueryWarehouseClient';
import { model } from './WarehouseClient.mock';

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
                name: 'columnNotInModel',
                type: BigqueryFieldType.BOOLEAN,
            },
        ],
    },
};

const getTablesResponse = [
    [
        {
            id: model.name,
            getMetadata: () => [metadata],
        },
        {
            id: 'tableNotInModel',
            getMetadata: () => [],
        },
    ],
];
export const getDatasetsResponse = [
    [{ id: model.schema, getTables: () => getTablesResponse }],
    [{ id: 'datasetNotInModel', getTables: () => [] }],
];

const rows: Record<string, any>[] = [
    {
        myStringColumn: 'string value',
        myNumberColumn: 100,
        myDateColumn: new BigQueryDate('2021-03-10'),
        myTimestampColumn: new BigQueryTimestamp(
            '1990-03-02 08:30:00.010000000000',
        ),
        myBooleanColumn: false,
    },
];

export const createJobResponse = [
    {
        getQueryResults: () => [rows, undefined, metadata],
    },
];
