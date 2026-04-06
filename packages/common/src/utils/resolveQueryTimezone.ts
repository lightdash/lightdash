import { ParameterError } from '../types/errors';
import { type MetricQuery } from '../types/metricQuery';
import { isValidTimezone } from './scheduler';

/**
 * Resolves the effective timezone for a query using the hierarchy:
 *   metricQuery.timezone → project timezone → 'UTC'
 *
 * The project timezone (from getQueryTimezoneForProject) already handles
 * the project → config → 'UTC' fallback, so this helper only adds the
 * per-chart override layer on top.
 *
 * Validates the resolved timezone to prevent SQL injection — the result
 * is interpolated into warehouse SQL strings (e.g., AT TIME ZONE '...').
 */
export function resolveQueryTimezone(
    metricQuery: Pick<MetricQuery, 'timezone'>,
    projectTimezone: string,
): string {
    const timezone = metricQuery.timezone ?? projectTimezone;

    if (!isValidTimezone(timezone)) {
        throw new ParameterError(`Invalid timezone: ${timezone}`);
    }

    return timezone;
}
