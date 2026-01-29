import {
    AthenaClient,
    GetQueryExecutionCommand,
    GetQueryResultsCommand,
    GetTableMetadataCommand,
    ListTableMetadataCommand,
    QueryExecutionState,
    StartQueryExecutionCommand,
} from '@aws-sdk/client-athena';
import {
    AnyType,
    CreateAthenaCredentials,
    DimensionType,
    getErrorMessage,
    Metric,
    MetricType,
    SupportedDbtAdapter,
    TimeIntervalUnit,
    WarehouseConnectionError,
    WarehouseQueryError,
    WarehouseResults,
    WarehouseTypes,
} from '@lightdash/common';
import { WarehouseCatalog } from '../types';
import {
    DEFAULT_BATCH_SIZE,
    processPromisesInBatches,
} from '../utils/processPromisesInBatches';
import { normalizeUnicode } from '../utils/sql';
import WarehouseBaseClient from './WarehouseBaseClient';
import WarehouseBaseSqlBuilder from './WarehouseBaseSqlBuilder';

export enum AthenaTypes {
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
    ARRAY = 'array',
    MAP = 'map',
    ROW = 'row',
    IPADDRESS = 'ipaddress',
    UUID = 'uuid',
}

const convertDataTypeToDimensionType = (
    type: AthenaTypes | string,
): DimensionType => {
    const normalizedType = type.toLowerCase().replace(/\(\d+(,\s*\d+)?\)/, '');
    switch (normalizedType) {
        case AthenaTypes.BOOLEAN:
            return DimensionType.BOOLEAN;
        case AthenaTypes.TINYINT:
        case AthenaTypes.SMALLINT:
        case AthenaTypes.INTEGER:
        case AthenaTypes.BIGINT:
        case AthenaTypes.REAL:
        case AthenaTypes.DOUBLE:
        case AthenaTypes.DECIMAL:
            return DimensionType.NUMBER;
        case AthenaTypes.DATE:
            return DimensionType.DATE;
        case AthenaTypes.TIMESTAMP:
        case AthenaTypes.TIMESTAMP_TZ:
        case AthenaTypes.TIME:
        case AthenaTypes.TIME_TZ:
            return DimensionType.TIMESTAMP;
        default:
            return DimensionType.STRING;
    }
};

// Force lowercase for column names
const normalizeColumnName = (columnName: string) => columnName.toLowerCase();

export class AthenaSqlBuilder extends WarehouseBaseSqlBuilder {
    readonly type = WarehouseTypes.ATHENA;

    getAdapterType(): SupportedDbtAdapter {
        return SupportedDbtAdapter.ATHENA;
    }

    getEscapeStringQuoteChar(): string {
        return "'";
    }

    getMetricSql(sql: string, metric: Metric): string {
        switch (metric.type) {
            case MetricType.PERCENTILE:
                return `APPROX_PERCENTILE(${sql}, ${
                    (metric.percentile ?? 50) / 100
                })`;
            case MetricType.MEDIAN:
                return `APPROX_PERCENTILE(${sql}, 0.5)`;
            default:
                return super.getMetricSql(sql, metric);
        }
    }

    getFloatingType(): string {
        return 'DOUBLE';
    }

    escapeString(value: string): string {
        if (typeof value !== 'string') {
            return value;
        }

        return (
            normalizeUnicode(value)
                // Athena uses single quote doubling like Trino
                .replaceAll("'", "''")
                // Escape backslashes
                .replaceAll('\\', '\\\\')
                // Remove SQL comments
                .replace(/--.*$/gm, '')
                .replace(/\/\*[\s\S]*?\*\//g, '')
                // Remove null bytes
                .replaceAll('\0', '')
        );
    }

    getIntervalSql(value: number, unit: TimeIntervalUnit): string {
        // Athena uses INTERVAL with quoted value and separate unit keyword
        const unitStr = AthenaSqlBuilder.intervalUnitsSingular[unit];
        return `INTERVAL '${value}' ${unitStr}`;
    }

    getTimestampDiffSeconds(
        startTimestampSql: string,
        endTimestampSql: string,
    ): string {
        // Athena uses date_diff function
        return `DATE_DIFF('second', ${startTimestampSql}, ${endTimestampSql})`;
    }

    getMedianSql(valueSql: string): string {
        // Athena uses APPROX_PERCENTILE for median
        return `APPROX_PERCENTILE(${valueSql}, 0.5)`;
    }
}

const POLL_INTERVAL_MS = 500;
const MAX_POLL_ATTEMPTS = 1200; // 10 minutes max wait

export class AthenaWarehouseClient extends WarehouseBaseClient<CreateAthenaCredentials> {
    client: AthenaClient;

    constructor(credentials: CreateAthenaCredentials) {
        super(credentials, new AthenaSqlBuilder(credentials.startOfWeek));

        try {
            const clientConfig: ConstructorParameters<typeof AthenaClient>[0] =
                {
                    region: credentials.region,
                };

            // Configure authentication with access key credentials
            if (credentials.accessKeyId && credentials.secretAccessKey) {
                clientConfig.credentials = {
                    accessKeyId: credentials.accessKeyId,
                    secretAccessKey: credentials.secretAccessKey,
                };
            }

            this.client = new AthenaClient(clientConfig);
        } catch (e: unknown) {
            throw new WarehouseConnectionError(
                `Failed to create Athena client for region ${
                    credentials.region
                }. ${getErrorMessage(e)}`,
            );
        }
    }

    private async waitForQueryCompletion(
        queryExecutionId: string,
    ): Promise<void> {
        let attempts = 0;

        while (attempts < MAX_POLL_ATTEMPTS) {
            // eslint-disable-next-line no-await-in-loop
            const statusResponse = await this.client.send(
                new GetQueryExecutionCommand({
                    QueryExecutionId: queryExecutionId,
                }),
            );

            const state = statusResponse.QueryExecution?.Status
                ?.State as QueryExecutionState;

            switch (state) {
                case QueryExecutionState.SUCCEEDED:
                    return;
                case QueryExecutionState.FAILED:
                    throw new WarehouseQueryError(
                        statusResponse.QueryExecution?.Status
                            ?.StateChangeReason ||
                            'Query execution failed with no reason provided',
                    );
                case QueryExecutionState.CANCELLED:
                    throw new WarehouseQueryError('Query was cancelled');
                case QueryExecutionState.QUEUED:
                case QueryExecutionState.RUNNING:
                    // Continue polling
                    break;
                default:
                    throw new WarehouseQueryError(
                        `Unknown query state: ${state}`,
                    );
            }

            // eslint-disable-next-line no-await-in-loop
            await new Promise((resolve) => {
                setTimeout(resolve, POLL_INTERVAL_MS);
            });
            attempts += 1;
        }

        throw new WarehouseQueryError(
            'Query timed out waiting for completion after 10 minutes',
        );
    }

    private parseValue(value: string | undefined, type: string): AnyType {
        if (value === undefined || value === null) {
            return null;
        }

        const normalizedType = type
            .toLowerCase()
            .replace(/\(\d+(,\s*\d+)?\)/, '');

        switch (normalizedType) {
            case AthenaTypes.BOOLEAN:
                return value.toLowerCase() === 'true';
            case AthenaTypes.TINYINT:
            case AthenaTypes.SMALLINT:
            case AthenaTypes.INTEGER:
            case AthenaTypes.BIGINT:
                return parseInt(value, 10);
            case AthenaTypes.REAL:
            case AthenaTypes.DOUBLE:
            case AthenaTypes.DECIMAL:
                return parseFloat(value);
            case AthenaTypes.DATE:
            case AthenaTypes.TIMESTAMP:
            case AthenaTypes.TIMESTAMP_TZ:
                return new Date(value);
            default:
                return value;
        }
    }

    async streamQuery(
        sql: string,
        streamCallback: (data: WarehouseResults) => void | Promise<void>,
        options: {
            tags?: Record<string, string>;
            timezone?: string;
        },
    ): Promise<void> {
        try {
            let alteredQuery = sql;
            if (options?.tags) {
                alteredQuery = `${alteredQuery}\n-- ${JSON.stringify(
                    options.tags,
                )}`;
            }

            // Start query execution
            const startResponse = await this.client.send(
                new StartQueryExecutionCommand({
                    QueryString: alteredQuery,
                    QueryExecutionContext: {
                        Database: this.credentials.schema,
                        Catalog: this.credentials.database,
                    },
                    ResultConfiguration: {
                        OutputLocation: this.credentials.s3StagingDir,
                    },
                    WorkGroup: this.credentials.workGroup,
                }),
            );

            const queryExecutionId = startResponse.QueryExecutionId;
            if (!queryExecutionId) {
                throw new WarehouseQueryError(
                    'No query execution ID returned from Athena',
                );
            }

            // Wait for query to complete
            await this.waitForQueryCompletion(queryExecutionId);

            // Stream results using pagination
            let nextToken: string | undefined;
            let isFirstBatch = true;
            let fields: Record<string, { type: DimensionType }> = {};

            do {
                // eslint-disable-next-line no-await-in-loop
                const resultsResponse = await this.client.send(
                    new GetQueryResultsCommand({
                        QueryExecutionId: queryExecutionId,
                        NextToken: nextToken,
                        MaxResults: 1000,
                    }),
                );

                const resultSet = resultsResponse.ResultSet;
                const columnInfo = resultSet?.ResultSetMetadata?.ColumnInfo;
                const dataRows = resultSet?.Rows || [];

                // Parse fields from metadata (only on first batch)
                if (isFirstBatch && columnInfo) {
                    fields = columnInfo.reduce<
                        Record<string, { type: DimensionType }>
                    >((acc, col) => {
                        if (col.Name) {
                            acc[normalizeColumnName(col.Name)] = {
                                type: convertDataTypeToDimensionType(
                                    col.Type || 'varchar',
                                ),
                            };
                        }
                        return acc;
                    }, {});
                }

                // Skip header row on first batch
                const rowsToProcess = isFirstBatch
                    ? dataRows.slice(1)
                    : dataRows;

                // Parse rows
                const rows = rowsToProcess.map((row) => {
                    const rowData: Record<string, AnyType> = {};
                    row.Data?.forEach((cell, index) => {
                        if (columnInfo && columnInfo[index]?.Name) {
                            const colName = normalizeColumnName(
                                columnInfo[index].Name!,
                            );
                            const colType = columnInfo[index].Type || 'varchar';
                            rowData[colName] = this.parseValue(
                                cell.VarCharValue,
                                colType,
                            );
                        }
                    });
                    return rowData;
                });

                if (rows.length > 0) {
                    // eslint-disable-next-line no-await-in-loop
                    await streamCallback({ fields, rows });
                }

                nextToken = resultsResponse.NextToken;
                isFirstBatch = false;
            } while (nextToken);
        } catch (e: unknown) {
            throw this.parseError(e as Error);
        }
    }

    async getCatalog(
        requests: { database: string; schema: string; table: string }[],
    ): Promise<WarehouseCatalog> {
        const results = await processPromisesInBatches(
            requests,
            DEFAULT_BATCH_SIZE,
            async ({ database, schema, table }) => {
                try {
                    const response = await this.client.send(
                        new GetTableMetadataCommand({
                            CatalogName: database,
                            DatabaseName: schema,
                            TableName: table,
                        }),
                    );

                    const columns =
                        response.TableMetadata?.Columns?.map((col) => ({
                            name: col.Name || '',
                            type: col.Type || 'varchar',
                        })) || [];

                    return { database, schema, table, columns };
                } catch (e: unknown) {
                    // Table not found - return undefined
                    const error = e as { name?: string };
                    if (error.name === 'MetadataException') {
                        return undefined;
                    }
                    throw new WarehouseConnectionError(
                        `Failed to fetch table metadata for '${database}.${schema}.${table}'. ${getErrorMessage(
                            e,
                        )}`,
                    );
                }
            },
        );

        return results.reduce<WarehouseCatalog>((acc, result) => {
            if (result) {
                const { database, schema, table, columns } = result;
                acc[database] = acc[database] || {};
                acc[database][schema] = acc[database][schema] || {};
                acc[database][schema][table] = columns.reduce<
                    Record<string, DimensionType>
                >(
                    (colAcc, { name, type }) => ({
                        ...colAcc,
                        [normalizeColumnName(name)]:
                            convertDataTypeToDimensionType(type),
                    }),
                    {},
                );
            }
            return acc;
        }, {});
    }

    async getAllTables(): Promise<
        { database: string; schema: string; table: string }[]
    > {
        const tables: { database: string; schema: string; table: string }[] =
            [];

        try {
            let nextToken: string | undefined;

            do {
                // eslint-disable-next-line no-await-in-loop
                const response = await this.client.send(
                    new ListTableMetadataCommand({
                        CatalogName: this.credentials.database,
                        DatabaseName: this.credentials.schema,
                        NextToken: nextToken,
                        MaxResults: 50,
                    }),
                );

                response.TableMetadataList?.forEach((tableMeta) => {
                    if (tableMeta.Name) {
                        tables.push({
                            database: this.credentials.database,
                            schema: this.credentials.schema,
                            table: tableMeta.Name,
                        });
                    }
                });

                nextToken = response.NextToken;
            } while (nextToken);
        } catch (e: unknown) {
            throw new WarehouseConnectionError(
                `Failed to list tables in '${this.credentials.database}.${
                    this.credentials.schema
                }'. ${getErrorMessage(e)}`,
            );
        }

        return tables;
    }

    async getFields(
        tableName: string,
        schema?: string,
        database?: string,
    ): Promise<WarehouseCatalog> {
        const db = database || this.credentials.database;
        const sch = schema || this.credentials.schema;

        try {
            const response = await this.client.send(
                new GetTableMetadataCommand({
                    CatalogName: db,
                    DatabaseName: sch,
                    TableName: tableName,
                }),
            );

            const columns = response.TableMetadata?.Columns || [];
            const result: WarehouseCatalog = {
                [db]: {
                    [sch]: {
                        [tableName]: columns.reduce<
                            Record<string, DimensionType>
                        >(
                            (acc, col) => ({
                                ...acc,
                                [normalizeColumnName(col.Name || '')]:
                                    convertDataTypeToDimensionType(
                                        col.Type || 'varchar',
                                    ),
                            }),
                            {},
                        ),
                    },
                },
            };

            return result;
        } catch (e: unknown) {
            throw new WarehouseConnectionError(
                `Failed to get fields for table '${db}.${sch}.${tableName}'. ${getErrorMessage(
                    e,
                )}`,
            );
        }
    }

    parseError(error: Error): Error {
        return new WarehouseQueryError(getErrorMessage(error));
    }
}
