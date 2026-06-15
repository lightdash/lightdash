import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiClient } from '../helpers/api-client';
import { login } from '../helpers/auth';
import {
    getRowCount,
    runTimezoneTestQuery,
    updateUserTimezone,
} from '../helpers/timezone-test';

/**
 * User-level timezone tests, updated for the GLITCH-459 model.
 *
 * Resolution now defaults to the **project** timezone; the viewer's profile
 * timezone (`users.timezone`) is only used when the query explicitly sets
 * `timezone: 'user_timezone'`. An IANA zone is an override that wins over both.
 *
 * Uses the same `timezone_test` fixture as `queryTimezone.test.ts`. Asia/Tokyo
 * (+9) shifts events into Jan 15/16/17 — distinct from the UTC layout
 * (Jan 15/16), so a wrong grouping is immediately visible.
 *
 * Requires LIGHTDASH_ENABLE_TIMEZONE_SUPPORT=true in the environment —
 * `user_timezone` resolution is gated on the EnableTimezoneSupport flag.
 */

const DIMENSION_KEY = 'timezone_test_event_timestamp_day';
const METRIC_KEY = 'timezone_test_count';
const DIMENSIONS = [DIMENSION_KEY];
const METRICS = [METRIC_KEY];

describe('User-level timezone', () => {
    let admin: ApiClient;

    beforeAll(async () => {
        admin = await login();
    });

    afterAll(async () => {
        // Reset profile timezone so it doesn't leak into other tests.
        await updateUserTimezone(admin, null);
    });

    it('defaults to the project timezone, ignoring the viewer profile, when no timezone is set', async () => {
        await updateUserTimezone(admin, 'Asia/Tokyo');

        // No `timezone` on the metric query → resolves to the project default
        // (UTC), NOT the viewer's Tokyo profile. Expected UTC grouping per the
        // `timezone_test` fixture: Jan 15=6, Jan 16=4.
        const rows = await runTimezoneTestQuery(admin, {
            dimensions: DIMENSIONS,
            metrics: METRICS,
        });

        expect(rows).toHaveLength(2);
        expect(getRowCount(rows, '2024-01-15', DIMENSION_KEY, METRIC_KEY)).toBe(
            6,
        );
        expect(getRowCount(rows, '2024-01-16', DIMENSION_KEY, METRIC_KEY)).toBe(
            4,
        );
    });

    it('uses the viewer profile timezone when the query sets user_timezone', async () => {
        await updateUserTimezone(admin, 'Asia/Tokyo');

        // `timezone: 'user_timezone'` → the viewer's profile (Asia/Tokyo).
        // Expected Tokyo grouping: Jan 15=5, Jan 16=4, Jan 17=1.
        const rows = await runTimezoneTestQuery(admin, {
            dimensions: DIMENSIONS,
            metrics: METRICS,
            timezone: 'user_timezone',
        });

        expect(rows).toHaveLength(3);
        expect(getRowCount(rows, '2024-01-15', DIMENSION_KEY, METRIC_KEY)).toBe(
            5,
        );
        expect(getRowCount(rows, '2024-01-16', DIMENSION_KEY, METRIC_KEY)).toBe(
            4,
        );
        expect(getRowCount(rows, '2024-01-17', DIMENSION_KEY, METRIC_KEY)).toBe(
            1,
        );
    });

    it('an override zone wins over the viewer profile timezone', async () => {
        await updateUserTimezone(admin, 'Asia/Tokyo');

        // An explicit America/New_York override → should win over both the
        // viewer's Tokyo preference and the project default. Expected NY
        // grouping: Jan 14=1, Jan 15=6, Jan 16=3.
        const rows = await runTimezoneTestQuery(admin, {
            dimensions: DIMENSIONS,
            metrics: METRICS,
            timezone: 'America/New_York',
        });

        expect(rows).toHaveLength(3);
        expect(getRowCount(rows, '2024-01-14', DIMENSION_KEY, METRIC_KEY)).toBe(
            1,
        );
        expect(getRowCount(rows, '2024-01-15', DIMENSION_KEY, METRIC_KEY)).toBe(
            6,
        );
        expect(getRowCount(rows, '2024-01-16', DIMENSION_KEY, METRIC_KEY)).toBe(
            3,
        );
    });
});
