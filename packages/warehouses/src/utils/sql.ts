import { CompileError, MetricType } from '@lightdash/common';
import assertUnreachable from '@lightdash/common/dist/utils/assertUnreachable';

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
        case MetricType.BOOLEAN:
        case MetricType.PERCENTILE:
        case MetricType.MEDIAN:
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
