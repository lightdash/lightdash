import { beforeAll, describe, expect, it } from 'vitest';
import { ApiClient } from '../helpers/api-client';
import { login } from '../helpers/auth';
import {
    getRawBucketMap,
    runTimezoneTestQuery,
    updateDataTimezone,
} from '../helpers/timezone-test';

/**
 * Boundary-crossing tests for timezone-aware DATE_TRUNC (GLITCH-452).
 *
 * Exercises the `timezone_test` boundary rows (ids 11-18) at offsets that flip
 * a day / month / year / DST boundary, to rule out double conversions and
 * off-by-one bucketing once day-or-coarser truncs compile to a real DATE.
 *
 *   #11 2024-01-14 15:00Z  (= 2024-01-15 00:00 Asia/Tokyo, day boundary)
 *   #12 2024-01-15 00:00Z  (UTC midnight)
 *   #13 2024-03-10 06:30Z  (US spring-forward day)
 *   #14 2024-03-10 07:30Z  (US spring-forward day, post-transition)
 *   #15 2024-11-03 05:30Z  (US fall-back day, pre-transition)
 *   #16 2024-11-03 06:30Z  (US fall-back day, post-transition)
 *   #17 2024-01-01 00:00Z  (year boundary)
 *   #18 2024-01-31 15:00Z  (month boundary)
 *
 * Asserts the bare-date `raw` bucket (the GLITCH-452 contract).
 * Requires LIGHTDASH_ENABLE_TIMEZONE_SUPPORT=true in the environment.
 */

let admin: ApiClient;

const DAY = 'timezone_test_event_timestamp_day';
const MONTH = 'timezone_test_event_timestamp_month';
const YEAR = 'timezone_test_event_timestamp_year';
const COUNT = 'timezone_test_count';

const bucket = async (
    dim: string,
    eventIds: number[],
    timezone: string,
): Promise<Record<string, number>> => {
    const rows = await runTimezoneTestQuery(admin, {
        dimensions: [dim],
        metrics: [COUNT],
        eventIds,
        timezone,
    });
    return getRawBucketMap(rows, dim, COUNT);
};

describe('Timezone boundary crossings (GLITCH-452)', () => {
    beforeAll(async () => {
        admin = await login();
        await updateDataTimezone(admin, undefined);
    });

    describe('year boundary — #17 (2024-01-01 00:00Z)', () => {
        it('America/New_York (-5): rolls back into 2023', async () => {
            expect(await bucket(YEAR, [17], 'America/New_York')).toEqual({
                '2023-01-01': 1,
            });
        });
        it('UTC: stays 2024', async () => {
            expect(await bucket(YEAR, [17], 'UTC')).toEqual({
                '2024-01-01': 1,
            });
        });
        it('Asia/Tokyo (+9): stays 2024', async () => {
            expect(await bucket(YEAR, [17], 'Asia/Tokyo')).toEqual({
                '2024-01-01': 1,
            });
        });
    });

    describe('month boundary — #18 (2024-01-31 15:00Z)', () => {
        it('Asia/Tokyo (+9): rolls forward into February', async () => {
            expect(await bucket(MONTH, [18], 'Asia/Tokyo')).toEqual({
                '2024-02-01': 1,
            });
        });
        it('Pacific/Kiritimati (+14): rolls forward into February', async () => {
            expect(await bucket(MONTH, [18], 'Pacific/Kiritimati')).toEqual({
                '2024-02-01': 1,
            });
        });
        it('UTC: stays January', async () => {
            expect(await bucket(MONTH, [18], 'UTC')).toEqual({
                '2024-01-01': 1,
            });
        });
        it('Pacific/Pago_Pago (-11): stays January', async () => {
            expect(await bucket(MONTH, [18], 'Pacific/Pago_Pago')).toEqual({
                '2024-01-01': 1,
            });
        });
    });

    describe('day boundary', () => {
        it('#11 Asia/Tokyo (+9): tz-midnight lands on the next day', async () => {
            expect(await bucket(DAY, [11], 'Asia/Tokyo')).toEqual({
                '2024-01-15': 1,
            });
        });
        it('#11 UTC: stays on the UTC day', async () => {
            expect(await bucket(DAY, [11], 'UTC')).toEqual({
                '2024-01-14': 1,
            });
        });
        it('#12 America/St_Johns (-3:30 fractional): UTC midnight rolls back a day', async () => {
            expect(await bucket(DAY, [12], 'America/St_Johns')).toEqual({
                '2024-01-14': 1,
            });
        });
    });

    describe('DST transition days — America/New_York', () => {
        it('spring-forward #13,#14 both bucket to 2024-03-10', async () => {
            expect(await bucket(DAY, [13, 14], 'America/New_York')).toEqual({
                '2024-03-10': 2,
            });
        });
        it('fall-back #15,#16 both bucket to 2024-11-03', async () => {
            expect(await bucket(DAY, [15, 16], 'America/New_York')).toEqual({
                '2024-11-03': 2,
            });
        });
    });
});
