import {
    CreatePostgresCredentials,
    CreateRedshiftCredentials,
    DimensionType,
} from 'common';
import * as pg from 'pg';
import { WarehouseConnectionError, WarehouseQueryError } from '../../errors';
import { QueryRunner } from '../../types';

export enum PostgresTypes {
    INTEGER = 'integer',
    INT = 'INT',
    BIGINT = 'bigint',
    SMALLINT = 'smallint',
    BOOLEAN = 'boolean',
    BOOL = 'bool',
    DATE = 'date',
    DOUBLE_PRECISION = 'double precision',
    FLOAT8 = 'float8',
    FLOAT4 = 'float4',
    JSON = 'json',
    JSONB = 'jsonb',
    NUMERIC = 'numeric',
    DECIMAL = 'DECIMAL',
    REAL = 'real',
    TEXT = 'text',
    TIME = 'time',
    TIME_TZ = 'timetz',
    TIMESTAMP = 'timestamp',
    TIMESTAMP_TZ = 'timestamptz',
}

const mapFieldType = (type: string): DimensionType => {
    switch (type) {
        case PostgresTypes.DECIMAL:
        case PostgresTypes.NUMERIC:
        case PostgresTypes.INTEGER:
        case PostgresTypes.INT:
        case PostgresTypes.BIGINT:
        case PostgresTypes.SMALLINT:
        case PostgresTypes.FLOAT4:
        case PostgresTypes.FLOAT8:
        case PostgresTypes.DOUBLE_PRECISION:
        case PostgresTypes.REAL:
            return DimensionType.NUMBER;
        case PostgresTypes.DATE:
            return DimensionType.DATE;
        case PostgresTypes.TIME:
        case PostgresTypes.TIME_TZ:
        case PostgresTypes.TIMESTAMP:
        case PostgresTypes.TIMESTAMP_TZ:
            return DimensionType.TIMESTAMP;
        case PostgresTypes.BOOLEAN:
        case PostgresTypes.BOOL:
            return DimensionType.BOOLEAN;
        default:
            return DimensionType.STRING;
    }
};

export default class PostgresWarehouseClient implements QueryRunner {
    client: pg.Client;

    constructor(
        credentials: CreatePostgresCredentials | CreateRedshiftCredentials,
    ) {
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

    async runQuery(sql: string): Promise<Record<string, any>[]> {
        try {
            await this.client.connect();
        } catch (e) {
            throw new WarehouseConnectionError(e.message);
        }
        try {
            const results = await this.client.query(sql);
            return results.rows;
        } catch (e) {
            throw new WarehouseQueryError(e.message);
        } finally {
            await this.client.end();
        }
    }

    async test(): Promise<void> {
        await this.runQuery('SELECT 1');
    }

    async getSchema(
        requests: {
            database: string;
            schema: string;
            table: string;
            columns: string[];
        }[],
    ) {
        const { databases, schemas, tables } = requests.reduce<{
            databases: Set<string>;
            schemas: Set<string>;
            tables: Set<string>;
        }>(
            (acc, { database, schema, table }) => ({
                databases: acc.databases.add(`'${database}'`),
                schemas: acc.schemas.add(`'${schema}'`),
                tables: acc.tables.add(`'${table}'`),
            }),
            {
                databases: new Set(),
                schemas: new Set(),
                tables: new Set(),
            },
        );
        const query = `
            SELECT table_catalog,
                   table_schema,
                   table_name,
                   column_name,
                   data_type
            FROM information_schema.columns
            WHERE table_catalog IN (${Array.from(databases)}) 
            AND table_schema IN (${Array.from(schemas)})
            AND table_name IN (${Array.from(tables)})
        `;

        const rows = await this.runQuery(query);

        return rows.reduce(
            (
                acc,
                {
                    table_catalog,
                    table_schema,
                    table_name,
                    column_name,
                    data_type,
                },
            ) => {
                acc[table_catalog] = acc[table_catalog] || {};
                acc[table_catalog][table_schema] =
                    acc[table_catalog][table_schema] || {};
                acc[table_catalog][table_schema][table_name] =
                    acc[table_catalog][table_schema][table_name] || {};
                acc[table_catalog][table_schema][table_name][column_name] =
                    mapFieldType(data_type);
                return acc;
            },
            {},
        );
    }
}
