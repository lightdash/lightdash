import { CreateBigqueryCredentials } from 'common';
import {
    BigQuery,
    BigQueryDate,
    BigQueryDatetime,
    BigQueryTime,
    BigQueryTimestamp,
} from '@google-cloud/bigquery';
import { WarehouseConnectionError, WarehouseQueryError } from '../../errors';
import { QueryRunner } from '../../types';

const parseDateCell = (cell: BigQueryDate) => new Date(cell.value);
const parseTimestampCell = (cell: BigQueryTimestamp) => new Date(cell.value);
const parseDateTimeCell = (cell: BigQueryDatetime) => new Date(cell.value);
const parseTimeCell = (cell: BigQueryTime) => new Date(cell.value);
const parseDefault = (cell: any) => cell;

const getParser = (type: string | undefined) => {
    switch (type) {
        case 'DATE':
            return parseDateCell;
        case 'DATETIME':
            return parseDateTimeCell;
        case 'TIMESTAMP':
            return parseTimestampCell;
        case 'TIME':
            return parseTimeCell;
        default:
            return parseDefault;
    }
};

type SchemaFields = {
    name: string;
    type: string;
};
type RawSchemaFields = Partial<SchemaFields>;

const isSchemaFields = (
    rawSchemaFields: RawSchemaFields[],
): rawSchemaFields is SchemaFields[] =>
    rawSchemaFields.every((field) => field.type && field.name);

const parseRows = (
    rows: Record<string, any>[],
    schemaFields: RawSchemaFields[],
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
}
