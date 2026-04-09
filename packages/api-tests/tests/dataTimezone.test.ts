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

const DIMENSIONS = ['timezone_test_event_timestamp_day'];
const METRICS = ['timezone_test_count'];

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
            expect(getRowCount(rows, '2024-01-15')).toBe(6);
            expect(getRowCount(rows, '2024-01-16')).toBe(4);
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
            expect(getTotalCount(rows)).toBe(6);
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
            expect(getTotalCount(rows)).toBe(4);
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
            expect(getRowCount(rows, '2024-01-15')).toBe(6);
            expect(getRowCount(rows, '2024-01-16')).toBe(4);
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
            expect(getTotalCount(rows)).toBe(6);
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
            expect(getTotalCount(rows)).toBe(4);
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
            expect(getRowCount(rows, '2024-01-15')).toBe(6);
            expect(getRowCount(rows, '2024-01-16')).toBe(4);
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
            expect(getRowCount(rows, '2024-01-14')).toBe(4);
            expect(getRowCount(rows, '2024-01-15')).toBe(4);
            expect(getRowCount(rows, '2024-01-16')).toBe(2);
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
            expect(getTotalCount(rows)).toBe(4);
        });

        afterAll(async () => {
            await updateDataTimezone(admin, undefined);
        });
    });

    afterAll(async () => {
        await updateDataTimezone(admin, undefined);
    });
});
