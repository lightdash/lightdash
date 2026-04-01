import { type MetricQuery } from '@lightdash/common';

/**
 * Resolves the effective timezone for a query using the hierarchy:
 *   metricQuery.timezone → project timezone → 'UTC'
 *
 * The project timezone (from getQueryTimezoneForProject) already handles
 * the project → config → 'UTC' fallback, so this helper only adds the
 * per-chart override layer on top.
 */
export function resolveQueryTimezone(
    metricQuery: Pick<MetricQuery, 'timezone'>,
    projectTimezone: string,
): string {
    return metricQuery.timezone ?? projectTimezone;
}
