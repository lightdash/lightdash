import {
    Metric,
    SupportedDbtAdapter,
    TimeIntervalUnit,
    WarehouseSqlBuilder,
    WarehouseTypes,
    WeekDay,
} from '@lightdash/common';
import { getDefaultMetricSql, normalizeUnicode } from '../utils/sql';

export default abstract class WarehouseBaseSqlBuilder implements WarehouseSqlBuilder {
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

    castToTimestamp(date: Date): string {
        // Default: ANSI SQL CAST syntax (works for most warehouses)
        // Format as ISO 8601 string
        return `CAST('${date.toISOString()}' AS TIMESTAMP)`;
    }

    protected static readonly intervalUnitsSingular: Record<
        TimeIntervalUnit,
        string
    > = {
        [TimeIntervalUnit.SECOND]: 'SECOND',
        [TimeIntervalUnit.MINUTE]: 'MINUTE',
        [TimeIntervalUnit.HOUR]: 'HOUR',
        [TimeIntervalUnit.DAY]: 'DAY',
        [TimeIntervalUnit.WEEK]: 'WEEK',
        [TimeIntervalUnit.MONTH]: 'MONTH',
        [TimeIntervalUnit.YEAR]: 'YEAR',
    };

    getIntervalSql(value: number, unit: TimeIntervalUnit): string {
        // Default: PostgreSQL/Redshift style - accepts singular uppercase
        const unitStr = WarehouseBaseSqlBuilder.intervalUnitsSingular[unit];
        return `INTERVAL '${value} ${unitStr}'`;
    }

    getTimestampDiffSeconds(
        startTimestampSql: string,
        endTimestampSql: string,
    ): string {
        // Default: PostgreSQL/Redshift style
        return `EXTRACT(EPOCH FROM (${endTimestampSql} - ${startTimestampSql}))`;
    }

    getMedianSql(valueSql: string): string {
        // Default: PostgreSQL/Redshift/Snowflake style
        return `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${valueSql})`;
    }
}
