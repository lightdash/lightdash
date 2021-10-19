import { CreatePostgresCredentials, SqlQueryResults } from 'common';
import * as pg from 'pg';
import { WarehouseConnectionError, WarehouseQueryError } from '../../errors';

export default class PostgresWarehouseClient {
    client: pg.Client;

    constructor(credentials: CreatePostgresCredentials) {
        try {
            const client = new pg.Client({
                // Use connection string so we can use sslmode keywords for postgres
                connectionString: `postgres://${credentials.user}:${
                    credentials.password
                }@${credentials.host}:${credentials.port}/${
                    credentials.dbname
                }?sslmode=${credentials.sslmode || 'prefer'}`,
            });
            this.client = client;
        } catch (e) {
            throw new WarehouseConnectionError(e.message);
        }
    }

    async runQuery(sql: string): Promise<SqlQueryResults> {
        try {
            await this.client.connect();
        } catch (e) {
            throw new WarehouseConnectionError(e.message);
        }
        try {
            const results = await this.client.query(sql);
            return {
                fields: results.fields.map((field) => ({
                    name: field.name,
                    type: `${field.dataTypeID}`, // types are enum values: https://github.com/brianc/node-pg-types/blob/8594bc6befca3523e265022f303f1376f679b5dc/index.d.ts#L1-L62
                })), // TODO: map to standard column types
                rows: results.rows,
            };
        } catch (e) {
            throw new WarehouseQueryError(e.message);
        } finally {
            await this.client.end();
        }
    }
}
