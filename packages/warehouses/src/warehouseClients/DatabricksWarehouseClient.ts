import { DBSQLClient } from '@databricks/sql';
import IDBSQLClient, {
    ConnectionOptions,
} from '@databricks/sql/dist/contracts/IDBSQLClient';
import IDBSQLSession from '@databricks/sql/dist/contracts/IDBSQLSession';
import IOperation from '@databricks/sql/dist/contracts/IOperation';
import { TTypeId as DatabricksDataTypes } from '@databricks/sql/thrift/TCLIService_types';
import {
    CreateDatabricksCredentials,
    DimensionType,
    Metric,
    MetricType,
    ParseError,
    SupportedDbtAdapter,
    WarehouseConnectionError,
    WarehouseQueryError,
    WarehouseResults,
} from '@lightdash/common';
import { WarehouseCatalog } from '../types';
import WarehouseBaseClient from './WarehouseBaseClient';

type SchemaResult = {
    TABLE_CAT: string;
    TABLE_SCHEM: string;
    TABLE_NAME: string;
    COLUMN_NAME: string;
    DATA_TYPE: number;
    TYPE_NAME: string;
    // additional props
    // COLUMN_SIZE: null,
    // BUFFER_LENGTH: null,
    // DECIMAL_DIGITS: null,
    // NUM_PREC_RADIX: null,
    // NULLABLE: 1,
    // REMARKS: '',
    // COLUMN_DEF: null,
    // SQL_DATA_TYPE: null,
    // SQL_DATETIME_SUB: null,
    // CHAR_OCTET_LENGTH: null,
    // ORDINAL_POSITION: 5,
    // IS_NULLABLE: 'YES',
    // SCOPE_CATALOG: null,
    // SCOPE_SCHEMA: null,
    // SCOPE_TABLE: null,
    // SOURCE_DATA_TYPE: null,
    // IS_AUTO_INCREMENT: 'NO'
};

const convertDataTypeToDimensionType = (
    type: DatabricksDataTypes,
): DimensionType => {
    switch (type) {
        case DatabricksDataTypes.BOOLEAN_TYPE:
            return DimensionType.BOOLEAN;
        case DatabricksDataTypes.TINYINT_TYPE:
        case DatabricksDataTypes.SMALLINT_TYPE:
        case DatabricksDataTypes.INT_TYPE:
        case DatabricksDataTypes.BIGINT_TYPE:
        case DatabricksDataTypes.FLOAT_TYPE:
        case DatabricksDataTypes.DOUBLE_TYPE:
        case DatabricksDataTypes.DECIMAL_TYPE:
            return DimensionType.NUMBER;
        case DatabricksDataTypes.DATE_TYPE:
            return DimensionType.DATE;
        case DatabricksDataTypes.TIMESTAMP_TYPE:
            return DimensionType.TIMESTAMP;
        case DatabricksDataTypes.STRING_TYPE:
        case DatabricksDataTypes.BINARY_TYPE:
        case DatabricksDataTypes.ARRAY_TYPE:
        case DatabricksDataTypes.STRUCT_TYPE:
        case DatabricksDataTypes.UNION_TYPE:
        case DatabricksDataTypes.USER_DEFINED_TYPE:
        case DatabricksDataTypes.INTERVAL_YEAR_MONTH_TYPE:
        case DatabricksDataTypes.INTERVAL_DAY_TIME_TYPE:
        case DatabricksDataTypes.NULL_TYPE:
        case DatabricksDataTypes.MAP_TYPE:
        case DatabricksDataTypes.CHAR_TYPE:
        case DatabricksDataTypes.VARCHAR_TYPE:
            return DimensionType.STRING;
        default:
            return DimensionType.STRING;
    }
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

const normaliseDatabricksType = (type: string): DatabricksTypes => {
    const r = /^[A-Z]+/;
    const match = r.exec(type);
    if (match === null) {
        throw new ParseError(
            `Cannot understand type from Databricks: ${type}`,
            {},
        );
    }
    return match[0] as DatabricksTypes;
};

const DATABRICKS_QUERIES_BATCH_SIZE = 100;

async function processPromisesInBatches<T, R>(
    items: Array<T>,
    batchSize: number,
    fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
    let results: R[] = [];
    /* eslint-disable no-await-in-loop */
    for (let start = 0; start < items.length; start += batchSize) {
        const end =
            start + batchSize > items.length ? items.length : start + batchSize;
        const slicedResults = await Promise.all(
            items.slice(start, end).map(fn),
        );
        results = [...results, ...slicedResults];
    }
    /* eslint-enable no-await-in-loop */
    return results;
}

const mapFieldType = (type: string): DimensionType => {
    const normalizedType = normaliseDatabricksType(type);

    switch (normalizedType) {
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
        case DatabricksTypes.STRING:
        case DatabricksTypes.BINARY:
        case DatabricksTypes.INTERVAL:
        case DatabricksTypes.ARRAY:
        case DatabricksTypes.STRUCT:
        case DatabricksTypes.MAP:
        case DatabricksTypes.CHAR:
        case DatabricksTypes.VARCHAR:
        case DatabricksTypes.BYTE:
            return DimensionType.STRING;
        case DatabricksTypes.DATE:
            return DimensionType.DATE;
        case DatabricksTypes.TIMESTAMP:
            return DimensionType.TIMESTAMP;
        default:
            return DimensionType.STRING;
    }
};

export class DatabricksWarehouseClient extends WarehouseBaseClient<CreateDatabricksCredentials> {
    schema: string;

    catalog?: string;

    connectionOptions: ConnectionOptions;

    constructor(credentials: CreateDatabricksCredentials) {
        super(credentials);
        this.schema = credentials.database;
        this.catalog = credentials.catalog;
        this.connectionOptions = {
            token: credentials.personalAccessToken,
            host: credentials.serverHostName,
            path: credentials.httpPath.startsWith('/')
                ? credentials.httpPath
                : `/${credentials.httpPath}`,
        };
    }

    private async getSession() {
        const client = new DBSQLClient({});
        let connection: IDBSQLClient;
        let session: IDBSQLSession;

        try {
            connection = await client.connect(this.connectionOptions);

            session = await connection.openSession({
                initialCatalog: this.catalog,
                initialSchema: this.schema,
            });
        } catch (e: any) {
            throw new WarehouseConnectionError(e.message);
        }

        return {
            session,
            close: async () => {
                await session.close();
                await connection.close();
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
        let query: IOperation | null = null;

        let alteredQuery = sql;
        if (options?.tags) {
            alteredQuery = `${alteredQuery}\n-- ${JSON.stringify(
                options?.tags,
            )}`;
        }

        try {
            if (options?.timezone) {
                console.debug(
                    `Setting databricks timezone to ${options?.timezone}`,
                );
                await session.executeStatement(
                    `SET TIME ZONE '${options?.timezone}'`,
                    {
                        runAsync: false,
                    },
                );
            }
            query = await session.executeStatement(alteredQuery, {
                runAsync: true,
            });

            const schema = await query.getSchema();
            const fields = (schema?.columns ?? []).reduce<
                Record<string, { type: DimensionType }>
            >(
                (acc, column) => ({
                    ...acc,
                    [column.columnName]: {
                        type: convertDataTypeToDimensionType(
                            column.typeDesc.types[0]?.primitiveEntry?.type ??
                                DatabricksDataTypes.STRING_TYPE,
                        ),
                    },
                }),
                {},
            );

            do {
                // eslint-disable-next-line no-await-in-loop
                const chunk = await query.fetchChunk();
                streamCallback({ fields, rows: chunk });
                // eslint-disable-next-line no-await-in-loop
            } while (await query.hasMoreRows());
        } catch (e: any) {
            throw new WarehouseQueryError(e.message);
        } finally {
            if (query) await query.close();
            await close();
        }
    }

    async getCatalog(
        requests: {
            database: string;
            schema: string;
            table: string;
        }[],
    ) {
        const { session, close } = await this.getSession();
        let results: SchemaResult[][];

        try {
            results = await processPromisesInBatches(
                requests,
                DATABRICKS_QUERIES_BATCH_SIZE,
                async (request) => {
                    let query: IOperation | null = null;
                    try {
                        query = await session.getColumns({
                            catalogName: request.database,
                            schemaName: request.schema,
                            tableName: request.table,
                        });
                        return (await query.fetchAll()) as SchemaResult[];
                    } catch (e: any) {
                        throw new WarehouseQueryError(e.message);
                    } finally {
                        if (query) await query.close();
                    }
                },
            );
        } catch (e: any) {
            throw new WarehouseQueryError(e.message);
        } finally {
            try {
                await close();
            } catch (e: any) {
                // Only console error. Don't allow close errors to override the original error
                console.error('Error closing Databricks session', e);
            }
        }

        const catalog = this.catalog || 'DEFAULT';
        return results.reduce<WarehouseCatalog>(
            (acc, result, index) => {
                const columns = Object.fromEntries<DimensionType>(
                    result.map((col) => [
                        col.COLUMN_NAME,
                        mapFieldType(col.TYPE_NAME),
                    ]),
                );
                const { schema, table } = requests[index];

                acc[catalog][schema] = acc[catalog][schema] || {};
                acc[catalog][schema][table] = columns;

                return acc;
            },
            { [catalog]: {} } as WarehouseCatalog,
        );
    }

    getStringQuoteChar() {
        return "'";
    }

    getAdapterType(): SupportedDbtAdapter {
        return SupportedDbtAdapter.DATABRICKS;
    }

    getEscapeStringQuoteChar() {
        return '\\';
    }

    getMetricSql(sql: string, metric: Metric) {
        switch (metric.type) {
            case MetricType.PERCENTILE:
                return `PERCENTILE(${sql}, ${(metric.percentile ?? 50) / 100})`;
            case MetricType.MEDIAN:
                return `PERCENTILE(${sql}, 0.5)`;
            default:
                return super.getMetricSql(sql, metric);
        }
    }
}
