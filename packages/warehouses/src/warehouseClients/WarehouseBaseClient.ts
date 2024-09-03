import {
    CreateWarehouseCredentials,
    DimensionType,
    Metric,
    SupportedDbtAdapter,
    WarehouseCatalog,
    WarehouseResults,
    WeekDay,
} from '@lightdash/common';
import { WarehouseClient } from '../types';
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
            values?: any[];
            tags?: Record<string, string>;
            timezone?: string;
        },
    ): Promise<void> {
        throw new Error('Warehouse method not implemented.');
    }

    async runQuery(
        sql: string,
        tags?: Record<string, string>,
        timezone?: string,
        values?: any[],
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
        { database: string; schema: string; table: string }[]
    > {
        throw new Error('Warehouse method not implemented.');
    }

    async getFields(
        tableName: string,
        schema?: string,
        tags?: Record<string, string>,
    ): Promise<WarehouseCatalog> {
        throw new Error('Warehouse method not implemented.');
    }

    parseWarehouseCatalog(
        rows: Record<string, any>[],
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
