import {
    AnyType,
    CreateWarehouseCredentials,
    DimensionType,
    Metric,
    PartitionColumn,
    SupportedDbtAdapter,
    WarehouseCatalog,
    WarehouseResults,
    WeekDay,
    type WarehouseExecuteAsyncQuery,
    type WarehouseExecuteAsyncQueryArgs,
} from '@lightdash/common';
import {
    type WarehouseClient,
    type WarehouseGetAsyncQueryResults,
    type WarehouseGetAsyncQueryResultsArgs,
} from '../types';
import { getDefaultMetricSql } from '../utils/sql';

export default class WarehouseBaseClient<T extends CreateWarehouseCredentials>
    implements WarehouseClient
{
    credentials: T;

    startOfWeek: WeekDay | null | undefined;

    constructor(credentials: T) {
        this.credentials = credentials;
        this.startOfWeek = credentials.startOfWeek;
    }

    getAdapterType(): SupportedDbtAdapter {
        throw new Error('Warehouse method not implemented.');
    }

    getStringQuoteChar(): string {
        throw new Error('Warehouse method not implemented.');
    }

    getEscapeStringQuoteChar(): string {
        throw new Error('Warehouse method not implemented.');
    }

    async getCatalog(
        config: { database: string; schema: string; table: string }[],
    ): Promise<WarehouseCatalog> {
        throw new Error('Warehouse method not implemented.');
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
        throw new Error('Warehouse method not implemented.');
    }

    async executeAsyncQuery(
        args: WarehouseExecuteAsyncQueryArgs,
    ): Promise<WarehouseExecuteAsyncQuery> {
        return {
            queryId: null,
            queryMetadata: null,
            durationMs: null,
            totalRows: null,
        };
    }

    async getAsyncQueryResults<TFormattedRow extends Record<string, unknown>>(
        { tags, timezone, values, ...args }: WarehouseGetAsyncQueryResultsArgs,
        rowFormatter?: (row: Record<string, unknown>) => TFormattedRow,
    ): Promise<WarehouseGetAsyncQueryResults<TFormattedRow>> {
        // When warehouse doesn't support async queries we run the compiled sql and return all the results
        let fields: WarehouseResults['fields'] = {};
        const rows: TFormattedRow[] = [];

        await this.streamQuery(
            args.sql,
            (data) => {
                fields = data.fields;
                rows.push(
                    ...((rowFormatter
                        ? data.rows.map(rowFormatter)
                        : data.rows) as TFormattedRow[]),
                );
            },
            {
                values,
                tags,
                timezone,
            },
        );

        return {
            fields,
            rows,
            queryId: null,
            pageCount: 1,
            totalRows: rows.length,
        };
    }

    async runQuery(
        sql: string,
        tags?: Record<string, string>,
        timezone?: string,
        values?: AnyType[],
    ) {
        let fields: WarehouseResults['fields'] = {};
        const rows: WarehouseResults['rows'] = [];

        await this.streamQuery(
            sql,
            (data) => {
                fields = data.fields;
                rows.push(...data.rows);
            },
            {
                values,
                tags,
                timezone,
            },
        );

        return { fields, rows };
    }

    getMetricSql(sql: string, metric: Metric): string {
        return getDefaultMetricSql(sql, metric.type);
    }

    getStartOfWeek(): WeekDay | null | undefined {
        return this.startOfWeek;
    }

    async test(): Promise<void> {
        await this.runQuery('SELECT 1');
    }

    concatString(...args: string[]): string {
        return `CONCAT(${args.join(', ')})`;
    }

    async getAllTables(): Promise<
        {
            database: string;
            schema: string;
            table: string;
            partitionColumn?: PartitionColumn;
        }[]
    > {
        throw new Error('Warehouse method not implemented.');
    }

    async getFields(
        tableName: string,
        schema?: string,
        database?: string,
        tags?: Record<string, string>,
    ): Promise<WarehouseCatalog> {
        throw new Error('Warehouse method not implemented.');
    }

    parseWarehouseCatalog(
        rows: Record<string, AnyType>[],
        mapFieldType: (type: string) => DimensionType,
    ): WarehouseCatalog {
        return rows.reduce(
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
                acc[table_catalog] = acc[table_catalog] || {};
                acc[table_catalog][table_schema] =
                    acc[table_catalog][table_schema] || {};
                acc[table_catalog][table_schema][table_name] =
                    acc[table_catalog][table_schema][table_name] || {};
                if (column_name && data_type)
                    acc[table_catalog][table_schema][table_name][column_name] =
                        mapFieldType(data_type);
                return acc;
            },
            {},
        );
    }

    parseError(error: Error): Error {
        return error;
    }
}
