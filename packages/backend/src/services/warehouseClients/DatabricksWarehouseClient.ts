import odbc, { Result } from 'odbc';
import { CreateDatabricksCredentials, DimensionType } from 'common';
import { WarehouseCatalog, WarehouseClient } from '../../types';
import { WarehouseConnectionError, WarehouseQueryError } from '../../errors';

export const DRIVER_PATH = '/opt/simba/spark/lib/64/libsparkodbc_sb64.so';

type SparkSchemaResult = {
    TABLE_CAT: string;
    TABLE_SCHEM: string;
    TABLE_NAME: string;
    COLUMN_NAME: string;
    DATA_TYPE: number;
    TYPE_NAME: string;
};

export default class DatabricksWarehouseClient implements WarehouseClient {
    connectionString: string;

    constructor({
        serverHostName,
        port,
        personalAccessToken,
        httpPath,
    }: CreateDatabricksCredentials) {
        this.connectionString = `Driver=${DRIVER_PATH};Server=${serverHostName};HOST=${serverHostName};PORT=${port};SparkServerType=3;Schema=default;ThriftTransport=2;SSL=1;AuthMech=3;UID=token;PWD=${personalAccessToken};HTTPPath=${httpPath};UseNativeQuery=1`;
    }

    async runQuery(sql: string): Promise<Record<string, any>[]> {
        let connection: odbc.Connection;
        try {
            connection = await odbc.connect(this.connectionString);
        } catch (e) {
            console.error(e);
            throw new WarehouseConnectionError(e.message);
        }
        try {
            const results = await connection.query<Record<string, any>>(sql);
            return results;
        } catch (e) {
            throw new WarehouseQueryError(e.message);
        } finally {
            await connection.close();
        }
    }

    async test(): Promise<void> {
        await this.runQuery('SELECT 1');
    }

    async getCatalog(
        requests: {
            database: string;
            schema: string;
            table: string;
            columns: string[];
        }[],
    ) {
        let pool: odbc.Pool;
        let results: Result<SparkSchemaResult>[];
        try {
            pool = await odbc.pool(this.connectionString);
        } catch (e) {
            throw new WarehouseConnectionError(e.message);
        }
        try {
            const promises = requests.map(async (request) => {
                let connection: odbc.Connection;
                try {
                    connection = await pool.connect();
                } catch (e) {
                    throw new WarehouseConnectionError(e.message);
                }
                try {
                    const columns = (await connection.columns(
                        // @ts-ignore
                        'SPARK', // This is always SPARK
                        request.schema,
                        request.table,
                        '',
                    )) as Result<SparkSchemaResult>;
                    return columns;
                } catch (e) {
                    throw new WarehouseQueryError(e.message);
                } finally {
                    await connection.close();
                }
            });
            results = await Promise.all(promises);
        } finally {
            await pool.close();
        }
        return results.reduce<WarehouseCatalog>(
            (acc, result, index) => {
                const columns = Object.fromEntries<DimensionType>(
                    result.map((col) => [
                        col.COLUMN_NAME,
                        DimensionType.STRING,
                    ]),
                );
                const { schema, table } = requests[index];
                acc.SPARK[schema] = acc.SPARK[schema] || {};
                acc.SPARK[schema][table] = columns;
                return acc;
            },
            { SPARK: {} } as WarehouseCatalog,
        );
    }
}
