import {
    AthenaClient,
    GetQueryExecutionCommand,
    GetQueryResultsCommand,
    GetTableMetadataCommand,
    ListTableMetadataCommand,
    QueryExecutionState,
    StartQueryExecutionCommand,
} from '@aws-sdk/client-athena';
import { fromTemporaryCredentials } from '@aws-sdk/credential-providers';
import {
    AnyType,
    AthenaAuthenticationType,
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

const AWS_AUTH_ERROR_NAMES = new Set([
    'UnrecognizedClientException',
    'InvalidClientTokenId',
    'InvalidSignatureException',
    'SignatureDoesNotMatch',
    'ExpiredToken',
    'ExpiredTokenException',
    'CredentialsProviderError',
    'CredentialsError',
    'MissingAuthenticationToken',
    'MissingAuthenticationTokenException',
]);

const getAuthErrorHint = (awsErrorName: string): string => {
    switch (awsErrorName) {
        case 'UnrecognizedClientException':
        case 'InvalidClientTokenId':
            return 'AWS rejected the access key ID. Check the access key in your project settings is correct and the IAM user is enabled.';
        case 'InvalidSignatureException':
        case 'SignatureDoesNotMatch':
            return 'AWS rejected the request signature. Check the secret access key matches the access key ID, and that your system clock is in sync.';
        case 'ExpiredToken':
        case 'ExpiredTokenException':
            return 'AWS credentials have expired. If you are using temporary or assume-role credentials, generate new ones.';
        case 'CredentialsProviderError':
        case 'CredentialsError':
        case 'MissingAuthenticationToken':
        case 'MissingAuthenticationTokenException':
            return 'No AWS credentials could be loaded. If using IAM Role authentication, make sure the host has an attached role with Athena access.';
        default:
            return '';
    }
};

// Translates a raw error from the AWS SDK (or anywhere else thrown out of an
// Athena client.send call) into a Lightdash error. Auth/credential failures
// are surfaced as WarehouseConnectionError so the UI categorizes them as a
// project-config problem rather than a query problem.
const translateAthenaError = (
    error: unknown,
    options: {
        contextPrefix?: string;
        defaultErrorClass?: 'connection' | 'query';
    } = {},
): Error => {
    const err = error as {
        name?: string;
        message?: string;
        $metadata?: { httpStatusCode?: number };
    };
    const awsErrorName =
        typeof err?.name === 'string' &&
        err.name !== 'Error' &&
        !err.name.startsWith('Warehouse')
            ? err.name
            : undefined;
    const httpStatusCode =
        typeof err?.$metadata?.httpStatusCode === 'number'
            ? err.$metadata.httpStatusCode
            : undefined;

    const baseMessage = getErrorMessage(error);
    const hint = awsErrorName ? getAuthErrorHint(awsErrorName) : '';

    // e.g. "[UnrecognizedClientException 403]" or "[403]" if name is missing.
    const tag = [awsErrorName, httpStatusCode]
        .filter((p) => p !== undefined && p !== '')
        .join(' ');

    const messageParts = [
        options.contextPrefix,
        tag.length > 0 ? `[${tag}]` : null,
        baseMessage,
        hint,
    ].filter((p): p is string => typeof p === 'string' && p.length > 0);
    const fullMessage = messageParts.join(' ');

    // Auth signal precedence: known AWS error name first; otherwise fall back
    // to HTTP 401 which is unambiguously an authentication failure. We do
    // *not* fall back on 403 — it also covers IAM permission gaps (e.g.
    // missing athena:ListTableMetadata), which are query-time problems and
    // belong in WarehouseQueryError unless the caller asks otherwise.
    const isAuthError =
        (awsErrorName !== undefined &&
            AWS_AUTH_ERROR_NAMES.has(awsErrorName)) ||
        httpStatusCode === 401;
    if (isAuthError || options.defaultErrorClass === 'connection') {
        return new WarehouseConnectionError(fullMessage);
    }
    return new WarehouseQueryError(fullMessage);
};

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
            const authenticationType =
                credentials.authenticationType ??
                AthenaAuthenticationType.ACCESS_KEY;

            const hasAccessKeyCredentials =
                !!credentials.accessKeyId && !!credentials.secretAccessKey;

            if (
                authenticationType === AthenaAuthenticationType.ACCESS_KEY &&
                !hasAccessKeyCredentials
            ) {
                throw new WarehouseConnectionError(
                    'Athena access key authentication requires accessKeyId and secretAccessKey',
                );
            }

            const clientConfig: ConstructorParameters<typeof AthenaClient>[0] =
                {
                    region: credentials.region,
                };

            // Configure authentication with access key credentials
            if (authenticationType === AthenaAuthenticationType.ACCESS_KEY) {
                clientConfig.credentials = {
                    accessKeyId: credentials.accessKeyId!,
                    secretAccessKey: credentials.secretAccessKey!,
                };
            }

            // Wrap with assume role if configured
            if (credentials.assumeRoleArn) {
                clientConfig.credentials = fromTemporaryCredentials({
                    masterCredentials: clientConfig.credentials,
                    params: {
                        RoleArn: credentials.assumeRoleArn,
                        RoleSessionName: 'lightdash-athena-session',
                        ExternalId:
                            credentials.assumeRoleExternalId || undefined,
                    },
                });
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
                    throw translateAthenaError(e, {
                        contextPrefix: `Failed to fetch table metadata for '${database}.${schema}.${table}'.`,
                        defaultErrorClass: 'connection',
                    });
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
            throw translateAthenaError(e, {
                contextPrefix: `Failed to list tables in '${this.credentials.database}.${this.credentials.schema}'.`,
                defaultErrorClass: 'connection',
            });
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
            throw translateAthenaError(e, {
                contextPrefix: `Failed to get fields for table '${db}.${sch}.${tableName}'.`,
                defaultErrorClass: 'connection',
            });
        }
    }

    parseError(error: Error): Error {
        return translateAthenaError(error);
    }
}
