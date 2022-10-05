import { DBSQLClient } from '@databricks/sql';
import IDBSQLClient, {
    IDBSQLConnectionOptions,
} from '@databricks/sql/dist/contracts/IDBSQLClient';
import IDBSQLSession from '@databricks/sql/dist/contracts/IDBSQLSession';
import IOperation from '@databricks/sql/dist/contracts/IOperation';
import { TTypeId as DatabricksTypes } from '@databricks/sql/thrift/TCLIService_types';
import {
    assertUnreachable,
    CreateDatabricksCredentials,
    DimensionType,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import { WarehouseClient } from '../types';

export const DRIVER_PATH = '/opt/simba/spark/lib/64/libsparkodbc_sb64.so';

const mapFieldType = (type: DatabricksTypes): DimensionType => {
    switch (type) {
        case DatabricksTypes.BOOLEAN_TYPE:
            return DimensionType.BOOLEAN;
        case DatabricksTypes.TINYINT_TYPE:
        case DatabricksTypes.SMALLINT_TYPE:
        case DatabricksTypes.INT_TYPE:
        case DatabricksTypes.BIGINT_TYPE:
        case DatabricksTypes.FLOAT_TYPE:
        case DatabricksTypes.DOUBLE_TYPE:
        case DatabricksTypes.DECIMAL_TYPE:
            return DimensionType.NUMBER;
        case DatabricksTypes.DATE_TYPE:
            return DimensionType.DATE;
        case DatabricksTypes.TIMESTAMP_TYPE:
            return DimensionType.TIMESTAMP;
        case DatabricksTypes.STRING_TYPE:
        case DatabricksTypes.BINARY_TYPE:
        case DatabricksTypes.ARRAY_TYPE:
        case DatabricksTypes.STRUCT_TYPE:
        case DatabricksTypes.UNION_TYPE:
        case DatabricksTypes.USER_DEFINED_TYPE:
        case DatabricksTypes.INTERVAL_YEAR_MONTH_TYPE:
        case DatabricksTypes.INTERVAL_DAY_TIME_TYPE:
        case DatabricksTypes.NULL_TYPE:
        case DatabricksTypes.MAP_TYPE:
        case DatabricksTypes.CHAR_TYPE:
        case DatabricksTypes.VARCHAR_TYPE:
            return DimensionType.STRING;
        default:
            return assertUnreachable(type);
    }
};

export class DatabricksWarehouseClient implements WarehouseClient {
    connectionOptions: IDBSQLConnectionOptions;

    constructor({
        serverHostName,
        port,
        personalAccessToken,
        httpPath,
    }: CreateDatabricksCredentials) {
        this.connectionOptions = {
            token: personalAccessToken,
            host: serverHostName,
            path: httpPath,
            port,
        };
    }

    async getSession() {
        const client = new DBSQLClient();
        let connection: IDBSQLClient;
        let session: IDBSQLSession;

        try {
            connection = await client.connect(this.connectionOptions);
            session = await connection.openSession();
        } catch (e) {
            throw new WarehouseConnectionError(e.message);
        }

        return {
            session,
            close: async () => {
                await session.close();
                await connection.close();
            },
        };
    }

    async runQuery(sql: string) {
        const { session, close } = await this.getSession();
        let query: IOperation | null = null;

        try {
            query = await session.executeStatement(sql, {
                runAsync: true,
            });

            const schema = await query.getSchema();
            const result = await query.fetchAll();

            const fields = (schema?.columns ?? []).reduce<
                Record<string, { type: DimensionType }>
            >(
                (acc, column) => ({
                    ...acc,
                    [column.columnName]: {
                        type: mapFieldType(
                            column.typeDesc.types[0]?.primitiveEntry?.type ??
                                DatabricksTypes.STRING_TYPE,
                        ),
                    },
                }),
                {},
            );

            return { fields, rows: result };
        } catch (e) {
            throw new WarehouseQueryError(e.message);
        } finally {
            if (query) await query.close();
            await close();
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
                        mapFieldType(col.TYPE_NAME),
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
