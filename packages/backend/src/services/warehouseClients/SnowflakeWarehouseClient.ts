import { CreateSnowflakeCredentials, DimensionType } from 'common';
import { Connection, ConnectionOptions, createConnection } from 'snowflake-sdk';
import { WarehouseConnectionError, WarehouseQueryError } from '../../errors';
import { QueryRunner, WarehouseCatalog } from '../../types';

export enum SnowflakeTypes {
    NUMBER = 'NUMBER',
    DECIMAL = 'DECIMAL',
    NUMERIC = 'NUMERIC',
    INTEGER = 'INTEGER',
    INT = 'INT',
    BIGINT = 'BIGINT',
    SMALLINT = 'SMALLINT',
    FLOAT = 'FLOAT',
    FLOAT4 = 'FLOAT4',
    FLOAT8 = 'FLOAT8',
    DOUBLE = 'DOUBLE',
    DOUBLE_PRECISION = 'DOUBLE PRECISION',
    REAL = 'REAL',
    FIXED = 'FIXED',
    STRING = 'STRING',
    TEXT = 'TEXT',
    BOOLEAN = 'BOOLEAN',
    DATE = 'DATE',
    DATETIME = 'DATETIME',
    TIME = 'TIME',
    TIMESTAMP = 'TIMESTAMP',
    TIMESTAMP_LTZ = 'TIMESTAMP_LTZ',
    TIMESTAMP_NTZ = 'TIMESTAMP_NTZ',
    TIMESTAMP_TZ = 'TIMESTAMP_TZ',
    VARIANT = 'VARIANT',
    OBJECT = 'OBJECT',
    ARRAY = 'ARRAY',
    GEOGRAPHY = 'GEOGRAPHY',
}

const mapFieldType = (type: string): DimensionType => {
    switch (type) {
        case SnowflakeTypes.NUMBER:
        case SnowflakeTypes.DECIMAL:
        case SnowflakeTypes.NUMERIC:
        case SnowflakeTypes.INTEGER:
        case SnowflakeTypes.INT:
        case SnowflakeTypes.BIGINT:
        case SnowflakeTypes.SMALLINT:
        case SnowflakeTypes.FLOAT:
        case SnowflakeTypes.FLOAT4:
        case SnowflakeTypes.FLOAT8:
        case SnowflakeTypes.DOUBLE:
        case SnowflakeTypes.DOUBLE_PRECISION:
        case SnowflakeTypes.REAL:
        case SnowflakeTypes.FIXED:
            return DimensionType.NUMBER;
        case SnowflakeTypes.DATE:
            return DimensionType.DATE;
        case SnowflakeTypes.DATETIME:
        case SnowflakeTypes.TIME:
        case SnowflakeTypes.TIMESTAMP:
        case SnowflakeTypes.TIMESTAMP_LTZ:
        case SnowflakeTypes.TIMESTAMP_NTZ:
        case SnowflakeTypes.TIMESTAMP_TZ:
            return DimensionType.TIMESTAMP;
        case SnowflakeTypes.BOOLEAN:
            return DimensionType.BOOLEAN;
        default:
            return DimensionType.STRING;
    }
};

export default class SnowflakeWarehouseClient implements QueryRunner {
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

    async getSchema(
        config: {
            database: string;
            schema: string;
            table: string;
            columns: string[];
        }[],
    ) {
        const sqlText = 'SHOW COLUMNS';
        const rows = await this.runQuery(sqlText);
        return rows.reduce<WarehouseCatalog>((acc, row) => {
            const match = config.find(
                ({ database, schema, table }) =>
                    database.toLowerCase() ===
                        row.database_name.toLowerCase() &&
                    schema.toLowerCase() === row.schema_name.toLowerCase() &&
                    table.toLowerCase() === row.table_name.toLowerCase(),
            );
            const columnMatch = match?.columns.find(
                (name) => name.toLowerCase() === row.column_name.toLowerCase(),
            );
            if (row.kind === 'COLUMN' && !!match && !!columnMatch) {
                acc[match.database] = acc[match.database] || {};
                acc[match.database][match.schema] =
                    acc[match.database][match.schema] || {};
                acc[match.database][match.schema][match.table] =
                    acc[match.database][match.schema][match.table] || {};
                acc[match.database][match.schema][match.table][columnMatch] =
                    mapFieldType(JSON.parse(row.data_type).type);
            }
            return acc;
        }, {});
    }
}
