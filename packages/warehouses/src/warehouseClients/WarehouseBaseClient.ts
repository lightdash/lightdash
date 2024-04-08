import {
    CreateWarehouseCredentials,
    DimensionType,
    Metric,
    SupportedDbtAdapter,
    WarehouseCatalog,
    WeekDay,
} from '@lightdash/common';
import { WarehouseClient } from '../types';
import { getDefaultMetricSql } from '../utils/sql';

export default class WarehouseBaseClient<T extends CreateWarehouseCredentials>
    implements WarehouseClient
{
    credentials: T;

    startOfWeek: WeekDay | null | undefined;

    warehouseTimezone: string | undefined;

    constructor(credentials: T) {
        this.credentials = credentials;
        this.startOfWeek = credentials.startOfWeek;
    }

    getFieldQuoteChar(): string {
        throw new Error('Warehouse method not implemented.');
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

    async runQuery(sql: string): Promise<{
        fields: Record<string, { type: DimensionType }>;
        rows: Record<string, any>[];
    }> {
        throw new Error('Warehouse method not implemented.');
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
}
