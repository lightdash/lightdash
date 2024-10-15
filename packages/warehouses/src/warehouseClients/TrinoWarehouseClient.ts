import {
    CreateTrinoCredentials,
    DimensionType,
    Metric,
    MetricType,
    SupportedDbtAdapter,
    WarehouseConnectionError,
    WarehouseQueryError,
    WarehouseResults,
} from '@lightdash/common';
import {
    BasicAuth,
    ConnectionOptions,
    Iterator,
    QueryResult,
    Trino,
} from 'trino-client';
import { WarehouseCatalog } from '../types';
import WarehouseBaseClient from './WarehouseBaseClient';

export enum TrinoTypes {
    BOOLEAN = 'boolean',
    TINYINT = 'tinyint',
    SMALLINT = 'smallint',
    INTEGER = 'integer',
    BIGINT = 'bigint',
    REAL = 'real',
    DOUBLE = 'double',
    DECIMAL = 'decimal',
    VARCHAR = 'varchar',
    CHAR = 'char',
    VARBINARY = 'varbinary',
    JSON = 'json',
    DATE = 'date',
    TIME = 'time',
    TIME_TZ = 'time with time zone',
    TIMESTAMP = 'timestamp',
    TIMESTAMP_TZ = 'timestamp with time zone',
    INTERVAL_YEAR_MONTH = 'interval year to month',
    INTERVAL_DAY_TIME = 'interval day to second',
    ARRAY = 'array',
    MAP = 'map',
    ROW = 'row',
    IPADDRESS = 'ipaddress',
    UUID = 'uuid',
}

interface TableInfo {
    database: string;
    schema: string;
    table: string;
}

const queryTableSchema = ({
    database,
    schema,
    table,
}: TableInfo) => `SELECT table_catalog
                                                                         , table_schema
                                                                         , table_name
                                                                         , column_name
                                                                         , data_type
                                                                    FROM ${database}.information_schema.columns
                                                                    WHERE table_catalog = '${database}'
                                                                      AND table_schema = '${schema}'
                                                                      AND table_name = '${table}'
                                                                    ORDER BY 1, 2, 3, ordinal_position`;

const convertDataTypeToDimensionType = (
    type: TrinoTypes | string,
): DimensionType => {
    const typeWithoutTimePrecision = type.replace(/\(\d\)/, '');
    switch (typeWithoutTimePrecision) {
        case TrinoTypes.BOOLEAN:
            return DimensionType.BOOLEAN;
        case TrinoTypes.TINYINT:
            return DimensionType.NUMBER;
        case TrinoTypes.SMALLINT:
            return DimensionType.NUMBER;
        case TrinoTypes.INTEGER:
            return DimensionType.NUMBER;
        case TrinoTypes.BIGINT:
            return DimensionType.NUMBER;
        case TrinoTypes.REAL:
            return DimensionType.NUMBER;
        case TrinoTypes.DOUBLE:
            return DimensionType.NUMBER;
        case TrinoTypes.DECIMAL:
            return DimensionType.NUMBER;
        case TrinoTypes.DATE:
            return DimensionType.DATE;
        case TrinoTypes.TIMESTAMP:
            return DimensionType.TIMESTAMP;
        case TrinoTypes.TIMESTAMP_TZ:
            return DimensionType.TIMESTAMP;
        default:
            return DimensionType.STRING;
    }
};

const catalogToSchema = (results: string[][][]): WarehouseCatalog => {
    const warehouseCatalog: WarehouseCatalog = {};
    Object.values(results).forEach((catalog) => {
        Object.values(catalog).forEach(
            ([
                table_catalog,
                table_schema,
                table_name,
                column_name,
                data_type,
            ]) => {
                warehouseCatalog[table_catalog] =
                    warehouseCatalog[table_catalog] || {};
                warehouseCatalog[table_catalog][table_schema] =
                    warehouseCatalog[table_catalog][table_schema] || {};
                warehouseCatalog[table_catalog][table_schema][table_name] =
                    warehouseCatalog[table_catalog][table_schema][table_name] ||
                    {};
                warehouseCatalog[table_catalog][table_schema][table_name][
                    column_name
                ] = convertDataTypeToDimensionType(data_type);
            },
        );
    });
    return warehouseCatalog;
};

const resultHandler = (schema: { [key: string]: any }[], data: any[][]) => {
    const s: string[] = schema.map((e) => e.name);
    return data.map((i) => {
        const item: { [key: string]: any } = {};
        i.map((column, index) => {
            const name: string = s[index];
            item[name] = column;
            return null;
        });
        return item;
    });
};

export class TrinoWarehouseClient extends WarehouseBaseClient<CreateTrinoCredentials> {
    connectionOptions: ConnectionOptions;

    constructor(credentials: CreateTrinoCredentials) {
        super(credentials);
        this.connectionOptions = {
            auth: new BasicAuth(credentials.user, credentials.password),
            catalog: credentials.dbname,
            schema: credentials.schema,
            server: `${credentials.http_scheme}://${credentials.host}:${credentials.port}`,
        };
    }

    private async getSession() {
        const client = Trino;

        let session: Trino;
        try {
            session = await client.create(this.connectionOptions);
        } catch (e: any) {
            throw new WarehouseConnectionError(e.message);
        }

        return {
            session,
            close: async () => {
                console.info('Close trino connection');
            },
        };
    }

    async streamQuery(
        sql: string,
        streamCallback: (data: WarehouseResults) => void,
        options: {
            tags?: Record<string, string>;
            timezone?: string;
        },
    ): Promise<void> {
        const { session, close } = await this.getSession();
        let query: Iterator<QueryResult>;
        try {
            let alteredQuery = sql;
            if (options?.tags) {
                alteredQuery = `${alteredQuery}\n-- ${JSON.stringify(
                    options?.tags,
                )}`;
            }
            if (options?.timezone) {
                console.debug(`Setting Trino timezone to ${options?.timezone}`);
                await session.query(`SET TIME ZONE '${options?.timezone}'`);
            }
            query = await session.query(alteredQuery);

            let queryResult = await query.next();

            if (queryResult.value.error) {
                throw new WarehouseQueryError(
                    queryResult.value.error.message ??
                        'Unexpected error in query execution',
                );
            }

            const schema: {
                name: string;
                type: string;
                typeSignature: { rawType: string };
            }[] = queryResult.value.columns ?? [];
            const fields = schema.reduce(
                (acc, column) => ({
                    ...acc,
                    [column.name]: {
                        type: convertDataTypeToDimensionType(
                            column.typeSignature.rawType ?? TrinoTypes.VARCHAR,
                        ),
                    },
                }),
                {},
            );

            // stream initial data
            streamCallback({
                fields,
                rows: resultHandler(schema, queryResult.value.data ?? []),
            });
            // Using `await` in this loop ensures data chunks are fetched and processed sequentially.
            // This maintains order and data integrity.
            while (!queryResult.done) {
                // eslint-disable-next-line no-await-in-loop
                queryResult = await query.next();
                // stream next chunk of data
                streamCallback({
                    fields,
                    rows: resultHandler(schema, queryResult.value.data ?? []),
                });
            }
        } catch (e: any) {
            throw new WarehouseQueryError(e.message);
        } finally {
            await close();
        }
    }

    async getCatalog(requests: TableInfo[]): Promise<WarehouseCatalog> {
        const { session, close } = await this.getSession();
        let results: string[][][];

        try {
            const promises = requests.map(async (request) => {
                let query: Iterator<QueryResult> | null = null;

                try {
                    query = await session.query(queryTableSchema(request));
                    const result = (await query.next()).value.data ?? [];
                    return result;
                } catch (e: any) {
                    throw new WarehouseQueryError(e.message);
                } finally {
                    if (query) void close();
                }
            });

            results = await Promise.all(promises);
        } finally {
            await close();
        }
        return catalogToSchema(results);
    }

    getStringQuoteChar() {
        return "'";
    }

    getEscapeStringQuoteChar() {
        return "'";
    }

    getAdapterType(): SupportedDbtAdapter {
        return SupportedDbtAdapter.TRINO;
    }

    getMetricSql(sql: string, metric: Metric) {
        switch (metric.type) {
            case MetricType.PERCENTILE:
                return `APPROX_PERCENTILE(${sql}, ${
                    (metric.percentile ?? 50) / 100
                })`;
            case MetricType.MEDIAN:
                return `APPROX_PERCENTILE(${sql},0.5)`;
            default:
                return super.getMetricSql(sql, metric);
        }
    }

    private sanitizeInput(sql: string) {
        return sql.replaceAll(
            this.getStringQuoteChar(),
            this.getEscapeStringQuoteChar() + this.getStringQuoteChar(),
        );
    }

    async getTables(
        schema?: string,
        tags?: Record<string, string>,
    ): Promise<WarehouseCatalog> {
        const schemaFilter = schema
            ? `AND table_schema = '${this.sanitizeInput(schema)}'`
            : '';
        const query = `
            SELECT table_catalog, table_schema, table_name
            FROM information_schema.tables
            WHERE table_type = 'BASE TABLE' 
            ${schemaFilter}
            ORDER BY 1,2,3
        `;
        const { rows } = await this.runQuery(query, tags);
        return this.parseWarehouseCatalog(rows, convertDataTypeToDimensionType);
    }

    async getFields(
        tableName: string,
        schema?: string,
        database?: string,
        tags?: Record<string, string>,
    ): Promise<WarehouseCatalog> {
        const query = `
            SELECT table_catalog,
                   table_schema,
                   table_name,
                   column_name, 
                   data_type
            FROM information_schema.columns
            WHERE table_name = '${this.sanitizeInput(tableName)}'
            ${
                schema
                    ? `AND table_schema = '${this.sanitizeInput(schema)}'`
                    : ''
            }
            ${
                database
                    ? `AND table_catalog = '${this.sanitizeInput(database)}'`
                    : ''
            }
        `;
        const { rows } = await this.runQuery(query, tags);

        return this.parseWarehouseCatalog(rows, convertDataTypeToDimensionType);
    }

    async getAllTables() {
        const databaseName = this.connectionOptions.catalog;
        const whereSql = databaseName
            ? `AND table_catalog = '${this.sanitizeInput(databaseName)}'`
            : '';
        const filterSystemTables = `AND table_schema NOT IN ('information_schema', 'pg_catalog')`;
        const query = `
            SELECT table_catalog, table_schema, table_name
            FROM information_schema.tables
            WHERE table_type = 'BASE TABLE'
                ${whereSql}
                ${filterSystemTables}
            ORDER BY 1, 2, 3
        `;
        const { rows } = await this.runQuery(query, {}, undefined);
        return rows.map((row) => ({
            database: row.table_catalog,
            schema: row.table_schema,
            table: row.table_name,
        }));
    }
}
