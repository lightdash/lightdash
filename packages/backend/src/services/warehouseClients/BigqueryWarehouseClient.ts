import { CreateBigqueryCredentials, DbtModelNode, DimensionType } from 'common';
import {
    BigQuery,
    BigQueryDate,
    BigQueryDatetime,
    BigQueryTime,
    BigQueryTimestamp,
} from '@google-cloud/bigquery';
import bigquery from '@google-cloud/bigquery/build/src/types';
import { WarehouseConnectionError, WarehouseQueryError } from '../../errors';
import {
    QueryRunner,
    WarehouseSchema,
    WarehouseTableSchema,
} from '../../types';
import { asyncForEach } from '../../utils';

export enum BigqueryFieldType {
    STRING = 'STRING',
    INTEGER = 'INTEGER',
    BYTES = 'BYTES',
    INT64 = 'INT64',
    FLOAT = 'FLOAT',
    FLOAT64 = 'FLOAT64',
    BOOLEAN = 'BOOLEAN',
    BOOL = 'BOOL',
    TIMESTAMP = 'TIMESTAMP',
    DATE = 'DATE',
    TIME = 'TIME',
    DATETIME = 'DATETIME',
    GEOGRAPHY = 'GEOGRAPHY',
    NUMERIC = 'NUMERIC',
    BIGNUMERIC = 'BIGNUMERIC',
    RECORD = 'RECORD',
    STRUCT = 'STRUCT',
}

const parseDateCell = (
    cell: BigQueryDate | BigQueryTimestamp | BigQueryDatetime | BigQueryTime,
) => new Date(cell.value);
const parseDefault = (cell: any) => cell;

const getParser = (type: string) => {
    switch (type) {
        case BigqueryFieldType.DATE:
        case BigqueryFieldType.DATETIME:
        case BigqueryFieldType.TIMESTAMP:
        case BigqueryFieldType.TIME:
            return parseDateCell;
        default:
            return parseDefault;
    }
};

const mapFieldType = (type: string): DimensionType => {
    switch (type) {
        case BigqueryFieldType.DATE:
            return DimensionType.DATE;
        case BigqueryFieldType.DATETIME:
        case BigqueryFieldType.TIMESTAMP:
        case BigqueryFieldType.TIME:
            return DimensionType.TIMESTAMP;
        case BigqueryFieldType.INTEGER:
        case BigqueryFieldType.FLOAT:
        case BigqueryFieldType.FLOAT64:
        case BigqueryFieldType.BYTES:
        case BigqueryFieldType.INT64:
        case BigqueryFieldType.NUMERIC:
        case BigqueryFieldType.BIGNUMERIC:
            return DimensionType.NUMBER;
        case BigqueryFieldType.BOOL:
        case BigqueryFieldType.BOOLEAN:
            return DimensionType.BOOLEAN;
        default:
            return DimensionType.STRING;
    }
};

type TableSchema = {
    fields: SchemaFields[];
};

type SchemaFields = Required<Pick<bigquery.ITableFieldSchema, 'name' | 'type'>>;

const isSchemaFields = (
    rawSchemaFields: bigquery.ITableFieldSchema[],
): rawSchemaFields is SchemaFields[] =>
    rawSchemaFields.every((field) => field.type && field.name);

const isTableSchema = (schema: bigquery.ITableSchema): schema is TableSchema =>
    !!schema && !!schema.fields && isSchemaFields(schema.fields);

const parseRows = (
    rows: Record<string, any>[],
    schemaFields: bigquery.ITableFieldSchema[],
) => {
    // TODO: assumes columns cannot have the same name
    if (!isSchemaFields(schemaFields)) {
        throw new Error('Could not parse response from bigquery');
    }
    const parsers: Record<string, (cell: any) => any> = Object.fromEntries(
        schemaFields.map((field) => [field.name, getParser(field.type)]),
    );
    return rows.map((row) =>
        Object.fromEntries(
            Object.entries(row).map(([name, value]) => [
                name,
                parsers[name](value),
            ]),
        ),
    );
};

export default class BigqueryWarehouseClient implements QueryRunner {
    client: BigQuery;

    credentials: CreateBigqueryCredentials;

    constructor(credentials: CreateBigqueryCredentials) {
        try {
            this.credentials = credentials;
            this.client = new BigQuery({
                projectId: credentials.project,
                location: credentials.location,
                maxRetries: credentials.retries,
                credentials: credentials.keyfileContents,
            });
        } catch (e) {
            throw new WarehouseConnectionError(e.message);
        }
    }

    async runQuery(query: string): Promise<Record<string, any>[]> {
        try {
            const [job] = await this.client.createQueryJob({
                query,
                useLegacySql: false,
                maximumBytesBilled: `${this.credentials.maximumBytesBilled}`,
                priority: this.credentials.priority,
                jobTimeoutMs: this.credentials.timeoutSeconds * 1000,
            });
            // auto paginate - hides full response
            const [rows] = await job.getQueryResults({ autoPaginate: true });

            // manual paginate - gives access to full api
            const [firstPage, nextQuery, apiResponse] =
                await job.getQueryResults({ autoPaginate: false });
            if (apiResponse?.schema?.fields === undefined) {
                throw new Error('Not a valid response from bigquery');
            }
            return parseRows(rows, apiResponse.schema.fields);
        } catch (e) {
            throw new WarehouseQueryError(e.message);
        }
    }

    async test(): Promise<void> {
        await this.runQuery('SELECT 1');
    }

    async getSchema(dbtModels: DbtModelNode[]) {
        const wantedSchema = dbtModels.reduce<{
            [dataset: string]: { [table: string]: string[] };
        }>((sum, model) => {
            const acc = { ...sum };
            acc[model.schema] = acc[model.schema] || {};
            acc[model.schema][model.name] = Object.keys(model.columns);
            return acc;
        }, {});

        const [datasets] = await this.client.getDatasets();

        const warehouseSchema: WarehouseSchema = {};

        await asyncForEach(datasets, async (dataset) => {
            if (dataset.id && !!wantedSchema[dataset.id]) {
                warehouseSchema[dataset.id] = {};

                const [tables] = await dataset.getTables();
                await asyncForEach(tables, async (table) => {
                    if (table.id && !!wantedSchema[dataset.id!][table.id]) {
                        const wantedColumns =
                            wantedSchema[dataset.id!][table.id];
                        const [metadata] = await table.getMetadata();
                        const { schema } = metadata;
                        if (isTableSchema(schema)) {
                            warehouseSchema[dataset.id!][table.id] =
                                schema.fields.reduce<WarehouseTableSchema>(
                                    (sum, { name, type }) =>
                                        wantedColumns.includes(name)
                                            ? {
                                                  ...sum,
                                                  [name]: mapFieldType(type),
                                              }
                                            : { ...sum },
                                    {},
                                );
                        }
                    }
                });
            }
        });

        return warehouseSchema;
    }
}
