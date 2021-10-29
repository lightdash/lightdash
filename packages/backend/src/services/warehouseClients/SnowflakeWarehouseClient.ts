import { CreateSnowflakeCredentials } from 'common';
import { createConnection, Connection, ConnectionOptions } from 'snowflake-sdk';
import { WarehouseConnectionError, WarehouseQueryError } from '../../errors';
import { WarehouseClient } from '../../types';

export default class SnowflakeWarehouseClient implements WarehouseClient {
    connectionOptions: ConnectionOptions;

    constructor(credentials: CreateSnowflakeCredentials) {
        this.connectionOptions = {
            account: credentials.account,
            username: credentials.user,
            password: credentials.password,
            database: credentials.database,
            schema: credentials.schema,
            warehouse: credentials.warehouse,
            role: credentials.role,
            clientSessionKeepAlive: credentials.clientSessionKeepAlive,
        };
    }

    async runQuery(sqlText: string): Promise<Record<string, any>[]> {
        let connection: Connection;
        try {
            connection = createConnection(this.connectionOptions);
            connection.connect((err) => {
                if (err) {
                    throw err;
                }
            });
        } catch (e) {
            throw new WarehouseConnectionError(e.message);
        }

        try {
            return await new Promise((resolve, reject) => {
                connection.execute({
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
        } finally {
            connection.destroy((err) => {
                if (err) {
                    throw new WarehouseConnectionError(err.message);
                }
            });
        }
    }

    async test(): Promise<void> {
        await this.runQuery('SELECT 1');
    }
}
