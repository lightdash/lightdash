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

// START workaround for https://github.com/lightdash/lightdash/issues/665. Please find better solution :pray:
function toJSON() {
    // @ts-ignore
    return this.value;
}
// @ts-ignore
BigQueryDate.prototype.toJSON = toJSON;
// @ts-ignore
BigQueryTimestamp.prototype.toJSON = toJSON;
// @ts-ignore
BigQueryDatetime.prototype.toJSON = toJSON;
// @ts-ignore
BigQueryTime.prototype.BigQueryTime = toJSON;
// END workaround

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
            const [rows] = await job.getQueryResults(job);
            return rows;
        } catch (e) {
            throw new WarehouseQueryError(e.message);
        }
    }

    async test(): Promise<void> {
        await this.runQuery('SELECT 1');
    }
}
