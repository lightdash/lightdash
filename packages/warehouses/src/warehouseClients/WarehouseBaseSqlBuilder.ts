import {
    Metric,
    SupportedDbtAdapter,
    WarehouseSqlBuilder,
    WarehouseTypes,
    WeekDay,
} from '@lightdash/common';
import { getDefaultMetricSql, normalizeUnicode } from '../utils/sql';

export default abstract class WarehouseBaseSqlBuilder
    implements WarehouseSqlBuilder
{
    protected startOfWeek: WeekDay | null | undefined;

    constructor(startOfWeek?: WeekDay | null) {
        this.startOfWeek = startOfWeek;
    }

    getStartOfWeek(): WeekDay | null | undefined {
        return this.startOfWeek;
    }

    abstract getAdapterType(): SupportedDbtAdapter;

    getFieldQuoteChar(): string {
        return '"';
    }

    getStringQuoteChar(): string {
        return "'";
    }

    getEscapeStringQuoteChar(): string {
        return '\\';
    }

    getFloatingType(): string {
        return 'FLOAT';
    }

    getMetricSql(sql: string, metric: Metric): string {
        return getDefaultMetricSql(sql, metric.type);
    }

    concatString(...args: string[]): string {
        return `CONCAT(${args.join(', ')})`;
    }

    escapeString(value: string): string {
        if (typeof value !== 'string') {
            return value;
        }

        return (
            normalizeUnicode(value)
                // Default: escape single quotes by doubling them
                .replaceAll("'", "''")
                // Remove SQL comments (-- and /* */)
                .replace(/--.*$/gm, '')
                .replace(/\/\*[\s\S]*?\*\//g, '')
                // Escape backslashes
                .replaceAll('\\', '\\\\')
                // Remove null bytes
                .replaceAll('\0', '')
        );
    }
}
