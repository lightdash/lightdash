import { type Account } from '../types/auth';
import { ParameterError } from '../types/errors';
import { type MetricQuery } from '../types/metricQuery';
import {
    PROJECT_TIMEZONE_SETTING,
    USER_TIMEZONE_SETTING,
} from '../types/timezone';
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
 * Resolves the effective timezone for a query.
 *
 * `sessionTimezone` is a host-controlled per-session override (e.g. an embed URL
 * `?timezone=` param) that outranks everything. Otherwise the resolution is
 * driven by the metricQuery.timezone setting:
 *   - `project_timezone` (what saved charts store by default) or **absent** → the
 *     project TZ for every viewer, tracking project-TZ changes, so the chart is
 *     deterministic across its audience. This replaces the old "unpinned charts
 *     fall through to the viewer's profile" behaviour.
 *   - `user_timezone` → the viewer's profile TZ when `isUserTimezoneEnabled`,
 *     else the project TZ.
 *   - any other value → an override IANA zone, frozen regardless of viewer/project.
 *
 * Whether the resolved zone is actually applied to the query is gated by the
 * calling service (EnableTimezoneSupport). The result is validated to prevent
 * SQL injection — it is interpolated into warehouse SQL (e.g. AT TIME ZONE '...').
 */
export function resolveQueryTimezone({
    sessionTimezone,
    metricQuery,
    projectTimezone,
    userTimezone,
    isUserTimezoneEnabled,
}: {
    sessionTimezone: string | null;
    metricQuery: Pick<MetricQuery, 'timezone'>;
    projectTimezone: string;
    userTimezone: string | null;
    isUserTimezoneEnabled: boolean;
}): string {
    const setting = metricQuery.timezone;

    let timezone: string;
    if (sessionTimezone) {
        // Host/session override (e.g. embed `?timezone=`) — outranks everything.
        timezone = sessionTimezone;
    } else if (setting === USER_TIMEZONE_SETTING) {
        // userTimezone may be null (no profile) → fall back to project.
        timezone =
            (isUserTimezoneEnabled ? userTimezone : null) ?? projectTimezone;
    } else if (!setting || setting === PROJECT_TIMEZONE_SETTING) {
        timezone = projectTimezone;
    } else {
        timezone = setting; // override IANA zone
    }

    if (!isValidTimezone(timezone)) {
        throw new ParameterError(`Invalid timezone: ${timezone}`);
    }

    return timezone;
}
