import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiClient } from '../helpers/api-client';
import { login } from '../helpers/auth';
import {
    getRowCount,
    getTotalCount,
    runTimezoneTestQuery,
    updateDataTimezone,
} from '../helpers/timezone-test';

/**
 * Query timezone (project timezone) tests.
 *
 * Verifies that timezone-aware DATE_TRUNC groups and filters data by the
 * query timezone (metricQuery.timezone), not the warehouse session timezone.
 *
 * Uses the `timezone_test` model with 10 events at specific UTC times:
 *   #1  2024-01-15 02:00 UTC    #6  2024-01-15 18:00 UTC
 *   #2  2024-01-15 05:00 UTC    #7  2024-01-16 03:00 UTC
 *   #3  2024-01-15 08:00 UTC    #8  2024-01-16 08:00 UTC
 *   #4  2024-01-15 10:00 UTC    #9  2024-01-16 12:00 UTC
 *   #5  2024-01-15 12:00 UTC    #10 2024-01-16 18:00 UTC
 *
 * Expected GROUP BY DAY counts per timezone:
 *   UTC (+0):                Jan 15 = 6, Jan 16 = 4
 *   America/New_York (-5):   Jan 14 = 1, Jan 15 = 6, Jan 16 = 3
 *   America/Chicago (-6):    Jan 14 = 2, Jan 15 = 5, Jan 16 = 3
 *   Asia/Tokyo (+9):         Jan 15 = 5, Jan 16 = 4, Jan 17 = 1
 *   Pacific/Pago_Pago (-11): Jan 14 = 4, Jan 15 = 4, Jan 16 = 2
 *
 * Expected FILTER day = Jan 15 counts:
 *   UTC: 6 | New_York: 6 | Chicago: 5 | Tokyo: 5 | Pago_Pago: 4
 *
 * Expected FILTER day > Jan 15 counts:
 *   UTC: 4 | New_York: 3 | Chicago: 3 | Tokyo: 5 | Pago_Pago: 2
 *
 * Requires LIGHTDASH_ENABLE_TIMEZONE_SUPPORT=true in the environment.
 */

let admin: ApiClient;

const DIMENSIONS = ['timezone_test_event_timestamp_day'];
const METRICS = ['timezone_test_count'];

const EQUALS_FILTER = (day: string) => ({
    dimensions: {
        id: 'tz-test',
        and: [
            {
                id: 'tz-eq',
                target: { fieldId: 'timezone_test_event_timestamp_day' },
                operator: 'equals',
                values: [day],
            },
        ],
    },
});

const GREATER_THAN_FILTER = (day: string) => ({
    dimensions: {
        id: 'tz-test',
        and: [
            {
                id: 'tz-gt',
                target: { fieldId: 'timezone_test_event_timestamp_day' },
                operator: 'greaterThan',
                values: [day],
            },
        ],
    },
});

describe('Query timezone (timezone-aware DATE_TRUNC)', () => {
    beforeAll(async () => {
        admin = await login();
        await updateDataTimezone(admin, undefined);
    });

    // ── Grouping ──────────────────────────────────────────────────────

    describe('grouping by query timezone', () => {
        it('UTC (default): Jan 15=6, Jan 16=4', async () => {
            const rows = await runTimezoneTestQuery(admin, {
                dimensions: DIMENSIONS,
                metrics: METRICS,
            });
            expect(rows).toHaveLength(2);
            expect(getRowCount(rows, '2024-01-15')).toBe(6);
            expect(getRowCount(rows, '2024-01-16')).toBe(4);
        });

        it('Pacific/Pago_Pago: Jan 14=4, Jan 15=4, Jan 16=2', async () => {
            const rows = await runTimezoneTestQuery(admin, {
                dimensions: DIMENSIONS,
                metrics: METRICS,
                timezone: 'Pacific/Pago_Pago',
            });
            expect(rows).toHaveLength(3);
            expect(getRowCount(rows, '2024-01-14')).toBe(4);
            expect(getRowCount(rows, '2024-01-15')).toBe(4);
            expect(getRowCount(rows, '2024-01-16')).toBe(2);
        });

        it('America/New_York: Jan 14=1, Jan 15=6, Jan 16=3', async () => {
            const rows = await runTimezoneTestQuery(admin, {
                dimensions: DIMENSIONS,
                metrics: METRICS,
                timezone: 'America/New_York',
            });
            expect(rows).toHaveLength(3);
            expect(getRowCount(rows, '2024-01-14')).toBe(1);
            expect(getRowCount(rows, '2024-01-15')).toBe(6);
            expect(getRowCount(rows, '2024-01-16')).toBe(3);
        });

        it('America/Chicago: Jan 14=2, Jan 15=5, Jan 16=3', async () => {
            const rows = await runTimezoneTestQuery(admin, {
                dimensions: DIMENSIONS,
                metrics: METRICS,
                timezone: 'America/Chicago',
            });
            expect(rows).toHaveLength(3);
            expect(getRowCount(rows, '2024-01-14')).toBe(2);
            expect(getRowCount(rows, '2024-01-15')).toBe(5);
            expect(getRowCount(rows, '2024-01-16')).toBe(3);
        });

        it('Asia/Tokyo: Jan 15=5, Jan 16=4, Jan 17=1', async () => {
            const rows = await runTimezoneTestQuery(admin, {
                dimensions: DIMENSIONS,
                metrics: METRICS,
                timezone: 'Asia/Tokyo',
            });
            expect(rows).toHaveLength(3);
            expect(getRowCount(rows, '2024-01-15')).toBe(5);
            expect(getRowCount(rows, '2024-01-16')).toBe(4);
            expect(getRowCount(rows, '2024-01-17')).toBe(1);
        });
    });

    // ── Filter alignment: equals ──────────────────────────────────────

    describe('filter alignment — equals day = Jan 15', () => {
        it('UTC: 6 events on Jan 15', async () => {
            const rows = await runTimezoneTestQuery(admin, {
                dimensions: DIMENSIONS,
                metrics: METRICS,
                filters: EQUALS_FILTER('2024-01-15'),
            });
            expect(rows).toHaveLength(1);
            expect(getTotalCount(rows)).toBe(6);
        });

        it('Pacific/Pago_Pago: 4 events on Jan 15', async () => {
            const rows = await runTimezoneTestQuery(admin, {
                dimensions: DIMENSIONS,
                metrics: METRICS,
                timezone: 'Pacific/Pago_Pago',
                filters: EQUALS_FILTER('2024-01-15'),
            });
            expect(rows).toHaveLength(1);
            expect(getTotalCount(rows)).toBe(4);
        });

        it('America/New_York: 6 events on Jan 15', async () => {
            const rows = await runTimezoneTestQuery(admin, {
                dimensions: DIMENSIONS,
                metrics: METRICS,
                timezone: 'America/New_York',
                filters: EQUALS_FILTER('2024-01-15'),
            });
            expect(rows).toHaveLength(1);
            expect(getTotalCount(rows)).toBe(6);
        });

        it('America/Chicago: 5 events on Jan 15', async () => {
            const rows = await runTimezoneTestQuery(admin, {
                dimensions: DIMENSIONS,
                metrics: METRICS,
                timezone: 'America/Chicago',
                filters: EQUALS_FILTER('2024-01-15'),
            });
            expect(rows).toHaveLength(1);
            expect(getTotalCount(rows)).toBe(5);
        });

        it('Asia/Tokyo: 5 events on Jan 15', async () => {
            const rows = await runTimezoneTestQuery(admin, {
                dimensions: DIMENSIONS,
                metrics: METRICS,
                timezone: 'Asia/Tokyo',
                filters: EQUALS_FILTER('2024-01-15'),
            });
            expect(rows).toHaveLength(1);
            expect(getTotalCount(rows)).toBe(5);
        });
    });

    // ── Filter alignment: greaterThan ─────────────────────────────────

    describe('filter alignment — greaterThan day > Jan 15', () => {
        it('UTC: 4 events after Jan 15', async () => {
            const rows = await runTimezoneTestQuery(admin, {
                dimensions: DIMENSIONS,
                metrics: METRICS,
                filters: GREATER_THAN_FILTER('2024-01-15'),
            });
            expect(getTotalCount(rows)).toBe(4);
        });

        it('Pacific/Pago_Pago: 2 events after Jan 15', async () => {
            const rows = await runTimezoneTestQuery(admin, {
                dimensions: DIMENSIONS,
                metrics: METRICS,
                timezone: 'Pacific/Pago_Pago',
                filters: GREATER_THAN_FILTER('2024-01-15'),
            });
            expect(getTotalCount(rows)).toBe(2);
        });

        it('America/New_York: 3 events after Jan 15', async () => {
            const rows = await runTimezoneTestQuery(admin, {
                dimensions: DIMENSIONS,
                metrics: METRICS,
                timezone: 'America/New_York',
                filters: GREATER_THAN_FILTER('2024-01-15'),
            });
            expect(getTotalCount(rows)).toBe(3);
        });

        it('America/Chicago: 3 events after Jan 15', async () => {
            const rows = await runTimezoneTestQuery(admin, {
                dimensions: DIMENSIONS,
                metrics: METRICS,
                timezone: 'America/Chicago',
                filters: GREATER_THAN_FILTER('2024-01-15'),
            });
            expect(getTotalCount(rows)).toBe(3);
        });

        it('Asia/Tokyo: 5 events after Jan 15', async () => {
            const rows = await runTimezoneTestQuery(admin, {
                dimensions: DIMENSIONS,
                metrics: METRICS,
                timezone: 'Asia/Tokyo',
                filters: GREATER_THAN_FILTER('2024-01-15'),
            });
            expect(getTotalCount(rows)).toBe(5);
        });
    });

    afterAll(async () => {
        await updateDataTimezone(admin, undefined);
    });
});
