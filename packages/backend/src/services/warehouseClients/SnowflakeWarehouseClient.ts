import { CreateSnowflakeCredentials } from 'common';
import { createConnection, Connection } from 'snowflake-sdk';
import { WarehouseConnectionError, WarehouseQueryError } from '../../errors';
import { QueryRunner } from '../../types';

export default class SnowflakeWarehouseClient implements QueryRunner {
    client: Connection;

    constructor(credentials: CreateSnowflakeCredentials) {
        try {
            this.client = createConnection({
                account: credentials.account,
                username: credentials.user,
                password: credentials.password,
                database: credentials.database,
                schema: credentials.schema,
                warehouse: credentials.warehouse,
                role: credentials.role,
                clientSessionKeepAlive: credentials.clientSessionKeepAlive,
            });
        } catch (e) {
            throw new WarehouseConnectionError(e.message);
        }
    }

    async runQuery(sqlText: string): Promise<Record<string, any>[]> {
        try {
            await new Promise((resolve, reject) => {
                this.client.connect((err, conn) => {
                    if (err) {
                        reject(err);
                    }
                    resolve(conn);
                });
            });
        } catch (e) {
            throw new WarehouseConnectionError(e.message);
        }
        try {
            return await new Promise((resolve, reject) => {
                this.client.execute({
                    sqlText,
                    complete: (err, stmt, data) => {
                        if (err) {
                            reject(err);
                        }
                        if (data) {
                            resolve(data);
                        } else {
                            reject(
                                new WarehouseQueryError(
                                    'Query result is undefined',
                                ),
                            );
                        }
                    },
                });
            });
        } catch (e) {
            throw new WarehouseQueryError(e.message);
        }
    }

    async test(): Promise<void> {
        await this.runQuery('SELECT 1');
    }
}
