import {
    BigQuery,
    BigQueryDate,
    BigQueryDatetime,
    BigQueryTime,
    BigQueryTimestamp,
    Dataset,
} from '@google-cloud/bigquery';
import bigquery from '@google-cloud/bigquery/build/src/types';
import {
    CreateBigqueryCredentials,
    DimensionType,
    Metric,
    MetricType,
    PartitionColumn,
    PartitionType,
    SupportedDbtAdapter,
    WarehouseConnectionError,
    WarehouseQueryError,
    WarehouseResults,
} from '@lightdash/common';
import { pipeline, Transform, Writable } from 'stream';
import { WarehouseCatalog, WarehouseTableSchema } from '../types';
import WarehouseBaseClient from './WarehouseBaseClient';

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

const parseCell = (cell: any) => {
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

const parseRow = (row: Record<string, any>[]) =>
    Object.fromEntries(
        Object.entries(row).map(([name, value]) => [name, parseCell(value)]),
    );

export class BigqueryWarehouseClient extends WarehouseBaseClient<CreateBigqueryCredentials> {
    client: BigQuery;

    constructor(credentials: CreateBigqueryCredentials) {
        super(credentials);
        try {
            this.client = new BigQuery({
                projectId: credentials.executionProject || credentials.project,
                location: credentials.location,
                maxRetries: credentials.retries,
                credentials: credentials.keyfileContents,
            });
        } catch (e) {
            throw new WarehouseConnectionError(
                `Failed connection to ${credentials.project} in ${credentials.location}. ${e.message}`,
            );
        }
    }

    async streamQuery(
        query: string,
        streamCallback: (data: WarehouseResults) => void,
        options: {
            values?: any[];
            tags?: Record<string, string>;
            timezone?: string;
        },
    ): Promise<void> {
        try {
            const [job] = await this.client.createQueryJob({
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
                labels: options?.tags,
            });

            // Get the full api response but we can request zero rows
            const [, , response] = await job.getQueryResults({
                autoPaginate: false, // v. important, without this we wouldn't get the apiResponse object
                maxApiCalls: 1, // only allow one api call - not sure how essential this is
                maxResults: 0, // don't fetch any results
            });

            const fields = (response?.schema?.fields || []).reduce<
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

            const streamPromise = new Promise<void>((resolve, reject) => {
                pipeline(
                    job.getQueryResultsStream(),
                    new Transform({
                        objectMode: true,
                        transform(chunk, _encoding, callback) {
                            callback(null, parseRow(chunk));
                        },
                    }),
                    new Writable({
                        objectMode: true,
                        write(chunk, _encoding, callback) {
                            streamCallback({ fields, rows: [chunk] });
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

            await streamPromise;
        } catch (e) {
            const response = e?.response as bigquery.IJob;
            const responseError = response?.status?.errorResult || e;
            throw this.parseError(responseError, query);
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
        const tablesMetadataPromises: Promise<
            [string, string, string, TableSchema] | undefined
        >[] = requests.map(({ database, schema, table }) => {
            const dataset: Dataset = new Dataset(this.client, schema, {
                projectId: database,
            });
            return BigqueryWarehouseClient.getTableMetadata(
                dataset,
                table,
            ).catch((e) => {
                if (e?.code === 404) {
                    // Ignore error and let UI show invalid table
                    return undefined;
                }
                throw new WarehouseConnectionError(
                    `Failed to fetch table metadata for '${database}.${schema}.${table}'. ${e.message}`,
                );
            });
        });

        const tablesMetadata = await Promise.all(tablesMetadataPromises);

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

    getStringQuoteChar() {
        return "'";
    }

    getEscapeStringQuoteChar() {
        return '\\';
    }

    getAdapterType(): SupportedDbtAdapter {
        return SupportedDbtAdapter.BIGQUERY;
    }

    getMetricSql(sql: string, metric: Metric) {
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
                        `Error fetching partition info for dataset ${dataset.id}:`,
                        error,
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
            return new WarehouseQueryError(error?.message || 'Unknown error');
        }
        switch (error?.reason) {
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
        // otherwise return a generic error
        return new WarehouseQueryError(error?.message || 'Unknown error');
    }
}
