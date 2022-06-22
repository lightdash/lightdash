import {
    CreateSnowflakeCredentials,
    DimensionType,
    ParseError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import { Connection, ConnectionOptions, createConnection } from 'snowflake-sdk';
import * as Util from 'util';
import { WarehouseCatalog, WarehouseClient } from '../types';

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

const normaliseSnowflakeType = (type: string): string => {
    const r = /^[A-Z]+/;
    const match = r.exec(type);
    if (match === null) {
        throw new ParseError(
            `Cannot understand type from Snowflake: ${type}`,
            {},
        );
    }
    return match[0];
};

export const mapFieldType = (type: string): DimensionType => {
    switch (normaliseSnowflakeType(type)) {
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

const parseCell = (cell: any) => {
    if (cell instanceof Date) {
        return new Date(cell);
    }

    return cell;
};

const parseRows = (rows: Record<string, any>[]) =>
    rows.map((row) =>
        Object.fromEntries(
            Object.entries(row).map(([name, value]) => [
                name,
                parseCell(value),
            ]),
        ),
    );

export class SnowflakeWarehouseClient implements WarehouseClient {
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

    async runQuery(sqlText: string) {
        let connection: Connection;
        try {
            connection = createConnection(this.connectionOptions);
            await Util.promisify(connection.connect)();
        } catch (e) {
            throw new WarehouseConnectionError(`Snowflake error: ${e.message}`);
        }

        try {
            return await new Promise<{
                fields: Record<string, { type: DimensionType }>;
                rows: any[];
            }>((resolve, reject) => {
                connection.execute({
                    sqlText,
                    complete: (err, stmt, data) => {
                        if (err) {
                            reject(err);
                        }
                        if (data) {
                            const fields = stmt.getColumns().reduce(
                                (acc, column) => ({
                                    ...acc,
                                    [column.getName()]: {
                                        type: mapFieldType(
                                            column.getType().toUpperCase(),
                                        ),
                                    },
                                }),
                                {},
                            );
                            resolve({ fields, rows: parseRows(data) });
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

    async getCatalog(
        config: {
            database: string;
            schema: string;
            table: string;
        }[],
    ) {
        const sqlText = 'SHOW COLUMNS IN ACCOUNT';
        const { rows } = await this.runQuery(sqlText);
        return rows.reduce<WarehouseCatalog>((acc, row) => {
            const match = config.find(
                ({ database, schema, table }) =>
                    database.toLowerCase() ===
                        row.database_name.toLowerCase() &&
                    schema.toLowerCase() === row.schema_name.toLowerCase() &&
                    table.toLowerCase() === row.table_name.toLowerCase(),
            );
            // Unquoted identifiers will always be
            if (row.kind === 'COLUMN' && !!match) {
                acc[match.database] = acc[match.database] || {};
                acc[match.database][match.schema] =
                    acc[match.database][match.schema] || {};
                acc[match.database][match.schema][match.table] =
                    acc[match.database][match.schema][match.table] || {};
                acc[match.database][match.schema][match.table][
                    row.column_name
                ] = mapFieldType(JSON.parse(row.data_type).type);
            }
            return acc;
        }, {});
    }
}
