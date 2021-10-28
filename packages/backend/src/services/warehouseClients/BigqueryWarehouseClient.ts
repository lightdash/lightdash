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

const parseCell = (cell: any) => {
    if (
        cell === undefined ||
        cell === null ||
        typeof cell === 'boolean' ||
        typeof cell === 'number'
    ) {
        return cell;
    }

    if (
        cell instanceof BigQueryDate ||
        cell instanceof BigQueryTimestamp ||
        cell instanceof BigQueryDatetime ||
        cell instanceof BigQueryTime
    ) {
        return new Date(cell.value);
    }

    return `${cell}`;
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

const parseRows = (rows: Record<string, any>[]) =>
    rows.map((row) =>
        Object.fromEntries(
            Object.entries(row).map(([name, value]) => [
                name,
                parseCell(value),
            ]),
        ),
    );

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
            return parseRows(rows);
        } catch (e) {
            throw new WarehouseQueryError(e.message);
        }
    }

    async test(): Promise<void> {
        await this.runQuery('SELECT 1');
    }
}
