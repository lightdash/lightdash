import { type Account } from '../types/auth';
import { ParameterError } from '../types/errors';
import { type MetricQuery } from '../types/metricQuery';
import { isValidTimezone } from './scheduler';

/**
 * Returns the account's stored user-level timezone preference, or null for
 * anonymous viewers (embeds / JWT) who have no profile. The EnableUserTimezones
 * gate is applied downstream in resolveQueryTimezone, the single chokepoint.
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
 * The user layer is only applied when isUserTimezoneEnabled is true. When the
 * EnableUserTimezones flag is off, stored preferences are ignored so every
 * user falls back to the project timezone — gating here, at the single
 * chokepoint, covers every source of userTimezone (account profile or session).
 *
 * Validates the resolved timezone to prevent SQL injection — the result
 * is interpolated into warehouse SQL strings (e.g., AT TIME ZONE '...').
 */
export function resolveQueryTimezone({
    metricQuery,
    projectTimezone,
    userTimezone,
    isUserTimezoneEnabled,
}: {
    metricQuery: Pick<MetricQuery, 'timezone'>;
    projectTimezone: string;
    userTimezone: string | null;
    isUserTimezoneEnabled: boolean;
}): string {
    const effectiveUserTimezone = isUserTimezoneEnabled ? userTimezone : null;
    const timezone =
        metricQuery.timezone ?? effectiveUserTimezone ?? projectTimezone;

    if (!isValidTimezone(timezone)) {
        throw new ParameterError(`Invalid timezone: ${timezone}`);
    }

    return timezone;
}
