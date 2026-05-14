import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiClient } from '../helpers/api-client';
import { login } from '../helpers/auth';
import {
    getRowCount,
    runTimezoneTestQuery,
    updateUserTimezone,
} from '../helpers/timezone-test';

/**
 * User-level timezone (PROD-7528) tests.
 *
 * Verifies the resolution chain `chart > user > project`:
 *  - When a chart doesn't pin a timezone, the viewer's profile timezone
 *    (`users.timezone`) is used for grouping/filtering.
 *  - When a chart pins a timezone, it overrides the viewer's profile.
 *
 * Uses the same `timezone_test` fixture as `queryTimezone.test.ts`. Asia/Tokyo
 * (+9) shifts events into Jan 15/16/17 — distinct from the UTC layout
 * (Jan 15/16), so a wrong grouping is immediately visible.
 *
 * Requires LIGHTDASH_ENABLE_TIMEZONE_SUPPORT=true in the environment.
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

    it('applies the viewer profile timezone when the chart has no pinned timezone', async () => {
        await updateUserTimezone(admin, 'Asia/Tokyo');

        // No `timezone` on the metric query → chain falls through to the
        // user's profile (Asia/Tokyo). Expected Tokyo grouping per the
        // `timezone_test` fixture: Jan 15=5, Jan 16=4, Jan 17=1.
        const rows = await runTimezoneTestQuery(admin, {
            dimensions: DIMENSIONS,
            metrics: METRICS,
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

    it('chart-pinned timezone overrides the viewer profile timezone', async () => {
        await updateUserTimezone(admin, 'Asia/Tokyo');

        // Chart pins America/New_York → should win over the viewer's Tokyo
        // preference. Expected NY grouping: Jan 14=1, Jan 15=6, Jan 16=3.
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
