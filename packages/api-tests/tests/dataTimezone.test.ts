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
    getRawBucketMap,
    getRowCount,
    getTotalCount,
    runTimezoneTestQuery,
    updateDataTimezone,
} from '../helpers/timezone-test';

/**
 * Data timezone tests.
 *
 * Uses the `timezone_test` model which has 10 events with timestamptz values
 * at specific UTC times. Tests that `dataTimezone` sets the warehouse session
 * timezone correctly.
 *
 * With timezone-aware DATE_TRUNC enabled, grouping is controlled by
 * `queryTimezone` (project timezone), NOT `dataTimezone` (session timezone).
 * Since these tests don't set `queryTimezone`, it defaults to UTC, so
 * grouping is always by UTC day boundaries regardless of `dataTimezone`.
 *
 * The `dataTimezone` setting controls how the warehouse interprets NTZ
 * (no-timezone) columns, not how timestamptz grouping works. For timestamptz
 * columns (which this test uses), `dataTimezone` only affects display
 * formatting, not grouping when timezone-aware DATE_TRUNC is active.
 *
 * Expected counts by day (queryTimezone = UTC, all cases):
 *   Jan 15 = 6, Jan 16 = 4
 *
 * Requires LIGHTDASH_ENABLE_TIMEZONE_SUPPORT=true in the environment.
 */

let admin: ApiClient;

const DIMENSION_KEY = 'timezone_test_event_timestamp_day';
const METRIC_KEY = 'timezone_test_count';
const DIMENSIONS = [DIMENSION_KEY];
const METRICS = [METRIC_KEY];

describe('Data timezone', () => {
    beforeAll(async () => {
        admin = await login();
    });

    describe('without dataTimezone (UTC default)', () => {
        beforeAll(async () => {
            await updateDataTimezone(admin, undefined);
        });

        it('should group events by UTC day boundaries', async () => {
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

        it('should filter by UTC day for equals filter', async () => {
            const rows = await runTimezoneTestQuery(admin, {
                dimensions: DIMENSIONS,
                metrics: METRICS,
                filters: {
                    dimensions: {
                        id: 'tz-test',
                        and: [
                            {
                                id: 'tz-equals',
                                target: {
                                    fieldId:
                                        'timezone_test_event_timestamp_day',
                                },
                                operator: 'equals',
                                values: ['2024-01-15'],
                            },
                        ],
                    },
                },
            });
            expect(getTotalCount(rows, METRIC_KEY)).toBe(6);
        });

        it('should filter by UTC day for greaterThan filter', async () => {
            const rows = await runTimezoneTestQuery(admin, {
                dimensions: DIMENSIONS,
                metrics: METRICS,
                filters: {
                    dimensions: {
                        id: 'tz-test',
                        and: [
                            {
                                id: 'tz-gt',
                                target: {
                                    fieldId:
                                        'timezone_test_event_timestamp_day',
                                },
                                operator: 'greaterThan',
                                values: ['2024-01-15'],
                            },
                        ],
                    },
                },
            });
            expect(getTotalCount(rows, METRIC_KEY)).toBe(4);
        });
    });

    describe('with dataTimezone = Pacific/Pago_Pago (UTC-11)', () => {
        beforeAll(async () => {
            await updateDataTimezone(admin, 'Pacific/Pago_Pago');
        });

        it('should still group by UTC day boundaries (queryTimezone defaults to UTC)', async () => {
            const rows = await runTimezoneTestQuery(admin, {
                dimensions: DIMENSIONS,
                metrics: METRICS,
            });
            // With timezone-aware DATE_TRUNC, grouping follows queryTimezone (UTC),
            // not dataTimezone (Pago_Pago). The session TZ only affects NTZ interpretation.
            expect(rows).toHaveLength(2);
            expect(
                getRowCount(rows, '2024-01-15', DIMENSION_KEY, METRIC_KEY),
            ).toBe(6);
            expect(
                getRowCount(rows, '2024-01-16', DIMENSION_KEY, METRIC_KEY),
            ).toBe(4);
        });

        it('should filter by UTC day for equals filter (queryTimezone defaults to UTC)', async () => {
            const rows = await runTimezoneTestQuery(admin, {
                dimensions: DIMENSIONS,
                metrics: METRICS,
                filters: {
                    dimensions: {
                        id: 'tz-test',
                        and: [
                            {
                                id: 'tz-equals',
                                target: {
                                    fieldId:
                                        'timezone_test_event_timestamp_day',
                                },
                                operator: 'equals',
                                values: ['2024-01-15'],
                            },
                        ],
                    },
                },
            });
            // Filters also use queryTimezone (UTC), not dataTimezone
            expect(getTotalCount(rows, METRIC_KEY)).toBe(6);
        });

        it('should filter by UTC day for greaterThan filter (queryTimezone defaults to UTC)', async () => {
            const rows = await runTimezoneTestQuery(admin, {
                dimensions: DIMENSIONS,
                metrics: METRICS,
                filters: {
                    dimensions: {
                        id: 'tz-test',
                        and: [
                            {
                                id: 'tz-gt',
                                target: {
                                    fieldId:
                                        'timezone_test_event_timestamp_day',
                                },
                                operator: 'greaterThan',
                                values: ['2024-01-15'],
                            },
                        ],
                    },
                },
            });
            // Filters use queryTimezone (UTC): only Jan 16 events (4)
            expect(getTotalCount(rows, METRIC_KEY)).toBe(4);
        });
    });

    describe('dataTimezone + queryTimezone interaction', () => {
        beforeAll(async () => {
            await updateDataTimezone(admin, 'Pacific/Pago_Pago');
        });

        it('dataTz=Pago_Pago, queryTz=UTC: groups by UTC despite non-UTC session', async () => {
            // queryTimezone controls grouping, not dataTimezone
            const rows = await runTimezoneTestQuery(admin, {
                dimensions: DIMENSIONS,
                metrics: METRICS,
                timezone: 'UTC',
            });
            expect(rows).toHaveLength(2);
            expect(
                getRowCount(rows, '2024-01-15', DIMENSION_KEY, METRIC_KEY),
            ).toBe(6);
            expect(
                getRowCount(rows, '2024-01-16', DIMENSION_KEY, METRIC_KEY),
            ).toBe(4);
        });

        it('dataTz=Pago_Pago, queryTz=Pago_Pago: skip optimization, groups by Pago_Pago', async () => {
            // When dataTimezone === queryTimezone, bare DATE_TRUNC is used
            // (session TZ already produces correct grouping)
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

        it('dataTz=Pago_Pago, queryTz=Pago_Pago: filter day=Jan15 returns 4 events', async () => {
            const rows = await runTimezoneTestQuery(admin, {
                dimensions: DIMENSIONS,
                metrics: METRICS,
                timezone: 'Pacific/Pago_Pago',
                filters: {
                    dimensions: {
                        id: 'tz-test',
                        and: [
                            {
                                id: 'tz-equals',
                                target: {
                                    fieldId:
                                        'timezone_test_event_timestamp_day',
                                },
                                operator: 'equals',
                                values: ['2024-01-15'],
                            },
                        ],
                    },
                },
            });
            expect(rows).toHaveLength(1);
            expect(getTotalCount(rows, METRIC_KEY)).toBe(4);
        });

        afterAll(async () => {
            await updateDataTimezone(admin, undefined);
        });
    });

    afterAll(async () => {
        await updateDataTimezone(admin, undefined);
    });
});

/**
 * Naive (no-timezone) column behavior. `event_timestamp_ntz` stores bare
 * wall-clocks (Jan 15: 02,05,08,10,12,18 | Jan 16: 03,08,12,18), and the data
 * timezone declares which zone those wall-clocks are in. Grouping by day with
 * query timezone Q:
 *
 *   dataTz unset (read as UTC), Q=Asia/Tokyo:      Jan 15 = 5, Jan 16 = 4, Jan 17 = 1
 *   dataTz=Asia/Tokyo, Q=Asia/Tokyo (zones equal): Jan 15 = 6, Jan 16 = 4
 *   dataTz=Asia/Tokyo, Q=Pacific/Pago_Pago:        Jan 14 = 6, Jan 15 = 4
 *
 * The same expectations must hold on every warehouse that supports a data
 * timezone; the suites below assert them for Postgres and BigQuery.
 */
const NTZ_DIMENSION_KEY = 'timezone_test_event_timestamp_ntz_day';
const NTZ_METRIC_KEY = 'timezone_test_count_ntz';

function runNaiveDayQuery(
    client: ApiClient,
    options: {
        timezone: string;
        projectUuid?: string;
        maxAttempts?: number;
    },
) {
    return runTimezoneTestQuery(client, {
        dimensions: [NTZ_DIMENSION_KEY],
        metrics: [NTZ_METRIC_KEY],
        timezone: options.timezone,
        projectUuid: options.projectUuid,
        maxAttempts: options.maxAttempts,
    });
}

describe('Data timezone — naive timestamps (Postgres)', () => {
    beforeAll(async () => {
        admin = await login();
    });

    afterAll(async () => {
        await updateDataTimezone(admin, undefined);
    });

    it('without dataTimezone: naive values are read as UTC', async () => {
        await updateDataTimezone(admin, undefined);
        const rows = await runNaiveDayQuery(admin, { timezone: 'Asia/Tokyo' });
        expect(
            getRawBucketMap(rows, NTZ_DIMENSION_KEY, NTZ_METRIC_KEY),
        ).toEqual({ '2024-01-15': 5, '2024-01-16': 4, '2024-01-17': 1 });
    });

    it('dataTz=Asia/Tokyo, queryTz=Asia/Tokyo: groups by stored wall-clock day', async () => {
        await updateDataTimezone(admin, 'Asia/Tokyo');
        const rows = await runNaiveDayQuery(admin, { timezone: 'Asia/Tokyo' });
        expect(
            getRawBucketMap(rows, NTZ_DIMENSION_KEY, NTZ_METRIC_KEY),
        ).toEqual({ '2024-01-15': 6, '2024-01-16': 4 });
    });

    it('dataTz=Asia/Tokyo, queryTz=Pacific/Pago_Pago: naive values are read in the data timezone', async () => {
        await updateDataTimezone(admin, 'Asia/Tokyo');
        const rows = await runNaiveDayQuery(admin, {
            timezone: 'Pacific/Pago_Pago',
        });
        expect(
            getRawBucketMap(rows, NTZ_DIMENSION_KEY, NTZ_METRIC_KEY),
        ).toEqual({ '2024-01-14': 6, '2024-01-15': 4 });
    });
});

describe.skipIf(!hasBigqueryCredentials())(
    'Data timezone — naive timestamps (BigQuery)',
    () => {
        const projectName = 'bigQuery data timezone test';
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
                bigqueryWarehouseConfig(),
            );
        }, 180_000);

        afterAll(async () => {
            if (bqAdmin) {
                await deleteProjectsByName(bqAdmin, [projectName]);
            }
        });

        it('without dataTimezone: naive DATETIME values are read as UTC', async () => {
            const rows = await runNaiveDayQuery(bqAdmin, {
                timezone: 'Asia/Tokyo',
                projectUuid: bigqueryProjectUuid,
                maxAttempts: BIGQUERY_MAX_ATTEMPTS,
            });
            expect(
                getRawBucketMap(rows, NTZ_DIMENSION_KEY, NTZ_METRIC_KEY),
            ).toEqual({ '2024-01-15': 5, '2024-01-16': 4, '2024-01-17': 1 });
        });

        it('dataTz=Asia/Tokyo, queryTz=Asia/Tokyo: groups by stored wall-clock day', async () => {
            await updateDataTimezone(
                bqAdmin,
                'Asia/Tokyo',
                bigqueryProjectUuid,
            );
            const rows = await runNaiveDayQuery(bqAdmin, {
                timezone: 'Asia/Tokyo',
                projectUuid: bigqueryProjectUuid,
                maxAttempts: BIGQUERY_MAX_ATTEMPTS,
            });
            expect(
                getRawBucketMap(rows, NTZ_DIMENSION_KEY, NTZ_METRIC_KEY),
            ).toEqual({ '2024-01-15': 6, '2024-01-16': 4 });
        });

        it('dataTz=Asia/Tokyo, queryTz=Pacific/Pago_Pago: naive DATETIME values are read in the data timezone', async () => {
            await updateDataTimezone(
                bqAdmin,
                'Asia/Tokyo',
                bigqueryProjectUuid,
            );
            const rows = await runNaiveDayQuery(bqAdmin, {
                timezone: 'Pacific/Pago_Pago',
                projectUuid: bigqueryProjectUuid,
                maxAttempts: BIGQUERY_MAX_ATTEMPTS,
            });
            expect(
                getRawBucketMap(rows, NTZ_DIMENSION_KEY, NTZ_METRIC_KEY),
            ).toEqual({ '2024-01-14': 6, '2024-01-15': 4 });
        });

        // Aware TIMESTAMP columns are pinned instants: grouping follows the
        // query timezone and the data timezone must not shift them. On the
        // equal-zones skip path (bare TIMESTAMP_TRUNC) the job time_zone is
        // what produces the query-timezone buckets, mirroring how Postgres
        // relies on its session timezone there.
        it('aware column, dataTz=Asia/Tokyo, queryTz=Asia/Tokyo: groups instants by Asia/Tokyo day', async () => {
            await updateDataTimezone(
                bqAdmin,
                'Asia/Tokyo',
                bigqueryProjectUuid,
            );
            const rows = await runTimezoneTestQuery(bqAdmin, {
                dimensions: [DIMENSION_KEY],
                metrics: [METRIC_KEY],
                timezone: 'Asia/Tokyo',
                projectUuid: bigqueryProjectUuid,
                maxAttempts: BIGQUERY_MAX_ATTEMPTS,
            });
            expect(getRawBucketMap(rows, DIMENSION_KEY, METRIC_KEY)).toEqual({
                '2024-01-15': 5,
                '2024-01-16': 4,
                '2024-01-17': 1,
            });
        });

        it('aware column, dataTz=Asia/Tokyo, queryTz=Pacific/Pago_Pago: data timezone does not shift instants', async () => {
            await updateDataTimezone(
                bqAdmin,
                'Asia/Tokyo',
                bigqueryProjectUuid,
            );
            const rows = await runTimezoneTestQuery(bqAdmin, {
                dimensions: [DIMENSION_KEY],
                metrics: [METRIC_KEY],
                timezone: 'Pacific/Pago_Pago',
                projectUuid: bigqueryProjectUuid,
                maxAttempts: BIGQUERY_MAX_ATTEMPTS,
            });
            expect(getRawBucketMap(rows, DIMENSION_KEY, METRIC_KEY)).toEqual({
                '2024-01-14': 4,
                '2024-01-15': 4,
                '2024-01-16': 2,
            });
        });
    },
);
