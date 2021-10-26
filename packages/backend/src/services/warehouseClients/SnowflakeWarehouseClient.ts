import {
    CreateSnowflakeCredentials,
    DbtModelNode,
    DimensionType,
} from 'common';
import { Connection, ConnectionOptions, createConnection } from 'snowflake-sdk';
import { WarehouseConnectionError, WarehouseQueryError } from '../../errors';
import { QueryRunner, WarehouseSchema } from '../../types';
import { BigqueryFieldType } from './BigqueryWarehouseClient';

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
        case BigqueryFieldType.BOOLEAN:
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

    async getSchema(dbtModels: DbtModelNode[]) {
        const wantedSchema = dbtModels.reduce<{
            [dataset: string]: { [table: string]: string[] };
        }>((sum, model) => {
            const acc = { ...sum };
            acc[model.schema] = acc[model.schema] || {};
            acc[model.schema][model.name] = Object.keys(model.columns);
            return acc;
        }, {});
        const sqlText = 'SHOW COLUMNS';

        const rows = await this.runQuery(sqlText);

        return rows.reduce<WarehouseSchema>((acc, row) => {
            if (
                row.kind === 'COLUMN' &&
                !!wantedSchema[row.schema_name] &&
                Object.keys(wantedSchema[row.schema_name]).includes(
                    row.table_name,
                ) &&
                wantedSchema[row.schema_name][row.table_name].includes(
                    row.column_name,
                )
            ) {
                acc[row.schema_name] = acc[row.schema_name] || {};
                acc[row.schema_name][row.table_name] =
                    acc[row.schema_name][row.table_name] || {};
                acc[row.schema_name][row.table_name][row.column_name] =
                    mapFieldType(row.data_type.type);
            }
            return acc;
        }, {});
    }
}
