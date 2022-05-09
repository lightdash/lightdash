import {
    CreateDatabricksCredentials,
    DimensionType,
    ParseError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from 'common';
import odbc, { Result } from 'odbc';
import { WarehouseCatalog, WarehouseClient } from '../types';

export const DRIVER_PATH = '/opt/simba/spark/lib/64/libsparkodbc_sb64.so';

type SparkSchemaResult = {
    TABLE_CAT: string;
    TABLE_SCHEM: string;
    TABLE_NAME: string;
    COLUMN_NAME: string;
    DATA_TYPE: number;
    TYPE_NAME: string;
};

enum DatabricksTypes {
    BOOLEAN = 'BOOLEAN',
    BYTE = 'BYTE',
    TINYINT = 'TINYINT',
    SHORT = 'SHORT',
    SMALLINT = 'SMALLINT',
    INT = 'INT',
    INTEGER = 'INTEGER',
    LONG = 'LONG',
    BIGINT = 'BIGINT',
    FLOAT = 'FLOAT',
    REAL = 'REAL',
    DOUBLE = 'DOUBLE',
    DATE = 'DATE',
    TIMESTAMP = 'TIMESTAMP',
    STRING = 'STRING',
    BINARY = 'BINARY',
    DECIMAL = 'DECIMAL',
    DEC = 'DEC',
    NUMERIC = 'NUMERIC',
    INTERVAL = 'INTERVAL', // INTERVAL HOUR
    ARRAY = 'ARRAY', // ARRAY<type>
    STRUCT = 'STRUCT', // STRUCT<type,type...>
    MAP = 'MAP',
    CHAR = 'CHAR',
    VARCHAR = 'VARCHAR',
}

const normaliseDatabricksType = (type: string): string => {
    const r = /^[A-Z]+/;
    const match = r.exec(type);
    if (match === null) {
        throw new ParseError(
            `Cannot understand type from Databricks: ${type}`,
            {},
        );
    }
    return match[0];
};

const mapFieldType = (type: string): DimensionType => {
    switch (normaliseDatabricksType(type)) {
        case DatabricksTypes.BOOLEAN:
            return DimensionType.BOOLEAN;
        case DatabricksTypes.TINYINT:
        case DatabricksTypes.SHORT:
        case DatabricksTypes.SMALLINT:
        case DatabricksTypes.INT:
        case DatabricksTypes.INTEGER:
        case DatabricksTypes.BIGINT:
        case DatabricksTypes.LONG:
        case DatabricksTypes.FLOAT:
        case DatabricksTypes.REAL:
        case DatabricksTypes.DOUBLE:
        case DatabricksTypes.DECIMAL:
        case DatabricksTypes.DEC:
        case DatabricksTypes.NUMERIC:
            return DimensionType.NUMBER;
        case DatabricksTypes.DATE:
            return DimensionType.DATE;
        case DatabricksTypes.TIMESTAMP:
            return DimensionType.TIMESTAMP;
        case DatabricksTypes.STRING:
        case DatabricksTypes.BINARY:
        case DatabricksTypes.INTERVAL:
        case DatabricksTypes.ARRAY:
        case DatabricksTypes.STRUCT:
        case DatabricksTypes.MAP:
        case DatabricksTypes.CHAR:
        case DatabricksTypes.VARCHAR:
            return DimensionType.STRING;
        default:
            return DimensionType.STRING;
    }
};

export class DatabricksWarehouseClient implements WarehouseClient {
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
            throw new WarehouseConnectionError(e.message);
        }
        try {
            return await connection.query<Record<string, any>>(sql);
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
