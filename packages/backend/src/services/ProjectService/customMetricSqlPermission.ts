import { type AdditionalMetric } from '@lightdash/common';

export const getCustomMetricSqlPermissionMessage = (
    metrics: AdditionalMetric[],
): string =>
    `Custom metrics written in SQL need permission to manage custom fields: ${metrics
        .map((metric) => metric.label ?? metric.name)
        .join(', ')}`;
