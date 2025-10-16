import { assertUnreachable, CompileError, MetricType } from '@lightdash/common';

export function getDefaultMetricSql(sql: string, type: MetricType): string {
    switch (type) {
        case MetricType.AVERAGE:
            return `AVG(${sql})`;
        case MetricType.COUNT:
            return `COUNT(${sql})`;
        case MetricType.COUNT_DISTINCT:
            return `COUNT(DISTINCT ${sql})`;
        case MetricType.MAX:
            return `MAX(${sql})`;
        case MetricType.MIN:
            return `MIN(${sql})`;
        case MetricType.SUM:
            return `SUM(${sql})`;
        case MetricType.NUMBER:
        case MetricType.STRING:
        case MetricType.DATE:
        case MetricType.TIMESTAMP:
        case MetricType.BOOLEAN:
        case MetricType.PERCENTILE:
        case MetricType.MEDIAN:
            break;
        case MetricType.PERCENT_OF_PREVIOUS:
        case MetricType.PERCENT_OF_TOTAL:
        case MetricType.RUNNING_TOTAL:
            // PostCalculation metrics are compiled at run time
            break;
        default:
            return assertUnreachable(
                type,
                new CompileError(
                    `No SQL render function implemented for metric with type "${type}"`,
                ),
            );
    }
    return sql;
}

export const normalizeUnicode = (value: string): string =>
    value
        .normalize('NFC') // Normalize composition
        .replace(/[\u2019\u2018]/g, "'") // Smart quotes to ASCII
        .replace(/[\uFEFF\u200B]/g, ''); // Remove zero-width chars
