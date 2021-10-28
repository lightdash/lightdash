import { CreateBigqueryCredentials, DimensionType } from 'common';
import {
    BigQuery,
    BigQueryDate,
    BigQueryDatetime,
    BigQueryTime,
    BigQueryTimestamp,
    Dataset,
} from '@google-cloud/bigquery';
import bigquery from '@google-cloud/bigquery/build/src/types';
import { WarehouseConnectionError, WarehouseQueryError } from '../../errors';
import {
    QueryRunner,
    SchemaStructure,
    WarehouseSchema,
    WarehouseTableSchema,
} from '../../types';

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

const mapFieldType = (type: string): DimensionType => {
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

export default class BigqueryWarehouseClient implements QueryRunner {
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
        } catch (e) {
            throw new WarehouseConnectionError(e.message);
        }
    }

    async runQuery(query: string): Promise<Record<string, any>[]> {
        try {
            const [job] = await this.client.createQueryJob({
                query,
                useLegacySql: false,
                maximumBytesBilled: `${this.credentials.maximumBytesBilled}`,
                priority: this.credentials.priority,
                jobTimeoutMs: this.credentials.timeoutSeconds * 1000,
            });
            // auto paginate - hides full response
            const [rows] = await job.getQueryResults({ autoPaginate: true });
            return parseRows(rows);
        } catch (e) {
            throw new WarehouseQueryError(e.message);
        }
    }

    async test(): Promise<void> {
        await this.runQuery('SELECT 1');
    }

    static async getTableMetadata(
        dataset: Dataset,
        database: string,
        schema: string,
        table: string,
    ): Promise<[string, string, string, TableSchema]> {
        const [metadata] = await dataset.table(table).getMetadata();
        return [
            database,
            schema,
            table,
            isTableSchema(metadata?.schema) ? metadata.schema : { fields: [] },
        ];
    }

    async getSchema(config: SchemaStructure) {
        const tablesMetadataPromises = Object.entries(config).reduce<
            Promise<[string, string, string, TableSchema]>[]
        >((sum, [database, databaseStructure]) => {
            const databaseClient = new BigQuery({
                projectId: database,
                location: this.credentials.location,
                maxRetries: this.credentials.retries,
                credentials: this.credentials.keyfileContents,
            });

            Object.entries(databaseStructure).forEach(
                ([schema, schemaStructure]) => {
                    const dataset = databaseClient.dataset(schema);
                    Object.keys(schemaStructure).forEach((table) => {
                        sum.push(
                            BigqueryWarehouseClient.getTableMetadata(
                                dataset,
                                database,
                                schema,
                                table,
                            ),
                        );
                    });
                },
            );

            return sum;
        }, []);

        const tablesMetadata = await Promise.all(tablesMetadataPromises);

        return tablesMetadata.reduce<WarehouseSchema>(
            (acc, [database, schema, table, tableSchema]) => {
                const wantedColumns = config[database][schema][table];
                acc[database] = acc[database] || {};
                acc[database][schema] = acc[database][schema] || {};
                acc[database][schema][table] =
                    tableSchema.fields.reduce<WarehouseTableSchema>(
                        (sum, { name, type }) =>
                            wantedColumns.includes(name)
                                ? {
                                      ...sum,
                                      [name]: mapFieldType(type),
                                  }
                                : { ...sum },
                        {},
                    );
                return acc;
            },
            {},
        );
    }
}
