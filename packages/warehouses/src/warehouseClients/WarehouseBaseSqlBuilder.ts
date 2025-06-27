import {
    Metric,
    SupportedDbtAdapter,
    WarehouseSqlBuilder,
    WarehouseTypes,
    WeekDay,
} from '@lightdash/common';
import { getDefaultMetricSql } from '../utils/sql';

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

    getMetricSql(sql: string, metric: Metric): string {
        return getDefaultMetricSql(sql, metric.type);
    }

    concatString(...args: string[]): string {
        return `CONCAT(${args.join(', ')})`;
    }
}
