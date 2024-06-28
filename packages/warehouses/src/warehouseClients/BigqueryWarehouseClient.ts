import {
    BigQuery,
    BigQueryDate,
    BigQueryDatetime,
    BigQueryTime,
    BigQueryTimestamp,
    Dataset,
    Table,
} from '@google-cloud/bigquery';
import bigquery from '@google-cloud/bigquery/build/src/types';
import {
    CreateBigqueryCredentials,
    DimensionType,
    Metric,
    MetricType,
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
                projectId: credentials.project,
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
            throw new WarehouseQueryError(e.message);
        }
    }

    static async getTableMetadata(
        dataset: Dataset,
        table: string,
    ): Promise<[string, string, string, TableSchema]> {
        const [metadata] = await dataset.table(table).getMetadata();
        return [
            dataset.bigQuery.projectId,
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
        const databaseClients: { [client: string]: BigQuery } = {};
        const tablesMetadataPromises: Promise<
            [string, string, string, TableSchema] | undefined
        >[] = requests.map(({ database, schema, table }) => {
            databaseClients[database] =
                databaseClients[database] ||
                new BigQuery({
                    projectId: database,
                    location: this.credentials.location,
                    maxRetries: this.credentials.retries,
                    credentials: this.credentials.keyfileContents,
                });
            const dataset = databaseClients[database].dataset(schema);
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

    async getTables(schema: string): Promise<WarehouseCatalog> {
        const client = new BigQuery({
            projectId: this.credentials.project,
            location: this.credentials.location,
            maxRetries: this.credentials.retries,
            credentials: this.credentials.keyfileContents,
        });
        const dataset = client.dataset(schema);
        const tables = (await dataset.getTables()) as unknown as Table[];
        return this.parseWarehouseCatalog(
            tables.map((table: Table) => ({
                table_catalog: table.dataset.bigQuery.projectId,
                table_schema: table.dataset.id,
                table_name: table.id,
            })),
            mapFieldType,
        );
    }

    async getFields(
        tableName: string,
        schema: string,
    ): Promise<WarehouseCatalog> {
        const client = new BigQuery({
            projectId: this.credentials.project,
            location: this.credentials.location,
            maxRetries: this.credentials.retries,
            credentials: this.credentials.keyfileContents,
        });
        const dataset = client.dataset(schema);
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
}
