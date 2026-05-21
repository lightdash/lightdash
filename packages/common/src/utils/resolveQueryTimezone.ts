import { type Account } from '../types/auth';
import { ParameterError } from '../types/errors';
import { type MetricQuery } from '../types/metricQuery';
import { isValidTimezone } from './scheduler';

/**
 * Returns the account's user-level timezone preference, or null if the
 * account belongs to an anonymous viewer (embeds / JWT) where no profile
 * preference exists.
 */
export function getAccountUserTimezone(account: Account): string | null {
    if (account.user.type !== 'registered') {
        return null;
    }
    return account.user.timezone ?? null;
}

/**
 * Resolves the effective timezone for a query using the hierarchy:
 *   metricQuery.timezone → user timezone → project timezone → 'UTC'
 *
 * The project timezone (from getQueryTimezoneForProject) already handles
 * the project → config → 'UTC' fallback. The chart-level override sits on
 * top, and the user's profile timezone slots between the two so a viewer
 * with a personal preference sees their zone whenever the chart doesn't
 * pin one.
 *
 * Validates the resolved timezone to prevent SQL injection — the result
 * is interpolated into warehouse SQL strings (e.g., AT TIME ZONE '...').
 */
export function resolveQueryTimezone(
    metricQuery: Pick<MetricQuery, 'timezone'>,
    projectTimezone: string,
    userTimezone?: string | null,
): string {
    const timezone = metricQuery.timezone ?? userTimezone ?? projectTimezone;

    if (!isValidTimezone(timezone)) {
        throw new ParameterError(`Invalid timezone: ${timezone}`);
    }

    return timezone;
}
