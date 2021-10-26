import { BigQueryDate, BigQueryTimestamp } from '@google-cloud/bigquery';
import {
    CreateBigqueryCredentials,
    DimensionType,
    WarehouseTypes,
} from 'common';
import { SchemaStructure, WarehouseSchema } from '../../types';
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

export const config: SchemaStructure = {
    myDatabase: {
        mySchema: {
            myTable: [
                'myStringColumn',
                'myNumberColumn',
                'myDateColumn',
                'myTimestampColumn',
                'myBooleanColumn',
            ],
        },
    },
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
            id: 'myTable',
            getMetadata: () => [metadata],
        },
        {
            id: 'tableNotInModel',
            getMetadata: () => [],
        },
    ],
];
export const getDatasetsResponse = [
    [{ id: 'mySchema', getTables: () => getTablesResponse }],
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

export const expectedWarehouseSchema: WarehouseSchema = {
    mySchema: {
        myTable: {
            myStringColumn: DimensionType.STRING,
            myNumberColumn: DimensionType.NUMBER,
            myDateColumn: DimensionType.DATE,
            myTimestampColumn: DimensionType.TIMESTAMP,
            myBooleanColumn: DimensionType.BOOLEAN,
        },
    },
};

export const expectedRow: Record<string, any> = {
    myStringColumn: 'string value',
    myNumberColumn: 100,
    myDateColumn: new Date('2021-03-10T00:00:00.000Z'),
    myTimestampColumn: new Date('1990-03-02T08:30:00.010Z'),
    myBooleanColumn: false,
};
