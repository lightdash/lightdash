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
import { type WarehouseClient } from '../types';
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
        { sql, values, tags, timezone }: WarehouseExecuteAsyncQueryArgs,
        resultsStreamCallback: (
            rows: WarehouseResults['rows'],
            fields: WarehouseResults['fields'],
        ) => void,
    ): Promise<WarehouseExecuteAsyncQuery> {
        let rowCount = 0;

        const startTime = performance.now();
        await this.streamQuery(
            sql,
            ({ rows, fields }) => {
                rowCount = (rowCount ?? 0) + rows.length;
                resultsStreamCallback(rows, fields);
            },
            {
                values,
                tags,
                timezone,
            },
        );

        // we could have this return further down but types are a bit messy with this union and count updating on a callback
        return {
            queryId: null,
            queryMetadata: null,
            durationMs: performance.now() - startTime,
            totalRows: rowCount,
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
