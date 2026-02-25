import { DuckDBInstance, DuckDBTypeId } from '@duckdb/node-api';
import {
    AnyType,
    CreateDuckdbCredentials,
    DimensionType,
    Metric,
    MetricType,
    NotImplementedError,
    SupportedDbtAdapter,
    WarehouseCatalog,
    WarehouseResults,
    WarehouseTypes,
} from '@lightdash/common';
import WarehouseBaseClient from './WarehouseBaseClient';
import WarehouseBaseSqlBuilder from './WarehouseBaseSqlBuilder';

type DuckdbStreamResult = {
    columnCount: number;
    columnNames: () => string[];
    columnTypeId: (columnIndex: number) => number;
    yieldRowObjectJson: () => AsyncIterableIterator<Record<string, AnyType>[]>;
};

type DuckdbRunResult = {
    getRowObjects: () => Promise<Record<string, AnyType>[]>;
};

type DuckdbConnection = {
    run: (
        sql: string,
        values?: AnyType[] | Record<string, AnyType>,
    ) => Promise<DuckdbRunResult>;
    stream: (
        sql: string,
        values?: AnyType[] | Record<string, AnyType>,
    ) => Promise<DuckdbStreamResult>;
    closeSync?: () => void;
    disconnectSync?: () => void;
};

type DuckdbInstance = {
    connect: () => Promise<DuckdbConnection>;
    closeSync?: () => void;
};

export type DuckdbS3SessionConfig = {
    endpoint: string;
    region?: string;
    accessKey?: string;
    secretKey?: string;
    forcePathStyle: boolean;
    useSsl: boolean;
};

export type DuckdbWarehouseClientArgs = {
    databasePath?: string;
    s3Config?: DuckdbS3SessionConfig;
};

export const mapFieldTypeFromTypeId = (typeId: number): DimensionType => {
    switch (typeId) {
        case DuckDBTypeId.DATE:
            return DimensionType.DATE;
        case DuckDBTypeId.TIME:
        case DuckDBTypeId.TIME_TZ:
        case DuckDBTypeId.TIMESTAMP:
        case DuckDBTypeId.TIMESTAMP_S:
        case DuckDBTypeId.TIMESTAMP_MS:
        case DuckDBTypeId.TIMESTAMP_NS:
        case DuckDBTypeId.TIMESTAMP_TZ:
            return DimensionType.TIMESTAMP;
        case DuckDBTypeId.BOOLEAN:
            return DimensionType.BOOLEAN;
        case DuckDBTypeId.TINYINT:
        case DuckDBTypeId.SMALLINT:
        case DuckDBTypeId.INTEGER:
        case DuckDBTypeId.BIGINT:
        case DuckDBTypeId.HUGEINT:
        case DuckDBTypeId.UTINYINT:
        case DuckDBTypeId.USMALLINT:
        case DuckDBTypeId.UINTEGER:
        case DuckDBTypeId.UBIGINT:
        case DuckDBTypeId.UHUGEINT:
        case DuckDBTypeId.FLOAT:
        case DuckDBTypeId.DOUBLE:
        case DuckDBTypeId.DECIMAL:
            return DimensionType.NUMBER;
        default:
            return DimensionType.STRING;
    }
};

const mapFieldTypeFromString = (typeName: string): DimensionType => {
    const upper = typeName.toUpperCase();
    if (upper === 'DATE') return DimensionType.DATE;
    if (
        upper.includes('TIMESTAMP') ||
        upper === 'TIME' ||
        upper === 'TIMETZ' ||
        upper === 'TIME WITH TIME ZONE'
    )
        return DimensionType.TIMESTAMP;
    if (upper === 'BOOLEAN') return DimensionType.BOOLEAN;
    if (
        upper.includes('INT') ||
        upper === 'FLOAT' ||
        upper === 'DOUBLE' ||
        upper === 'REAL' ||
        upper.startsWith('DECIMAL') ||
        upper.startsWith('NUMERIC') ||
        upper === 'HUGEINT' ||
        upper === 'UHUGEINT'
    )
        return DimensionType.NUMBER;
    return DimensionType.STRING;
};

export class DuckdbSqlBuilder extends WarehouseBaseSqlBuilder {
    getAdapterType(): SupportedDbtAdapter {
        return SupportedDbtAdapter.DUCKDB;
    }

    getFloatingType(): string {
        return 'DOUBLE';
    }

    getMetricSql(sql: string, metric: Metric): string {
        switch (metric.type) {
            case MetricType.PERCENTILE:
                return `QUANTILE_CONT(${sql}, ${(metric.percentile ?? 50) / 100})`;
            case MetricType.MEDIAN:
                return `MEDIAN(${sql})`;
            default:
                return super.getMetricSql(sql, metric);
        }
    }

    concatString(...args: string[]): string {
        return `(${args.join(' || ')})`;
    }
}

export class DuckdbWarehouseClient extends WarehouseBaseClient<CreateDuckdbCredentials> {
    private readonly databasePath: string;

    private readonly s3Config?: DuckdbS3SessionConfig;

    constructor(
        credentials: CreateDuckdbCredentials,
        overrides?: DuckdbWarehouseClientArgs,
    ) {
        super(credentials, new DuckdbSqlBuilder());
        if (overrides?.databasePath !== undefined) {
            this.databasePath = overrides.databasePath;
        } else if (credentials.token) {
            this.databasePath = `md:${credentials.database}?motherduck_token=${credentials.token}`;
        } else {
            this.databasePath = credentials.database || ':memory:';
        }
        this.s3Config = overrides?.s3Config;
    }

    static createForPreAggregate(
        args: DuckdbWarehouseClientArgs = {},
    ): DuckdbWarehouseClient {
        return new DuckdbWarehouseClient(
            {
                type: WarehouseTypes.DUCKDB,
                database: args.databasePath ?? ':memory:',
                schema: 'main',
            },
            args,
        );
    }

    private getSQLWithMetadata(sql: string, tags?: Record<string, string>) {
        if (!tags) {
            return sql;
        }

        return `${sql}\n-- ${JSON.stringify(tags)}`;
    }

    private async withSession<T>(
        callback: (db: DuckdbConnection) => Promise<T>,
    ): Promise<T> {
        const instance = (await DuckDBInstance.create(
            this.databasePath,
        )) as DuckdbInstance;
        const connection = await instance.connect();

        try {
            await this.bootstrapSession(connection);
            return await callback(connection);
        } finally {
            connection.closeSync?.();
            connection.disconnectSync?.();
            instance.closeSync?.();
        }
    }

    private async bootstrapSession(db: DuckdbConnection): Promise<void> {
        await db.run('INSTALL httpfs;');
        await db.run('LOAD httpfs;');

        if (this.s3Config) {
            await db.run(
                `SET s3_endpoint = '${this.escapeString(this.s3Config.endpoint)}';`,
            );

            if (this.s3Config.region) {
                await db.run(
                    `SET s3_region = '${this.escapeString(this.s3Config.region)}';`,
                );
            }

            if (this.s3Config.accessKey) {
                await db.run(
                    `SET s3_access_key_id = '${this.escapeString(
                        this.s3Config.accessKey,
                    )}';`,
                );
            }

            if (this.s3Config.secretKey) {
                await db.run(
                    `SET s3_secret_access_key = '${this.escapeString(
                        this.s3Config.secretKey,
                    )}';`,
                );
            }

            await db.run(`SET s3_use_ssl = ${this.s3Config.useSsl};`);
            await db.run(
                `SET s3_url_style = '${
                    this.s3Config.forcePathStyle ? 'path' : 'vhost'
                }';`,
            );
        }
    }

    private getBindValues(options?: {
        values?: AnyType[];
        queryParams?: Record<string, AnyType>;
    }): AnyType[] | Record<string, AnyType> | undefined {
        const hasValues = !!options?.values && options.values.length > 0;
        const hasQueryParams =
            !!options?.queryParams &&
            Object.keys(options.queryParams).length > 0;

        if (hasValues && hasQueryParams) {
            throw new NotImplementedError(
                'DuckDB streamQuery does not support using values and queryParams together',
            );
        }

        if (hasValues) {
            return options?.values;
        }

        if (hasQueryParams) {
            return options?.queryParams;
        }

        return undefined;
    }

    private static getFieldsFromStreamResult(
        result: DuckdbStreamResult,
    ): WarehouseResults['fields'] {
        const columnNames = result.columnNames();
        const fields: WarehouseResults['fields'] = {};
        for (let i = 0; i < result.columnCount; i += 1) {
            fields[columnNames[i]] = {
                type: mapFieldTypeFromTypeId(result.columnTypeId(i)),
            };
        }
        return fields;
    }

    async streamQuery(
        sql: string,
        streamCallback: (data: WarehouseResults) => void | Promise<void>,
        options?: {
            values?: AnyType[];
            queryParams?: Record<string, AnyType>;
            tags?: Record<string, string>;
            timezone?: string;
        },
    ): Promise<void> {
        await this.withSession(async (db) => {
            if (options?.timezone) {
                await db.run(
                    `SET TimeZone = '${this.escapeString(options.timezone)}';`,
                );
            }

            const result = await db.stream(
                this.getSQLWithMetadata(sql, options?.tags),
                this.getBindValues(options),
            );
            const fields =
                DuckdbWarehouseClient.getFieldsFromStreamResult(result);

            // eslint-disable-next-line no-restricted-syntax
            for await (const rows of result.yieldRowObjectJson()) {
                await streamCallback({ fields, rows });
            }
        });
    }

    async getCatalog(
        config: { database: string; schema: string; table: string }[],
    ): Promise<WarehouseCatalog> {
        return this.withSession(async (db) => {
            const catalog: WarehouseCatalog = {};

            /* eslint-disable no-await-in-loop */
            // eslint-disable-next-line no-restricted-syntax
            for (const ref of config) {
                const result = await db.run(
                    `SELECT column_name, data_type
                     FROM information_schema.columns
                     WHERE table_catalog = '${this.escapeString(ref.database)}'
                       AND table_schema = '${this.escapeString(ref.schema)}'
                       AND table_name = '${this.escapeString(ref.table)}'`,
                );
                const rows = await result.getRowObjects();

                if (rows.length > 0) {
                    if (!catalog[ref.database]) {
                        catalog[ref.database] = {};
                    }
                    if (!catalog[ref.database][ref.schema]) {
                        catalog[ref.database][ref.schema] = {};
                    }
                    catalog[ref.database][ref.schema][ref.table] = rows.reduce<
                        Record<string, DimensionType>
                    >((acc, row) => {
                        const colName = row.column_name as string;
                        const colType = row.data_type as string;
                        acc[colName] = mapFieldTypeFromString(colType);
                        return acc;
                    }, {});
                }
            }
            /* eslint-enable no-await-in-loop */

            return catalog;
        });
    }

    async getAllTables(
        schema?: string,
        tags?: Record<string, string>,
    ): Promise<
        {
            database: string;
            schema: string;
            table: string;
        }[]
    > {
        return this.withSession(async (db) => {
            let sql = `SELECT table_catalog AS database, table_schema AS schema, table_name AS table
                        FROM information_schema.tables
                        WHERE table_type IN ('BASE TABLE', 'VIEW')`;

            if (schema) {
                sql += ` AND table_schema = '${this.escapeString(schema)}'`;
            }

            const result = await db.run(
                tags ? this.getSQLWithMetadata(sql, tags) : sql,
            );
            const rows = await result.getRowObjects();

            return rows.map((row) => ({
                database: row.database as string,
                schema: row.schema as string,
                table: row.table as string,
            }));
        });
    }

    async getFields(
        tableName: string,
        schema?: string,
        database?: string,
        _tags?: Record<string, string>,
    ): Promise<WarehouseCatalog> {
        const refs = [
            {
                database: database ?? '',
                schema: schema ?? this.credentials.schema,
                table: tableName,
            },
        ];
        return this.getCatalog(refs);
    }
}
