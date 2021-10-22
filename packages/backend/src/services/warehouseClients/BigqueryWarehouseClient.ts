import { CreateBigqueryCredentials } from 'common';
import { BigQuery } from '@google-cloud/bigquery';
import { WarehouseConnectionError, WarehouseQueryError } from '../../errors';
import { QueryRunner } from '../../types';

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
            const [rows, results] = await job.getQueryResults(job);
            console.log('RESULTS');
            console.log(results);
            return rows;
        } catch (e) {
            throw new WarehouseQueryError(e.message);
        }
    }

    async test(): Promise<void> {
        await this.runQuery('SELECT 1');
    }
}
