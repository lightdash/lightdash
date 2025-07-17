import {
    AnyType,
    CreatePostgresCredentials,
    CreatePostgresLikeCredentials,
    DimensionType,
    getErrorMessage,
    Metric,
    MetricType,
    SslConfiguration,
    SupportedDbtAdapter,
    WarehouseCatalog,
    WarehouseQueryError,
    WarehouseResults,
    WarehouseTypes,
    WarehouseExecuteAsyncQuery,
    WarehouseExecuteAsyncQueryArgs,
    WarehouseGetAsyncQueryResults,
    WarehouseGetAsyncQueryResultsArgs,
    WarehouseQueryMetadata,
} from '@lightdash/common';
import { readFileSync } from 'fs';
import path from 'path';
import * as pg from 'pg';
import { PoolConfig, QueryResult, types } from 'pg';
import { Writable } from 'stream';
import * as tls from 'tls';
import { rootCertificates } from 'tls';
import { v4 as uuidv4 } from 'uuid';
import QueryStream from './PgQueryStream';
import WarehouseBaseClient from './WarehouseBaseClient';
import WarehouseBaseSqlBuilder from './WarehouseBaseSqlBuilder';

types.setTypeParser(types.builtins.NUMERIC, (value) => parseFloat(value));
types.setTypeParser(types.builtins.INT8, BigInt);

export enum PostgresTypes {
    INTEGER = 'integer',
    INT = 'int',
    INT2 = 'int2',
    INT4 = 'int4',
    INT8 = 'int8',
    MONEY = 'money',
    SMALLSERIAL = 'smallserial',
    SERIAL = 'serial',
    SERIAL2 = 'serial2',
    SERIAL4 = 'serial4',
    SERIAL8 = 'serial8',
    BIGSERIAL = 'bigserial',
    BIGINT = 'bigint',
    SMALLINT = 'smallint',
    BOOLEAN = 'boolean',
    BOOL = 'bool',
    DATE = 'date',
    DOUBLE_PRECISION = 'double precision',
    FLOAT = 'float',
    FLOAT4 = 'float4',
    FLOAT8 = 'float8',
    JSON = 'json',
    JSONB = 'jsonb',
    NUMERIC = 'numeric',
    DECIMAL = 'decimal',
    REAL = 'real',
    CHAR = 'char',
    CHARACTER = 'character',
    NCHAR = 'nchar',
    BPCHAR = 'bpchar',
    VARCHAR = 'varchar',
    CHARACTER_VARYING = 'character varying',
    NVARCHAR = 'nvarchar',
    TEXT = 'text',
    TIME = 'time',
    TIME_TZ = 'timetz',
    TIME_WITHOUT_TIME_ZONE = 'time without time zone',
    TIMESTAMP = 'timestamp',
    TIMESTAMP_TZ = 'timestamptz',
    TIMESTAMP_WITHOUT_TIME_ZONE = 'timestamp without time zone',
}

const mapFieldType = (type: string): DimensionType => {
    switch (type) {
        case PostgresTypes.DECIMAL:
        case PostgresTypes.NUMERIC:
        case PostgresTypes.INTEGER:
        case PostgresTypes.MONEY:
        case PostgresTypes.SMALLSERIAL:
        case PostgresTypes.SERIAL:
        case PostgresTypes.SERIAL2:
        case PostgresTypes.SERIAL4:
        case PostgresTypes.SERIAL8:
        case PostgresTypes.BIGSERIAL:
        case PostgresTypes.INT2:
        case PostgresTypes.INT4:
        case PostgresTypes.INT8:
        case PostgresTypes.BIGINT:
        case PostgresTypes.SMALLINT:
        case PostgresTypes.FLOAT:
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
        case PostgresTypes.TIME_WITHOUT_TIME_ZONE:
        case PostgresTypes.TIMESTAMP_WITHOUT_TIME_ZONE:
            return DimensionType.TIMESTAMP;
        case PostgresTypes.BOOLEAN:
        case PostgresTypes.BOOL:
            return DimensionType.BOOLEAN;
        default:
            return DimensionType.STRING;
    }
};

const { builtins } = pg.types;
const convertDataTypeIdToDimensionType = (
    dataTypeId: number,
): DimensionType => {
    switch (dataTypeId) {
        case builtins.NUMERIC:
        case builtins.MONEY:
        case builtins.INT2:
        case builtins.INT4:
        case builtins.INT8:
        case builtins.FLOAT4:
        case builtins.FLOAT8:
            return DimensionType.NUMBER;
        case builtins.DATE:
            return DimensionType.DATE;
        case builtins.TIME:
        case builtins.TIMETZ:
        case builtins.TIMESTAMP:
        case builtins.TIMESTAMPTZ:
            return DimensionType.TIMESTAMP;
        case builtins.BOOL:
            return DimensionType.BOOLEAN;
        default:
            return DimensionType.STRING;
    }
};

export class PostgresSqlBuilder extends WarehouseBaseSqlBuilder {
    type = WarehouseTypes.POSTGRES;

    getAdapterType(): SupportedDbtAdapter {
        return SupportedDbtAdapter.POSTGRES;
    }

    getEscapeStringQuoteChar(): string {
        return "'";
    }

    getMetricSql(sql: string, metric: Metric): string {
        switch (metric.type) {
            case MetricType.AVERAGE:
                return `AVG(${sql}::DOUBLE PRECISION)`;
            case MetricType.PERCENTILE:
                return `PERCENTILE_CONT(${
                    (metric.percentile ?? 50) / 100
                }) WITHIN GROUP (ORDER BY ${sql})`;
            case MetricType.MEDIAN:
                return `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${sql})`;
            default:
                return super.getMetricSql(sql, metric);
        }
    }

    concatString(...args: string[]): string {
        return `(${args.join(' || ')})`;
    }
}

// Constants for cursor management
const CURSOR_TTL_MS = 3600000; // 1 hour
const CURSOR_CLEANUP_INTERVAL_MS = 300000; // 5 minutes
const MAX_CONCURRENT_CURSORS = 100;

interface CursorConnection {
    pool: pg.Pool;
    client: pg.PoolClient;
    cursorName: string;
    totalRows: number;
    fields: Record<string, { type: DimensionType }>;
    createdAt: number;
}

export class PostgresClient<
    T extends CreatePostgresLikeCredentials,
> extends WarehouseBaseClient<T> {
    config: pg.PoolConfig;

    private cursorConnections: Map<string, CursorConnection> = new Map();

    private cleanupInterval?: NodeJS.Timeout;

    constructor(credentials: T, config: pg.PoolConfig) {
        super(credentials, new PostgresSqlBuilder(credentials.startOfWeek));
        this.config = config;
        
        // Start cleanup interval unless in test environment
        if (process.env.NODE_ENV !== 'test') {
            this.startCursorCleanupInterval();
        }
    }

    private getSQLWithMetadata(sql: string, tags?: Record<string, string>) {
        let alteredQuery = sql;
        if (tags) {
            alteredQuery = `${alteredQuery}\n-- ${JSON.stringify(tags)}`;
        }
        return alteredQuery;
    }

    static convertQueryResultFields(
        fields: QueryResult<AnyType>['fields'],
    ): Record<string, { type: DimensionType }> {
        return fields.reduce(
            (acc, { name, dataTypeID }) => ({
                ...acc,
                [name]: {
                    type: convertDataTypeIdToDimensionType(dataTypeID),
                },
            }),
            {},
        );
    }

    async streamQuery(
        sql: string,
        streamCallback: (data: WarehouseResults) => void,
        options: {
            values?: AnyType[];
            tags?: Record<string, string>;
            timezone?: string;
        },
    ): Promise<void> {
        let pool: pg.Pool | undefined;
        let closeClient: (() => void) | undefined;

        return new Promise<void>((resolve, reject) => {
            pool = new pg.Pool({
                ...this.config,
                connectionTimeoutMillis: 5000,
                query_timeout: this.credentials.timeoutSeconds
                    ? this.credentials.timeoutSeconds * 1000
                    : 1000 * 60 * 5, // sets the default query timeout to 5 minutes
            });

            pool.on('error', (err) => {
                console.error(`Postgres pool error ${getErrorMessage(err)}`);
                reject(err);
            });

            pool.on('connect', (_client: pg.PoolClient) => {
                // On each new client initiated, need to register for error(this is a serious bug on pg, the client throw errors although it should not)
                _client.on('error', (err: Error) => {
                    console.error(
                        `Postgres client connect error ${getErrorMessage(err)}`,
                    );
                    reject(err);
                });
            });

            pool.connect((err, client, done) => {
                // Store references so we can clean up properly
                closeClient = done;

                if (err) {
                    reject(err);
                    return;
                }
                if (!client) {
                    reject(new Error('client undefined'));
                    return;
                }

                client.on('error', (e) => {
                    console.error(
                        `Postgres client error ${getErrorMessage(e)}`,
                    );
                    reject(e);
                });

                const runQuery = () => {
                    // CodeQL: This will raise a security warning because user defined raw SQL is being passed into the database module.
                    //         In this case this is exactly what we want to do. We're hitting the user's warehouse not the application's database.
                    const stream = client.query(
                        // callback is not defined in types when using QueryStream
                        // @ts-ignore
                        new QueryStream(
                            this.getSQLWithMetadata(sql, options?.tags),
                            options?.values,
                        ),
                        // there is a bug in PG lib where callback is required when passing `query_timeout` to the Pool
                        // see the code: https://github.com/brianc/node-postgres/blob/master/packages/pg/lib/client.js#L541-L542
                        () => {},
                        // typecast is necessary to fix the type issue described above
                    ) as unknown as QueryStream;

                    const writable = new Writable({
                        objectMode: true,
                        write(
                            chunk: {
                                row: AnyType;
                                fields: QueryResult<AnyType>['fields'];
                            },
                            encoding,
                            callback,
                        ) {
                            streamCallback({
                                fields: PostgresClient.convertQueryResultFields(
                                    chunk.fields,
                                ),
                                rows: [chunk.row],
                            });
                            callback();
                        },
                    });

                    // release the client when the stream is finished
                    stream.on('end', () => {
                        resolve();
                    });
                    stream.on('error', (err2) => {
                        reject(err2);
                    });
                    stream.pipe(writable).on('error', (err2) => {
                        reject(err2);
                    });
                };

                if (options?.timezone) {
                    console.debug(
                        `Setting postgres session timezone ${options?.timezone}`,
                    );
                    client
                        .query(`SET timezone TO '${options?.timezone}';`)
                        .then(() => {
                            runQuery();
                        })
                        .catch((sessionError) => {
                            reject(sessionError);
                        });
                } else runQuery();
            });
        })
            .catch((e) => {
                const error = e as pg.DatabaseError;
                throw this.parseError(error, sql);
            })
            .finally(async () => {
                // Release the client first, then end the pool
                if (closeClient) {
                    try {
                        closeClient();
                    } catch (releaseError) {
                        console.warn('Error releasing client:', releaseError);
                    }
                }

                if (pool) {
                    try {
                        await pool.end();
                    } catch (poolError) {
                        console.info('Failed to end postgres pool:', poolError);
                    }
                }
            });
    }

    async getCatalog(
        requests: {
            database: string;
            schema: string;
            table: string;
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
        if (databases.size <= 0 || schemas.size <= 0 || tables.size <= 0) {
            return {};
        }

        const { rows: pgVersionRows } = await this.runQuery('SELECT version()');
        const pgVersionString = pgVersionRows[0]?.version ?? '';
        const versionRegex = /PostgreSQL (\d+)\./;
        const versionMatch = pgVersionString.match(versionRegex);
        const supportsMatviews =
            versionMatch && versionMatch[1]
                ? parseInt(versionMatch[1], 10) >= 12
                : false;

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
            ${
                supportsMatviews
                    ? `

            UNION ALL

            SELECT current_database() AS table_catalog,
                n.nspname AS table_schema,
                c.relname AS table_name,
                a.attname AS column_name,
                pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type
            FROM pg_catalog.pg_attribute a
            JOIN pg_catalog.pg_class c ON a.attrelid = c.oid
            JOIN pg_catalog.pg_namespace n ON c.relnamespace = n.oid
            JOIN pg_catalog.pg_matviews mv ON n.nspname = mv.schemaname AND c.relname = mv.matviewname
            WHERE c.relkind = 'm'
            AND current_database() IN (${Array.from(databases)})
            AND n.nspname IN (${Array.from(schemas)})
            AND c.relname IN (${Array.from(tables)})
            AND a.attnum > 0
            AND NOT a.attisdropped`
                    : ''
            }`;

        const { rows } = await this.runQuery(query);
        const catalog = rows.reduce(
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
                const match = requests.find(
                    ({ database, schema, table }) =>
                        database === table_catalog &&
                        schema === table_schema &&
                        table === table_name,
                );
                if (match) {
                    acc[table_catalog] = acc[table_catalog] || {};
                    acc[table_catalog][table_schema] =
                        acc[table_catalog][table_schema] || {};
                    acc[table_catalog][table_schema][table_name] =
                        acc[table_catalog][table_schema][table_name] || {};
                    acc[table_catalog][table_schema][table_name][column_name] =
                        mapFieldType(data_type);
                }

                return acc;
            },
            {},
        );
        return catalog;
    }

    async getAllTables() {
        const databaseName = this.config.database;
        const whereSql = databaseName ? `AND table_catalog = $1` : '';
        const filterSystemTables = `AND table_schema NOT IN ('information_schema', 'pg_catalog')`;
        const query = `
            SELECT table_catalog, table_schema, table_name
            FROM information_schema.tables
            WHERE table_type = 'BASE TABLE'
                ${whereSql}
                ${filterSystemTables}
            ORDER BY 1, 2, 3
        `;
        const { rows } = await this.runQuery(
            query,
            {},
            undefined,
            databaseName ? [databaseName] : [],
        );
        return rows.map((row) => ({
            database: row.table_catalog,
            schema: row.table_schema,
            table: row.table_name,
        }));
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
            WHERE table_name = $1
            ${schema ? 'AND table_schema = $2' : ''}
            ${database ? 'AND table_catalog = $3' : ''}
        `;
        const values = [tableName];
        if (schema) {
            values.push(schema);
        }
        if (database) {
            values.push(database);
        }
        const { rows } = await this.runQuery(query, tags, undefined, values);

        return this.parseWarehouseCatalog(rows, mapFieldType);
    }

    parseError(error: pg.DatabaseError, query: string = '') {
        // getErrorLineAndCharPosition is a helper function to get the line and character position of the error
        // NOTE: the database returns "position" which is the count of characters from the start of the query, regardless of newlines
        // this function converts the position to line number and character position
        const getErrorLineAndCharPosition = (
            queryString: string,
            position: string | undefined,
        ) => {
            if (!position) return undefined;
            // convert the position to a number
            const positionNum = parseInt(position, 10);
            // If the position is not a number, return an error message
            if (Number.isNaN(positionNum)) return undefined;
            // Split the queryString into lines
            const lines = queryString.split('\n');
            let currentCharCount = 0;
            // Loop through each line to determine the line number and character position
            for (let i = 0; i < lines.length; i += 1) {
                const line = lines[i];
                const nextCharCount = currentCharCount + line.length + 1; // +1 accounts for the newline character
                // If the position falls within this line
                if (positionNum <= nextCharCount) {
                    const charPosition = positionNum - currentCharCount;
                    return { line: i + 1, charPosition };
                }
                // Update the current character count
                currentCharCount = nextCharCount;
            }
            // If the position is beyond the queryString length, return an error message
            return undefined;
        };
        // do noithing if there is no position returned)
        if (!error?.position) return new WarehouseQueryError(error?.message);
        // The query will look something like this:
        // 'WITH user_sql AS (
        //     SELECT * FROM `lightdash-database-staging`.`e2e_jaffle_shop`.`users`;
        // ) select * from user_sql limit 500';
        // We want to check for the first part of the query, if so strip the first and last lines
        const queryMatch = query.match(/(?:WITH\s+[a-zA-Z_]+\s+AS\s*\()\s*?/i);
        // get the position and line from the position returned from postgres
        const positionObj = getErrorLineAndCharPosition(query, error?.position);
        // do nothing if the line and charNumber cannot be determined
        if (!positionObj) return new WarehouseQueryError(error?.message);
        let lineNumber = positionObj.line;
        const charNumber = positionObj.charPosition;
        // if query match, subtract the number of lines from the line number
        if (queryMatch && lineNumber && lineNumber > 1) {
            lineNumber -= 1;
        }
        // return a new error with the line and character number in data object
        return new WarehouseQueryError(error.message, {
            lineNumber,
            charNumber,
        });
    }

    // Cursor management methods
    private startCursorCleanupInterval() {
        this.cleanupInterval = setInterval(() => {
            const now = Date.now();
            Array.from(this.cursorConnections.entries()).forEach(([queryId, connection]) => {
                if (now - connection.createdAt > CURSOR_TTL_MS) {
                    void this.cleanupCursor(queryId);
                }
            });
        }, CURSOR_CLEANUP_INTERVAL_MS);
    }

    private async cleanupCursor(queryId: string) {
        const connection = this.cursorConnections.get(queryId);
        if (connection) {
            const { client, pool, cursorName } = connection;
            
            try {
                // Close cursor and end transaction
                await client.query(`CLOSE ${cursorName}`);
                await client.query('COMMIT');
                client.release();
            } catch (err) {
                console.error('Error cleaning up cursor:', err);
                // Still try to release the client
                try {
                    client.release();
                } catch (releaseErr) {
                    console.error('Error releasing client:', releaseErr);
                }
            }
            
            try {
                await pool.end();
            } catch (err) {
                console.error('Error ending pool:', err);
            }
            
            this.cursorConnections.delete(queryId);
        }
    }

    // Override executeAsyncQuery to support cursor-based pagination
    async executeAsyncQuery(
        { sql, values, tags, timezone }: WarehouseExecuteAsyncQueryArgs,
        resultsStreamCallback?: (
            rows: WarehouseResults['rows'],
            fields: WarehouseResults['fields'],
        ) => void,
    ): Promise<WarehouseExecuteAsyncQuery> {
        // Check if we've reached the maximum number of concurrent cursors
        if (this.cursorConnections.size >= MAX_CONCURRENT_CURSORS) {
            // Clean up oldest cursors
            const sortedConnections = Array.from(this.cursorConnections.entries())
                .sort((a, b) => a[1].createdAt - b[1].createdAt);
            
            const cleanupPromises = sortedConnections
                .slice(0, Math.min(10, sortedConnections.length))
                .map(([queryId]) => this.cleanupCursor(queryId));
            await Promise.all(cleanupPromises);
        }

        const queryId = uuidv4();
        const cursorName = `cursor_${queryId.replace(/-/g, '_')}`;
        
        // Create dedicated connection pool for this query
        const pool = new pg.Pool({
            ...this.config,
            connectionTimeoutMillis: 5000,
            query_timeout: this.credentials.timeoutSeconds
                ? this.credentials.timeoutSeconds * 1000
                : 1000 * 60 * 5, // default to 5 minutes
        });
        
        const startTime = performance.now();
        
        try {
            // Get a client from the pool
            const client = await pool.connect();
            
            // Set timezone if provided
            if (timezone) {
                await client.query(`SET timezone TO '${timezone}';`);
            }
            
            // Begin transaction and declare cursor
            await client.query('BEGIN');
            await client.query(
                `DECLARE ${cursorName} CURSOR FOR ${this.getSQLWithMetadata(sql, tags)}`,
                values,
            );
            
            // Get total row count using a separate query
            // This is necessary because cursors don't provide total count
            const countQuery = `SELECT COUNT(*) as count FROM (${sql}) AS count_query`;
            const countResult = await client.query(countQuery, values);
            const totalRows = parseInt(countResult.rows[0].count, 10);
            
            // Fetch first row to get field metadata
            const firstResult = await client.query(`FETCH 1 FROM ${cursorName}`);
            const fields = PostgresClient.convertQueryResultFields(firstResult.fields);
            
            // Store cursor connection
            this.cursorConnections.set(queryId, {
                pool,
                client,
                cursorName,
                totalRows,
                fields,
                createdAt: Date.now(),
            });
            
            // If streaming callback is provided, stream all results
            if (resultsStreamCallback) {
                // Reset cursor to beginning
                await client.query(`MOVE ABSOLUTE 0 IN ${cursorName}`);
                
                const batchSize = 1000;
                
                // Use recursive function to avoid await-in-loop
                const fetchBatch = async (): Promise<void> => {
                    const result = await client.query(
                        `FETCH FORWARD ${batchSize} FROM ${cursorName}`
                    );
                    
                    if (result.rows.length > 0) {
                        resultsStreamCallback(result.rows, fields);
                        
                        if (result.rows.length === batchSize) {
                            await fetchBatch();
                        }
                    }
                };
                
                await fetchBatch();
            }
            
            return {
                queryId,
                queryMetadata: {
                    type: WarehouseTypes.POSTGRES,
                    cursorName,
                },
                totalRows,
                durationMs: performance.now() - startTime,
            };
        } catch (error) {
            // Clean up on error - pool might not be stored yet
            if (this.cursorConnections.has(queryId)) {
                await this.cleanupCursor(queryId);
            } else if (pool) {
                // If error occurred before storing connection, clean up pool directly
                try {
                    await pool.end();
                } catch (poolError) {
                    console.error('Error ending pool on failure:', poolError);
                }
            }
            throw this.parseError(error as pg.DatabaseError, sql);
        }
    }

    // Implement getAsyncQueryResults for paginated results
    async getAsyncQueryResults<TFormattedRow extends Record<string, unknown>>(
        { queryId, page, pageSize }: WarehouseGetAsyncQueryResultsArgs,
        rowFormatter?: (row: Record<string, unknown>) => TFormattedRow,
    ): Promise<WarehouseGetAsyncQueryResults<TFormattedRow>> {
        if (!queryId) {
            throw new WarehouseQueryError('Query ID is required for pagination');
        }

        const cursorInfo = this.cursorConnections.get(queryId);
        if (!cursorInfo) {
            throw new WarehouseQueryError('Query ID not found or expired');
        }
        
        const { client, cursorName, totalRows, fields } = cursorInfo;
        const offset = (page - 1) * pageSize;
        
        try {
            // Move cursor to the correct position
            await client.query(`MOVE ABSOLUTE ${offset} IN ${cursorName}`);
            
            // Fetch the page of results
            const result = await client.query(
                `FETCH FORWARD ${pageSize} FROM ${cursorName}`
            );
            
            const formattedRows = result.rows.map(row => 
                rowFormatter ? rowFormatter(row) : row as TFormattedRow
            );
            
            // Update last accessed time
            cursorInfo.createdAt = Date.now();
            
            return {
                fields,
                rows: formattedRows,
                queryId,
                pageCount: Math.ceil(totalRows / pageSize),
                totalRows,
            };
        } catch (error) {
            throw this.parseError(error as pg.DatabaseError);
        }
    }

    // Clean up on destruction
    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        
        // Clean up all cursors
        Array.from(this.cursorConnections.keys()).forEach(queryId => {
            void this.cleanupCursor(queryId);
        });
    }
}

// Mimics behaviour in https://github.com/brianc/node-postgres/blob/master/packages/pg-connection-string/index.js
const getSSLConfigFromMode = ({
    sslcert,
    sslkey,
    sslmode,
    sslrootcert,
}: SslConfiguration): PoolConfig['ssl'] => {
    const mode = sslmode || 'prefer';
    const ca = sslrootcert || [
        ...rootCertificates,
        readFileSync(path.resolve(__dirname, './ca-bundle-aws-rds-global.pem')),
    ];
    switch (mode) {
        case 'disable':
            return false;
        case 'prefer':
        case 'require':
        case 'allow':
        case 'verify-ca':
        case 'verify-full':
            return {
                ca,
                cert: sslcert ?? undefined,
                key: sslkey ?? undefined,
                checkServerIdentity: (hostname, cert) => {
                    if (hostname === 'localhost') {
                        // When connecting to localhost, we don't need to validate the server identity
                        // pg library defaults to localhost when connecting via IP address
                        return undefined;
                    }
                    return tls.checkServerIdentity(hostname, cert);
                },
            };
        case 'no-verify':
            return { rejectUnauthorized: false, ca };
        default:
            throw new Error(`Unknown sslmode for postgres: ${mode}`);
    }
};

export class PostgresWarehouseClient extends PostgresClient<CreatePostgresCredentials> {
    constructor(credentials: CreatePostgresCredentials) {
        const ssl = getSSLConfigFromMode(credentials);
        super(credentials, {
            connectionString: `postgres://${encodeURIComponent(
                credentials.user,
            )}:${encodeURIComponent(credentials.password)}@${encodeURIComponent(
                credentials.host,
            )}:${credentials.port}/${encodeURIComponent(credentials.dbname)}`,
            ssl,
        });
    }
}
