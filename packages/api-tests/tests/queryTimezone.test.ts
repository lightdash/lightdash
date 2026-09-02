import { WeekDay } from '@lightdash/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiClient } from '../helpers/api-client';
import { login } from '../helpers/auth';
import {
    bigqueryWarehouseConfig,
    createAndRefreshProject,
    deleteProjectsByName,
    hasBigqueryCredentials,
} from '../helpers/projects';
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

const DIMENSION_KEY = 'timezone_test_event_timestamp_day';
const HOUR_DIMENSION_KEY = 'timezone_test_event_timestamp_hour';
const METRIC_KEY = 'timezone_test_count';
const DIMENSIONS = [DIMENSION_KEY];
const METRICS = [METRIC_KEY];

const HOUR_EQUALS_FILTER = (instant: string) => ({
    dimensions: {
        id: 'tz-test',
        and: [
            {
                id: 'tz-hour-eq',
                target: { fieldId: HOUR_DIMENSION_KEY },
                operator: 'equals',
                values: [instant],
            },
        ],
    },
});

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

const IN_BETWEEN_FILTER = (from: string, to: string) => ({
    dimensions: {
        id: 'tz-test',
        and: [
            {
                id: 'tz-between',
                target: { fieldId: 'timezone_test_event_timestamp_day' },
                operator: 'inBetween',
                values: [from, to],
            },
        ],
    },
});

const GRAIN_EQUALS_FILTER = (grain: string, value: string) => ({
    dimensions: {
        id: 'tz-test',
        and: [
            {
                id: 'tz-grain-eq',
                target: { fieldId: `timezone_test_event_timestamp_${grain}` },
                operator: 'equals',
                values: [value],
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
            expect(
                getRowCount(rows, '2024-01-15', DIMENSION_KEY, METRIC_KEY),
            ).toBe(6);
            expect(
                getRowCount(rows, '2024-01-16', DIMENSION_KEY, METRIC_KEY),
            ).toBe(4);
        });

        it('Pacific/Pago_Pago: Jan 14=4, Jan 15=4, Jan 16=2', async () => {
            const rows = await runTimezoneTestQuery(admin, {
                dimensions: DIMENSIONS,
                metrics: METRICS,
                timezone: 'Pacific/Pago_Pago',
            });
            expect(rows).toHaveLength(3);
            expect(
                getRowCount(rows, '2024-01-14', DIMENSION_KEY, METRIC_KEY),
            ).toBe(4);
            expect(
                getRowCount(rows, '2024-01-15', DIMENSION_KEY, METRIC_KEY),
            ).toBe(4);
            expect(
                getRowCount(rows, '2024-01-16', DIMENSION_KEY, METRIC_KEY),
            ).toBe(2);
        });

        it('America/New_York: Jan 14=1, Jan 15=6, Jan 16=3', async () => {
            const rows = await runTimezoneTestQuery(admin, {
                dimensions: DIMENSIONS,
                metrics: METRICS,
                timezone: 'America/New_York',
            });
            expect(rows).toHaveLength(3);
            expect(
                getRowCount(rows, '2024-01-14', DIMENSION_KEY, METRIC_KEY),
            ).toBe(1);
            expect(
                getRowCount(rows, '2024-01-15', DIMENSION_KEY, METRIC_KEY),
            ).toBe(6);
            expect(
                getRowCount(rows, '2024-01-16', DIMENSION_KEY, METRIC_KEY),
            ).toBe(3);
        });

        it('America/Chicago: Jan 14=2, Jan 15=5, Jan 16=3', async () => {
            const rows = await runTimezoneTestQuery(admin, {
                dimensions: DIMENSIONS,
                metrics: METRICS,
                timezone: 'America/Chicago',
            });
            expect(rows).toHaveLength(3);
            expect(
                getRowCount(rows, '2024-01-14', DIMENSION_KEY, METRIC_KEY),
            ).toBe(2);
            expect(
                getRowCount(rows, '2024-01-15', DIMENSION_KEY, METRIC_KEY),
            ).toBe(5);
            expect(
                getRowCount(rows, '2024-01-16', DIMENSION_KEY, METRIC_KEY),
            ).toBe(3);
        });

        it('Asia/Tokyo: Jan 15=5, Jan 16=4, Jan 17=1', async () => {
            const rows = await runTimezoneTestQuery(admin, {
                dimensions: DIMENSIONS,
                metrics: METRICS,
                timezone: 'Asia/Tokyo',
            });
            expect(rows).toHaveLength(3);
            expect(
                getRowCount(rows, '2024-01-15', DIMENSION_KEY, METRIC_KEY),
            ).toBe(5);
            expect(
                getRowCount(rows, '2024-01-16', DIMENSION_KEY, METRIC_KEY),
            ).toBe(4);
            expect(
                getRowCount(rows, '2024-01-17', DIMENSION_KEY, METRIC_KEY),
            ).toBe(1);
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
            expect(getTotalCount(rows, METRIC_KEY)).toBe(6);
        });

        it('Pacific/Pago_Pago: 4 events on Jan 15', async () => {
            const rows = await runTimezoneTestQuery(admin, {
                dimensions: DIMENSIONS,
                metrics: METRICS,
                timezone: 'Pacific/Pago_Pago',
                filters: EQUALS_FILTER('2024-01-15'),
            });
            expect(rows).toHaveLength(1);
            expect(getTotalCount(rows, METRIC_KEY)).toBe(4);
        });

        it('America/New_York: 6 events on Jan 15', async () => {
            const rows = await runTimezoneTestQuery(admin, {
                dimensions: DIMENSIONS,
                metrics: METRICS,
                timezone: 'America/New_York',
                filters: EQUALS_FILTER('2024-01-15'),
            });
            expect(rows).toHaveLength(1);
            expect(getTotalCount(rows, METRIC_KEY)).toBe(6);
        });

        it('America/Chicago: 5 events on Jan 15', async () => {
            const rows = await runTimezoneTestQuery(admin, {
                dimensions: DIMENSIONS,
                metrics: METRICS,
                timezone: 'America/Chicago',
                filters: EQUALS_FILTER('2024-01-15'),
            });
            expect(rows).toHaveLength(1);
            expect(getTotalCount(rows, METRIC_KEY)).toBe(5);
        });

        it('Asia/Tokyo: 5 events on Jan 15', async () => {
            const rows = await runTimezoneTestQuery(admin, {
                dimensions: DIMENSIONS,
                metrics: METRICS,
                timezone: 'Asia/Tokyo',
                filters: EQUALS_FILTER('2024-01-15'),
            });
            expect(rows).toHaveLength(1);
            expect(getTotalCount(rows, METRIC_KEY)).toBe(5);
        });
    });

    // ── Filter alignment: inBetween ────────────────────────────────────
    // Jan 14–15 inclusive. Expected totals per timezone:
    //   UTC: 0+6=6 | New_York: 1+6=7 | Chicago: 2+5=7 | Tokyo: 0+5=5 | Pago_Pago: 4+4=8

    describe('filter alignment — inBetween Jan 14 to Jan 15', () => {
        it('UTC: 6 events in Jan 14–15', async () => {
            const rows = await runTimezoneTestQuery(admin, {
                dimensions: DIMENSIONS,
                metrics: METRICS,
                filters: IN_BETWEEN_FILTER('2024-01-14', '2024-01-15'),
            });
            expect(getTotalCount(rows, METRIC_KEY)).toBe(6);
        });

        it('America/New_York: 7 events in Jan 14–15', async () => {
            const rows = await runTimezoneTestQuery(admin, {
                dimensions: DIMENSIONS,
                metrics: METRICS,
                timezone: 'America/New_York',
                filters: IN_BETWEEN_FILTER('2024-01-14', '2024-01-15'),
            });
            expect(getTotalCount(rows, METRIC_KEY)).toBe(7);
        });

        it('America/Chicago: 7 events in Jan 14–15', async () => {
            const rows = await runTimezoneTestQuery(admin, {
                dimensions: DIMENSIONS,
                metrics: METRICS,
                timezone: 'America/Chicago',
                filters: IN_BETWEEN_FILTER('2024-01-14', '2024-01-15'),
            });
            expect(getTotalCount(rows, METRIC_KEY)).toBe(7);
        });

        it('Asia/Tokyo: 5 events in Jan 14–15', async () => {
            const rows = await runTimezoneTestQuery(admin, {
                dimensions: DIMENSIONS,
                metrics: METRICS,
                timezone: 'Asia/Tokyo',
                filters: IN_BETWEEN_FILTER('2024-01-14', '2024-01-15'),
            });
            expect(getTotalCount(rows, METRIC_KEY)).toBe(5);
        });

        it('Pacific/Pago_Pago: 8 events in Jan 14–15', async () => {
            const rows = await runTimezoneTestQuery(admin, {
                dimensions: DIMENSIONS,
                metrics: METRICS,
                timezone: 'Pacific/Pago_Pago',
                filters: IN_BETWEEN_FILTER('2024-01-14', '2024-01-15'),
            });
            expect(getTotalCount(rows, METRIC_KEY)).toBe(8);
        });

        // Single-day inBetween — same as equals, catches off-by-one boundary shifts
        it('America/New_York: 6 events in Jan 15–15 (single day)', async () => {
            const rows = await runTimezoneTestQuery(admin, {
                dimensions: DIMENSIONS,
                metrics: METRICS,
                timezone: 'America/New_York',
                filters: IN_BETWEEN_FILTER('2024-01-15', '2024-01-15'),
            });
            expect(getTotalCount(rows, METRIC_KEY)).toBe(6);
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
            expect(getTotalCount(rows, METRIC_KEY)).toBe(4);
        });

        it('Pacific/Pago_Pago: 2 events after Jan 15', async () => {
            const rows = await runTimezoneTestQuery(admin, {
                dimensions: DIMENSIONS,
                metrics: METRICS,
                timezone: 'Pacific/Pago_Pago',
                filters: GREATER_THAN_FILTER('2024-01-15'),
            });
            expect(getTotalCount(rows, METRIC_KEY)).toBe(2);
        });

        it('America/New_York: 3 events after Jan 15', async () => {
            const rows = await runTimezoneTestQuery(admin, {
                dimensions: DIMENSIONS,
                metrics: METRICS,
                timezone: 'America/New_York',
                filters: GREATER_THAN_FILTER('2024-01-15'),
            });
            expect(getTotalCount(rows, METRIC_KEY)).toBe(3);
        });

        it('America/Chicago: 3 events after Jan 15', async () => {
            const rows = await runTimezoneTestQuery(admin, {
                dimensions: DIMENSIONS,
                metrics: METRICS,
                timezone: 'America/Chicago',
                filters: GREATER_THAN_FILTER('2024-01-15'),
            });
            expect(getTotalCount(rows, METRIC_KEY)).toBe(3);
        });

        it('Asia/Tokyo: 5 events after Jan 15', async () => {
            const rows = await runTimezoneTestQuery(admin, {
                dimensions: DIMENSIONS,
                metrics: METRICS,
                timezone: 'Asia/Tokyo',
                filters: GREATER_THAN_FILTER('2024-01-15'),
            });
            expect(getTotalCount(rows, METRIC_KEY)).toBe(5);
        });
    });

    // Hour grain exposes the fractional minutes: an equals on the fractional
    // bucket is 1 only when the partial offset is applied, 0 if dropped/rounded.

    describe('fractional-offset zones — sub-day buckets', () => {
        it('Asia/Kathmandu (+05:45): groups into 10 hourly buckets', async () => {
            const rows = await runTimezoneTestQuery(admin, {
                dimensions: [HOUR_DIMENSION_KEY],
                metrics: METRICS,
                timezone: 'Asia/Kathmandu',
            });
            expect(rows).toHaveLength(10);
            expect(getTotalCount(rows, METRIC_KEY)).toBe(10);
        });

        it('Asia/Kathmandu (+05:45): bucket aligns to :15, not :00 or :30', async () => {
            const aligned = await runTimezoneTestQuery(admin, {
                dimensions: [HOUR_DIMENSION_KEY],
                metrics: METRICS,
                timezone: 'Asia/Kathmandu',
                filters: HOUR_EQUALS_FILTER('2024-01-15T07:15:00.000Z'),
            });
            expect(getTotalCount(aligned, METRIC_KEY)).toBe(1);

            const wholeHour = await runTimezoneTestQuery(admin, {
                dimensions: [HOUR_DIMENSION_KEY],
                metrics: METRICS,
                timezone: 'Asia/Kathmandu',
                filters: HOUR_EQUALS_FILTER('2024-01-15T07:30:00.000Z'),
            });
            expect(getTotalCount(wholeHour, METRIC_KEY)).toBe(0);
        });

        it('Pacific/Marquesas (-09:30): groups into 10 hourly buckets', async () => {
            const rows = await runTimezoneTestQuery(admin, {
                dimensions: [HOUR_DIMENSION_KEY],
                metrics: METRICS,
                timezone: 'Pacific/Marquesas',
            });
            expect(rows).toHaveLength(10);
            expect(getTotalCount(rows, METRIC_KEY)).toBe(10);
        });

        it('Pacific/Marquesas (-09:30): bucket aligns to :30, not :00', async () => {
            const aligned = await runTimezoneTestQuery(admin, {
                dimensions: [HOUR_DIMENSION_KEY],
                metrics: METRICS,
                timezone: 'Pacific/Marquesas',
                filters: HOUR_EQUALS_FILTER('2024-01-15T07:30:00.000Z'),
            });
            expect(getTotalCount(aligned, METRIC_KEY)).toBe(1);

            const wholeHour = await runTimezoneTestQuery(admin, {
                dimensions: [HOUR_DIMENSION_KEY],
                metrics: METRICS,
                timezone: 'Pacific/Marquesas',
                filters: HOUR_EQUALS_FILTER('2024-01-15T08:00:00.000Z'),
            });
            expect(getTotalCount(wholeHour, METRIC_KEY)).toBe(0);
        });
    });

    afterAll(async () => {
        await updateDataTimezone(admin, undefined);
    });
});

// Warehouse-parity check: execute the discriminating timezone filters against a
// real BigQuery project. The staging dataset holds the same timezone_test rows
// as the Postgres seed, so the expected counts are identical.
describe.skipIf(!hasBigqueryCredentials())(
    'Query timezone — BigQuery filters',
    () => {
        const projectName = 'bigQuery timezone fractional test';
        // Cold BigQuery queries can exceed the default 15s poll window.
        const BIGQUERY_MAX_ATTEMPTS = 120;
        let bqAdmin: ApiClient;
        let bigqueryProjectUuid: string;

        beforeAll(async () => {
            bqAdmin = await login();
            // Clean up any project leaked by a previously interrupted run
            // before creating a fresh one (names are not unique).
            await deleteProjectsByName(bqAdmin, [projectName]);
            bigqueryProjectUuid = await createAndRefreshProject(
                bqAdmin,
                projectName,
                // Monday start makes row #11 (Sun 14 Jan 15:00 UTC) cross a
                // week boundary in Asia/Tokyo.
                { ...bigqueryWarehouseConfig(), startOfWeek: WeekDay.MONDAY },
            );
        }, 420_000);

        afterAll(async () => {
            if (bqAdmin) {
                await deleteProjectsByName(bqAdmin, [projectName]);
            }
        });

        it.each([
            {
                expectedCount: 5,
                filter: EQUALS_FILTER('2024-01-15'),
                name: 'equals',
            },
            {
                expectedCount: 9,
                filter: IN_BETWEEN_FILTER('2024-01-15', '2024-01-16'),
                name: 'inBetween',
            },
            {
                expectedCount: 5,
                filter: GREATER_THAN_FILTER('2024-01-15'),
                name: 'greaterThan',
            },
        ])(
            'Asia/Tokyo day $name preserves local-calendar filter semantics',
            async ({ expectedCount, filter }) => {
                const rows = await runTimezoneTestQuery(bqAdmin, {
                    dimensions: DIMENSIONS,
                    metrics: METRICS,
                    timezone: 'Asia/Tokyo',
                    filters: filter,
                    projectUuid: bigqueryProjectUuid,
                    maxAttempts: BIGQUERY_MAX_ATTEMPTS,
                });
                expect(getTotalCount(rows, METRIC_KEY)).toBe(expectedCount);
            },
        );

        // Coarser grains use boundary rows that land in a different
        // week / month / quarter / year once shifted out of UTC; the UTC
        // answer is one lower in every case.
        it.each([
            {
                grain: 'week',
                timezone: 'Asia/Tokyo',
                value: '2024-01-15',
                // #11 is Mon 15 Jan 00:00 Tokyo (Sun 14 Jan UTC); #1 is Mon 15 Jan in both.
                eventIds: [11, 1],
                expectedCount: 2,
            },
            {
                grain: 'month',
                timezone: 'Asia/Tokyo',
                value: '2024-02-01',
                // #18 is 1 Feb 00:00 Tokyo (31 Jan UTC); #20 is 16 Feb in both.
                eventIds: [18, 20],
                expectedCount: 2,
            },
            {
                grain: 'quarter',
                timezone: 'Pacific/Pago_Pago',
                value: '2023-10-01',
                // #17 is 31 Dec 2023 13:00 Pago Pago (1 Jan 2024 UTC); #1 is Q1 2024 in both.
                eventIds: [17, 1],
                expectedCount: 1,
            },
            {
                grain: 'year',
                timezone: 'Pacific/Pago_Pago',
                value: '2023-01-01',
                eventIds: [17, 1],
                expectedCount: 1,
            },
        ])(
            '$timezone $grain equals preserves local-calendar filter semantics',
            async ({ grain, timezone, value, eventIds, expectedCount }) => {
                const rows = await runTimezoneTestQuery(bqAdmin, {
                    dimensions: DIMENSIONS,
                    metrics: METRICS,
                    timezone,
                    filters: GRAIN_EQUALS_FILTER(grain, value),
                    eventIds,
                    projectUuid: bigqueryProjectUuid,
                    maxAttempts: BIGQUERY_MAX_ATTEMPTS,
                });
                expect(getTotalCount(rows, METRIC_KEY)).toBe(expectedCount);
            },
        );

        it('Asia/Kathmandu (+05:45): groups into 10 hourly buckets', async () => {
            const rows = await runTimezoneTestQuery(bqAdmin, {
                dimensions: [HOUR_DIMENSION_KEY],
                metrics: METRICS,
                timezone: 'Asia/Kathmandu',
                projectUuid: bigqueryProjectUuid,
                maxAttempts: BIGQUERY_MAX_ATTEMPTS,
            });
            expect(rows).toHaveLength(10);
            expect(getTotalCount(rows, METRIC_KEY)).toBe(10);
        });

        it('Asia/Kathmandu (+05:45): bucket aligns to :15, not :00 or :30', async () => {
            const aligned = await runTimezoneTestQuery(bqAdmin, {
                dimensions: [HOUR_DIMENSION_KEY],
                metrics: METRICS,
                timezone: 'Asia/Kathmandu',
                filters: HOUR_EQUALS_FILTER('2024-01-15T07:15:00.000Z'),
                projectUuid: bigqueryProjectUuid,
                maxAttempts: BIGQUERY_MAX_ATTEMPTS,
            });
            expect(getTotalCount(aligned, METRIC_KEY)).toBe(1);

            const wholeHour = await runTimezoneTestQuery(bqAdmin, {
                dimensions: [HOUR_DIMENSION_KEY],
                metrics: METRICS,
                timezone: 'Asia/Kathmandu',
                filters: HOUR_EQUALS_FILTER('2024-01-15T07:30:00.000Z'),
                projectUuid: bigqueryProjectUuid,
                maxAttempts: BIGQUERY_MAX_ATTEMPTS,
            });
            expect(getTotalCount(wholeHour, METRIC_KEY)).toBe(0);
        });

        it('Pacific/Marquesas (-09:30): groups into 10 hourly buckets', async () => {
            const rows = await runTimezoneTestQuery(bqAdmin, {
                dimensions: [HOUR_DIMENSION_KEY],
                metrics: METRICS,
                timezone: 'Pacific/Marquesas',
                projectUuid: bigqueryProjectUuid,
                maxAttempts: BIGQUERY_MAX_ATTEMPTS,
            });
            expect(rows).toHaveLength(10);
            expect(getTotalCount(rows, METRIC_KEY)).toBe(10);
        });

        it('Pacific/Marquesas (-09:30): bucket aligns to :30, not :00', async () => {
            const aligned = await runTimezoneTestQuery(bqAdmin, {
                dimensions: [HOUR_DIMENSION_KEY],
                metrics: METRICS,
                timezone: 'Pacific/Marquesas',
                filters: HOUR_EQUALS_FILTER('2024-01-15T07:30:00.000Z'),
                projectUuid: bigqueryProjectUuid,
                maxAttempts: BIGQUERY_MAX_ATTEMPTS,
            });
            expect(getTotalCount(aligned, METRIC_KEY)).toBe(1);

            const wholeHour = await runTimezoneTestQuery(bqAdmin, {
                dimensions: [HOUR_DIMENSION_KEY],
                metrics: METRICS,
                timezone: 'Pacific/Marquesas',
                filters: HOUR_EQUALS_FILTER('2024-01-15T08:00:00.000Z'),
                projectUuid: bigqueryProjectUuid,
                maxAttempts: BIGQUERY_MAX_ATTEMPTS,
            });
            expect(getTotalCount(wholeHour, METRIC_KEY)).toBe(0);
        });
    },
);
