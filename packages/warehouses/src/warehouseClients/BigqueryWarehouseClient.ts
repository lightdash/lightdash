import {
    BigQuery,
    BigQueryDate,
    BigQueryDatetime,
    BigQueryTime,
    BigQueryTimestamp,
    Dataset,
    Job,
    QueryResultsOptions,
    QueryRowsResponse,
} from '@google-cloud/bigquery';
import bigquery from '@google-cloud/bigquery/build/src/types';
import {
    AnyType,
    BigqueryDataset,
    CreateBigqueryCredentials,
    DimensionType,
    getErrorMessage,
    Metric,
    MetricType,
    PartitionColumn,
    PartitionType,
    SupportedDbtAdapter,
    WarehouseConnectionError,
    WarehouseQueryError,
    WarehouseResults,
    WarehouseTypes,
} from '@lightdash/common';
import { pipeline, Transform } from 'stream';
import {
    WarehouseCatalog,
    WarehouseExecuteAsyncQuery,
    WarehouseExecuteAsyncQueryArgs,
    WarehouseTableSchema,
} from '../types';
import {
    DEFAULT_BATCH_SIZE,
    processPromisesInBatches,
} from '../utils/processPromisesInBatches';
import WarehouseBaseClient from './WarehouseBaseClient';
import WarehouseBaseSqlBuilder from './WarehouseBaseSqlBuilder';

export enum BigqueryFieldType {
    STRING = 'STRING',
    INTEGER = 'INTEGER',
    BYTES = 'BYTES',
    INT64 = 'INT64',
    FLOAT = 'FLOAT',
    FLOAT64 = 'FLOAT64',
    BOOLEAN = 'BOOLEAN',
    BOOL = 'BOOL',
    TIMESTAMP = 'TIMESTAMP',
    DATE = 'DATE',
    TIME = 'TIME',
    DATETIME = 'DATETIME',
    GEOGRAPHY = 'GEOGRAPHY',
    NUMERIC = 'NUMERIC',
    BIGNUMERIC = 'BIGNUMERIC',
    RECORD = 'RECORD',
    STRUCT = 'STRUCT',
    ARRAY = 'ARRAY',
}

const parseCell = (cell: AnyType) => {
    if (
        cell === undefined ||
        cell === null ||
        typeof cell === 'boolean' ||
        typeof cell === 'number'
    ) {
        return cell;
    }

    if (
        cell instanceof BigQueryDate ||
        cell instanceof BigQueryTimestamp ||
        cell instanceof BigQueryDatetime ||
        cell instanceof BigQueryTime
    ) {
        return new Date(cell.value);
    }

    return `${cell}`;
};

const mapFieldType = (type: string | undefined): DimensionType => {
    switch (type) {
        case BigqueryFieldType.DATE:
            return DimensionType.DATE;
        case BigqueryFieldType.DATETIME:
        case BigqueryFieldType.TIMESTAMP:
        case BigqueryFieldType.TIME:
            return DimensionType.TIMESTAMP;
        case BigqueryFieldType.INTEGER:
        case BigqueryFieldType.FLOAT:
        case BigqueryFieldType.FLOAT64:
        case BigqueryFieldType.BYTES:
        case BigqueryFieldType.INT64:
        case BigqueryFieldType.NUMERIC:
        case BigqueryFieldType.BIGNUMERIC:
            return DimensionType.NUMBER;
        case BigqueryFieldType.BOOL:
        case BigqueryFieldType.BOOLEAN:
            return DimensionType.BOOLEAN;
        default:
            return DimensionType.STRING;
    }
};

type TableSchema = {
    fields: SchemaFields[];
};

type SchemaFields = Required<Pick<bigquery.ITableFieldSchema, 'name' | 'type'>>;

const isSchemaFields = (
    rawSchemaFields: bigquery.ITableFieldSchema[],
): rawSchemaFields is SchemaFields[] =>
    rawSchemaFields.every((field) => field.type && field.name);

const isTableSchema = (schema: bigquery.ITableSchema): schema is TableSchema =>
    !!schema && !!schema.fields && isSchemaFields(schema.fields);

const parseRow = (row: Record<string, AnyType>[]) =>
    Object.fromEntries(
        Object.entries(row).map(([name, value]) => [name, parseCell(value)]),
    );

type BigqueryError = {
    errors: bigquery.IErrorProto[];
};

export class BigquerySqlBuilder extends WarehouseBaseSqlBuilder {
    readonly type = WarehouseTypes.BIGQUERY;

    getAdapterType(): SupportedDbtAdapter {
        return SupportedDbtAdapter.BIGQUERY;
    }

    getMetricSql(sql: string, metric: Metric): string {
        switch (metric.type) {
            case MetricType.PERCENTILE:
                return `APPROX_QUANTILES(${sql}, 100)[OFFSET(${
                    metric.percentile ?? 50
                })]`;
            case MetricType.MEDIAN:
                return `APPROX_QUANTILES(${sql}, 100)[OFFSET(50)]`;
            default:
                return super.getMetricSql(sql, metric);
        }
    }

    getFieldQuoteChar(): string {
        return '`';
    }
}

export class BigqueryWarehouseClient extends WarehouseBaseClient<CreateBigqueryCredentials> {
    client: BigQuery;

    constructor(credentials: CreateBigqueryCredentials) {
        super(credentials, new BigquerySqlBuilder(credentials.startOfWeek));
        try {
            this.client = new BigQuery({
                projectId: credentials.executionProject || credentials.project,
                location: credentials.location,
                maxRetries: credentials.retries,
                credentials: credentials.keyfileContents,
            });
        } catch (e: unknown) {
            throw new WarehouseConnectionError(
                `Failed connection to ${credentials.project} in ${
                    credentials.location
                }. ${getErrorMessage(e)}`,
            );
        }
    }

    static isBigqueryError(error: unknown): error is BigqueryError {
        return error !== null && typeof error === 'object' && 'errors' in error;
    }

    /**
     * Sanitize label key and values.
     * Keys and values can contain only lowercase letters, numeric characters, underscores, and dashes. All characters must use UTF-8 encoding, and international characters are allowed.
     * But also, keys can't be longer than 60 characters, or empty.
     */
    static sanitizeLabelsWithValues(
        labels?: Record<string, string>,
    ): Record<string, string> | undefined {
        return labels
            ? Object.fromEntries(
                  Object.entries(labels).map(([key, value]) => [
                      key
                          .toLowerCase()
                          .replace(/[^a-z0-9_-]/g, '_')
                          .substring(0, 60) || 'empty_key',
                      value
                          .toLowerCase()
                          .replace(/[^a-z0-9_-]/g, '_')
                          .substring(0, 60) || 'empty_value',
                  ]),
              )
            : undefined;
    }

    static getFieldsFromResponse(response: QueryRowsResponse[2] | undefined) {
        return (response?.schema?.fields || []).reduce<
            Record<string, { type: DimensionType }>
        >((acc, field) => {
            if (field.name) {
                return {
                    ...acc,
                    [field.name]: { type: mapFieldType(field.type) },
                };
            }
            return acc;
        }, {});
    }

    private async createJob(
        query: string,
        options: {
            values?: AnyType[];
            tags?: Record<string, string>;
        },
    ) {
        return this.client.createQueryJob({
            query,
            params: options?.values,
            useLegacySql: false,
            maximumBytesBilled:
                this.credentials.maximumBytesBilled === undefined
                    ? undefined
                    : `${this.credentials.maximumBytesBilled}`,
            priority: this.credentials.priority,
            jobTimeoutMs:
                this.credentials.timeoutSeconds &&
                this.credentials.timeoutSeconds * 1000,
            labels: BigqueryWarehouseClient.sanitizeLabelsWithValues(
                options?.tags,
            ),
        });
    }

    private async getJob(id: string, location: string) {
        const [job] = await this.client
            .job(id, {
                location, // Bigquery can't find a job unless we define the location.
            })
            .get({
                autoCreate: false,
            });
        return job;
    }

    private async getJobResultsMetadata(job: Job) {
        // Get the full api response but we can request zero rows
        const [, , response] = await job.getQueryResults({
            autoPaginate: false, // v. important, without this we wouldn't get the apiResponse object
            maxApiCalls: 1, // only allow one api call - not sure how essential this is
            maxResults: 0, // don't fetch any results
        });
        return response;
    }

    private async streamResults(
        job: Job,
        streamCallback: (data: WarehouseResults['rows'][number]) => void,
        options: QueryResultsOptions = {},
    ) {
        return new Promise<void>((resolve, reject) => {
            pipeline(
                job.getQueryResultsStream(options),
                new Transform({
                    objectMode: true,
                    transform(chunk, _encoding, callback) {
                        const chunkParsed = parseRow(chunk);
                        streamCallback(chunkParsed);
                        callback();
                    },
                }),
                async (err) => {
                    if (err) {
                        reject(err);
                    }
                    resolve();
                },
            );
        });
    }

    async streamQuery(
        query: string,
        streamCallback: (data: WarehouseResults) => void,
        options: {
            values?: AnyType[];
            tags?: Record<string, string>;
            timezone?: string;
        },
    ): Promise<void> {
        try {
            const [job] = await this.createJob(query, options);

            const resultsMetadata = await this.getJobResultsMetadata(job);

            const fields =
                BigqueryWarehouseClient.getFieldsFromResponse(resultsMetadata);

            await this.streamResults(job, (chunk) =>
                streamCallback({ fields, rows: [chunk] }),
            );
        } catch (e: unknown) {
            if (BigqueryWarehouseClient.isBigqueryError(e)) {
                const responseError: bigquery.IErrorProto | undefined =
                    e?.errors[0];
                if (responseError) {
                    throw this.parseError(responseError, query);
                }
            }
            throw e;
        }
    }

    static async getTableMetadata(
        dataset: Dataset,
        table: string,
    ): Promise<[string, string, string, TableSchema]> {
        const [metadata] = await dataset.table(table).getMetadata();

        return [
            dataset.projectId,
            dataset.id!,
            table,
            isTableSchema(metadata?.schema) ? metadata.schema : { fields: [] },
        ];
    }

    async getCatalog(
        requests: {
            database: string;
            schema: string;
            table: string;
        }[],
    ) {
        const tablesMetadata = await processPromisesInBatches(
            requests,
            DEFAULT_BATCH_SIZE,
            async ({ database, schema, table }) => {
                const dataset: Dataset = new Dataset(this.client, schema, {
                    projectId: database,
                });

                return BigqueryWarehouseClient.getTableMetadata(
                    dataset,
                    table,
                ).catch((e) => {
                    if (e?.code === 404) {
                        return undefined;
                    }
                    throw new WarehouseConnectionError(
                        `Failed to fetch table metadata for '${database}.${schema}.${table}'. ${getErrorMessage(
                            e,
                        )}`,
                    );
                });
            },
        );

        return tablesMetadata.reduce<WarehouseCatalog>((acc, result) => {
            if (result) {
                const [database, schema, table, tableSchema] = result;
                acc[database] = acc[database] || {};
                acc[database][schema] = acc[database][schema] || {};
                acc[database][schema][table] =
                    tableSchema.fields.reduce<WarehouseTableSchema>(
                        (sum, { name, type }) => ({
                            ...sum,
                            [name]: mapFieldType(type),
                        }),
                        {},
                    );
            }

            return acc;
        }, {});
    }

    async getAllTables() {
        const [datasets] = await this.client.getDatasets();
        const datasetTablesResponses = await Promise.all(
            datasets.map((d) => d.getTables()),
        );

        const datasetMetadata = await Promise.all(
            datasets.map(async (dataset) => {
                try {
                    const [rows] = await this.client.query(`
                        SELECT table_name, column_name, data_type
                        FROM \`${dataset.id}.INFORMATION_SCHEMA.COLUMNS\`
                        WHERE is_partitioning_column = "YES"
                    `);
                    return {
                        datasetId: dataset.id,
                        partitionColumns: rows,
                    };
                } catch (error) {
                    console.error(
                        `Error fetching partition info for dataset ${
                            dataset.id
                        }: ${getErrorMessage(error)}`,
                    );
                    return {
                        datasetId: dataset.id,
                        partitionColumns: [],
                    };
                }
            }),
        );

        return datasetTablesResponses.flatMap(([tables]) =>
            tables.map((t) => {
                const datasetPartitionInfo = datasetMetadata.find(
                    (d) => d.datasetId === t.dataset.id,
                );
                const tablePartitionInfo =
                    datasetPartitionInfo?.partitionColumns.find(
                        (pc) => pc.table_name === t.id,
                    );
                const partitionColumn: PartitionColumn | undefined =
                    tablePartitionInfo
                        ? {
                              field: tablePartitionInfo.column_name,
                              partitionType:
                                  tablePartitionInfo.data_type ===
                                  BigqueryFieldType.INT64
                                      ? PartitionType.RANGE
                                      : PartitionType.DATE,
                          }
                        : undefined;

                return {
                    database: t.bigQuery.projectId,
                    schema: t.dataset.id!,
                    table: t.id!,
                    partitionColumn,
                };
            }),
        );
    }

    async getFields(
        tableName: string,
        schema: string,
        database?: string,
    ): Promise<WarehouseCatalog> {
        const dataset: Dataset = new Dataset(this.client, schema, {
            projectId: database,
        });
        const schemas = await BigqueryWarehouseClient.getTableMetadata(
            dataset,
            tableName,
        );
        return this.parseWarehouseCatalog(
            schemas[3].fields.map((column) => ({
                table_catalog: schemas[0],
                table_schema: schemas[1],
                table_name: schemas[2],
                column_name: column.name,
                data_type: column.type,
            })),
            mapFieldType,
        );
    }

    parseError(error: bigquery.IErrorProto, query: string = '') {
        // if the error has no reason, return a generic error
        if (!error?.reason) {
            return new WarehouseQueryError(getErrorMessage(error));
        }
        switch (error?.reason) {
            case 'accessDenied':
                return new WarehouseQueryError(
                    error?.message || 'Bigquery warehouse error: access denied',
                );

            // if query is mistyped
            case 'invalidQuery':
                // if the location is in query and the end of the message looks like "at [line:char]"
                if (error?.message && error?.location === 'query') {
                    // The query will look something like this:
                    // 'WITH user_sql AS (
                    //     SELECT * FROM `lightdash-database-staging`.`e2e_jaffle_shop`.`users`;
                    // ) select * from user_sql limit 500';
                    // We want to check for the first part of the query, if so strip the first and last lines
                    const queryMatch = query.match(
                        /(?:WITH\s+[a-zA-Z_]+\s+AS\s*\()\s*?/i,
                    );
                    // also match the line number and character number in the error message
                    const lineMatch = error.message.match(/at \[(\d+):(\d+)\]/);
                    if (lineMatch) {
                        // parse out line number and character number
                        let lineNumber = Number(lineMatch[1]) || undefined;
                        const charNumber = Number(lineMatch[2]) || undefined;
                        // if query match, subtract the number of lines from the line number
                        if (queryMatch && lineNumber && lineNumber > 1) {
                            lineNumber -= 1;
                        }
                        // re-inject the line and character number into the error message
                        const message = error.message.replace(
                            /at \[\d+:\d+\]/,
                            `at [${lineNumber}:${charNumber}]`,
                        );
                        // return a new error with the line and character number in data object
                        return new WarehouseQueryError(message, {
                            lineNumber,
                            charNumber,
                        });
                    }
                    break;
                }
                break;
            default:
                break;
        }
        console.error(
            `Unknown bigquery warehouse error reason: ${JSON.stringify(
                error,
                null,
                2,
            )}`,
        );
        return new WarehouseQueryError(
            `Bigquery warehouse error: ${error?.reason}`,
        );
    }

    async executeAsyncQuery(
        { sql, tags }: WarehouseExecuteAsyncQueryArgs,
        resultsStreamCallback: (
            rows: WarehouseResults['rows'],
            fields: WarehouseResults['fields'],
        ) => void,
    ): Promise<WarehouseExecuteAsyncQuery> {
        try {
            const [job] = await this.createJob(sql, {
                tags,
            });

            if (!job.id) {
                throw new WarehouseQueryError(
                    'Missing BigQuery job ID. Please contact support.',
                );
            }

            if (!job.location) {
                throw new WarehouseQueryError(
                    'Missing BigQuery job location. Please contact support.',
                );
            }

            await this.awaitJobCompletion(job);

            const resultsMetadata = await this.getJobResultsMetadata(job);
            const startTime = job.metadata?.statistics?.startTime;
            const endTime = job.metadata?.statistics?.endTime;
            const totalRows: number = resultsMetadata?.totalRows
                ? parseInt(resultsMetadata.totalRows, 10)
                : 1;
            const fields =
                BigqueryWarehouseClient.getFieldsFromResponse(resultsMetadata);

            // If a callback is provided, stream the results to the callback
            await this.streamResults(job, (row) =>
                resultsStreamCallback([row], fields),
            );

            return {
                queryId: job.id,
                queryMetadata: {
                    type: WarehouseTypes.BIGQUERY,
                    jobLocation: job.location,
                },
                totalRows,
                durationMs: startTime && endTime ? endTime - startTime : 0,
            };
        } catch (e: unknown) {
            if (BigqueryWarehouseClient.isBigqueryError(e)) {
                const responseError: bigquery.IErrorProto | undefined =
                    e?.errors[0];
                if (responseError) {
                    throw this.parseError(responseError, sql);
                }
            }
            throw e;
        }
    }

    private async awaitJobCompletion(job: Job): Promise<void> {
        return new Promise((resolve, reject) => {
            job.on('complete', () => {
                resolve();
            });
            job.on('error', (error) => {
                reject(error);
            });
        });
    }

    static async getDatabases(
        projectId: string,
        refresh_token: string,
    ): Promise<BigqueryDataset[]> {
        const bigqueryClient = new BigQuery({
            projectId,
            credentials: {
                type: 'authorized_user',
                client_id: process.env.AUTH_GOOGLE_OAUTH2_CLIENT_ID,
                client_secret: process.env.AUTH_GOOGLE_OAUTH2_CLIENT_SECRET,
                refresh_token,
            },
        });

        const datasets = await bigqueryClient.getDatasets();
        const databases = datasets[0].map((d) => ({
            projectId: d.projectId,
            location: d.location,
            datasetId: d.id!,
        }));
        return databases;
    }
}
