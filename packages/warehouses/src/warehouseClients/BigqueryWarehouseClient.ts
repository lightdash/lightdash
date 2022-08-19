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
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import {
    WarehouseCatalog,
    WarehouseClient,
    WarehouseTableSchema,
} from '../types';

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

const parseRows = (rows: Record<string, any>[]) =>
    rows.map((row) =>
        Object.fromEntries(
            Object.entries(row).map(([name, value]) => [
                name,
                parseCell(value),
            ]),
        ),
    );

export class BigqueryWarehouseClient implements WarehouseClient {
    client: BigQuery;

    credentials: CreateBigqueryCredentials;

    constructor(credentials: CreateBigqueryCredentials) {
        try {
            this.credentials = credentials;
            this.client = new BigQuery({
                projectId: credentials.project,
                location: credentials.location,
                maxRetries: credentials.retries,
                credentials: credentials.keyfileContents,
            });
        } catch (e: any) {
            throw new WarehouseConnectionError(
                `Failed connection to ${credentials.project} in ${credentials.location}. ${e.message}`,
            );
        }
    }

    async runQuery(query: string) {
        try {
            const [job] = await this.client.createQueryJob({
                query,
                useLegacySql: false,
                maximumBytesBilled:
                    this.credentials.maximumBytesBilled === undefined
                        ? undefined
                        : `${this.credentials.maximumBytesBilled}`,
                priority: this.credentials.priority,
                jobTimeoutMs:
                    this.credentials.timeoutSeconds &&
                    this.credentials.timeoutSeconds * 1000,
            });
            // auto paginate - hides full response
            const [rows] = await job.getQueryResults({
                autoPaginate: true,
            });
            const [, , response] = await job.getQueryResults({
                autoPaginate: false,
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
            return { fields, rows: parseRows(rows) };
        } catch (e: any) {
            throw new WarehouseQueryError(e.message);
        }
    }

    async test(): Promise<void> {
        await this.runQuery('SELECT 1');
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
}
