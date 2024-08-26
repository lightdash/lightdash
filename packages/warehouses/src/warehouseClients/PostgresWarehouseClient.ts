import {
    CreatePostgresCredentials,
    CreatePostgresLikeCredentials,
    DimensionType,
    Metric,
    MetricType,
    SupportedDbtAdapter,
    WarehouseCatalog,
    WarehouseQueryError,
    WarehouseResults,
} from '@lightdash/common';
import { readFileSync } from 'fs';
import path from 'path';
import * as pg from 'pg';
import { PoolConfig, QueryResult, types } from 'pg';
import { Writable } from 'stream';
import { rootCertificates } from 'tls';
import QueryStream from './PgQueryStream';
import WarehouseBaseClient from './WarehouseBaseClient';

const POSTGRES_CA_BUNDLES = [
    ...rootCertificates,
    readFileSync(path.resolve(__dirname, './ca-bundle-aws-rds-global.pem')),
];

types.setTypeParser(types.builtins.NUMERIC, (value) => parseFloat(value));
types.setTypeParser(types.builtins.INT8, (value) => parseInt(value, 10));

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

export class PostgresClient<
    T extends CreatePostgresLikeCredentials,
> extends WarehouseBaseClient<T> {
    config: pg.PoolConfig;

    constructor(credentials: T, config: pg.PoolConfig) {
        super(credentials);
        this.config = config;
    }

    private getSQLWithMetadata(sql: string, tags?: Record<string, string>) {
        let alteredQuery = sql;
        if (tags) {
            alteredQuery = `${alteredQuery}\n-- ${JSON.stringify(tags)}`;
        }
        return alteredQuery;
    }

    static convertQueryResultFields(
        fields: QueryResult<any>['fields'],
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
            values?: any[];
            tags?: Record<string, string>;
            timezone?: string;
        },
    ): Promise<void> {
        let pool: pg.Pool | undefined;
        return new Promise<void>((resolve, reject) => {
            pool = new pg.Pool({
                ...this.config,
                connectionTimeoutMillis: 5000,
            });

            pool.on('error', (err) => {
                console.error(`Postgres pool error ${err.message}`);
                reject(err);
            });

            pool.on('connect', (_client: pg.PoolClient) => {
                // On each new client initiated, need to register for error(this is a serious bug on pg, the client throw errors although it should not)
                _client.on('error', (err: Error) => {
                    console.error(
                        `Postgres client connect error ${err.message}`,
                    );
                    reject(err);
                });
            });
            pool.connect((err, client, done) => {
                if (err) {
                    reject(err);
                    done();
                    return;
                }
                if (!client) {
                    reject(new Error('client undefined'));
                    done();
                    return;
                }

                client.on('error', (e) => {
                    console.error(`Postgres client error ${e.message}`);
                    reject(e);
                    done();
                });

                const runQuery = () => {
                    // CodeQL: This will raise a security warning because user defined raw SQL is being passed into the database module.
                    //         In this case this is exactly what we want to do. We're hitting the user's warehouse not the application's database.
                    const stream = client.query(
                        new QueryStream(
                            this.getSQLWithMetadata(sql, options?.tags),
                            options?.values,
                        ),
                    );
                    // release the client when the stream is finished
                    stream.on('end', () => {
                        done();
                        resolve();
                    });
                    stream.on('error', (err2) => {
                        reject(err2);
                        done();
                    });
                    stream
                        .pipe(
                            new Writable({
                                objectMode: true,
                                write(
                                    chunk: {
                                        row: any;
                                        fields: QueryResult<any>['fields'];
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
                            }),
                        )
                        .on('error', (err2) => {
                            reject(err2);
                            done();
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
            .finally(() => {
                pool?.end().catch(() => {
                    console.info('Failed to end postgres pool');
                });
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
        tags?: Record<string, string>,
    ): Promise<WarehouseCatalog> {
        const schemaFilter = schema ? `AND table_schema = $2` : '';

        const query = `
            SELECT table_catalog,
                   table_schema,
                   table_name,
                   column_name,
                   data_type
            FROM information_schema.columns
            WHERE table_name = $1
                ${schemaFilter};
        `;
        const { rows } = await this.runQuery(
            query,
            tags,
            undefined,
            schema ? [tableName, schema] : [tableName],
        );

        return this.parseWarehouseCatalog(rows, mapFieldType);
    }

    getStringQuoteChar() {
        return "'";
    }

    getEscapeStringQuoteChar() {
        return "'";
    }

    getAdapterType(): SupportedDbtAdapter {
        return SupportedDbtAdapter.POSTGRES;
    }

    getMetricSql(sql: string, metric: Metric) {
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

    concatString(...args: string[]) {
        return `(${args.join(' || ')})`;
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
        // parse out line number and character number
        // const charNumber = Number(lineMatch[2]) + 1 || undefined; // Note the + 1 as it is 0 indexed
        // if query match, subtract the number of lines from the line number
        if (queryMatch && lineNumber && lineNumber > 1) {
            lineNumber -= 1;
        }
        // return a new error with the line and character number in data object
        return new WarehouseQueryError(error.message, {
            lineNumber,
            charNumber,
        });

        return new WarehouseQueryError(error?.message || 'Unknown error');
    }
}

// Mimics behaviour in https://github.com/brianc/node-postgres/blob/master/packages/pg-connection-string/index.js
const getSSLConfigFromMode = (mode: string): PoolConfig['ssl'] => {
    switch (mode) {
        case 'disable':
            return false;
        case 'prefer':
        case 'require':
        case 'allow':
        case 'verify-ca':
        case 'verify-full':
            return {
                ca: POSTGRES_CA_BUNDLES,
            };
        case 'no-verify':
            return { rejectUnauthorized: false, ca: POSTGRES_CA_BUNDLES };
        default:
            throw new Error(`Unknown sslmode for postgres: ${mode}`);
    }
};

export class PostgresWarehouseClient extends PostgresClient<CreatePostgresCredentials> {
    constructor(credentials: CreatePostgresCredentials) {
        const ssl = getSSLConfigFromMode(credentials.sslmode || 'prefer');
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
