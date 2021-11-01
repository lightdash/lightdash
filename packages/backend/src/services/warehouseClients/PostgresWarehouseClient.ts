import { CreatePostgresCredentials, CreateRedshiftCredentials } from 'common';
import * as pg from 'pg';
import { WarehouseConnectionError, WarehouseQueryError } from '../../errors';
import { QueryRunner } from '../../types';

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
                    data_type;
                return acc;
            },
            {},
        );
    }
}
