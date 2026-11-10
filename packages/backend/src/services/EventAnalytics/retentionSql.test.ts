import {
    DimensionType,
    FieldType,
    FilterOperator,
    SupportedDbtAdapter,
    type Explore,
    type RetentionQueryRequest,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { describe, expect, it } from 'vitest';
import {
    generateRetentionSql,
    parseRetentionRows,
    toCohortDateString,
} from './retentionSql';

const dimension = (
    name: string,
    type: DimensionType,
    table: string = 'events',
) => ({
    type,
    name,
    label: name,
    table,
    tableLabel: table,
    fieldType: FieldType.DIMENSION as const,
    sql: `\${TABLE}.${name}`,
    compiledSql: `"${table}".${name}`,
    tablesReferences: [table],
    hidden: false,
});

const EVENTS_EXPLORE: Explore = {
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    name: 'events',
    label: 'Events',
    baseTable: 'events',
    tags: [],
    joinedTables: [
        {
            table: 'users',
            sqlOn: '${events.user_id} = ${users.id}',
            compiledSqlOn: '("events".user_id) = ("users".id)',
            type: undefined,
            tablesReferences: ['events', 'users'],
        },
    ],
    tables: {
        events: {
            name: 'events',
            label: 'Events',
            database: 'db',
            schema: 'analytics',
            sqlTable: '"analytics"."raw_events"',
            dimensions: {
                user_id: dimension('user_id', DimensionType.STRING),
                event_name: dimension('event_name', DimensionType.STRING),
                occurred_at: dimension('occurred_at', DimensionType.TIMESTAMP),
                platform: dimension('platform', DimensionType.STRING),
            },
            metrics: {},
            lineageGraph: {},
        },
        users: {
            name: 'users',
            label: 'Users',
            database: 'db',
            schema: 'analytics',
            sqlTable: '"analytics"."users"',
            dimensions: {
                country: dimension('country', DimensionType.STRING, 'users'),
            },
            metrics: {},
            lineageGraph: {},
        },
    },
};

const sqlBuilder = warehouseSqlBuilderFromType(SupportedDbtAdapter.POSTGRES);
const now = new Date('2024-03-10T12:00:00Z');

const baseRequest: RetentionQueryRequest = {
    exploreName: 'events',
    timestampFieldId: 'events_occurred_at',
    userIdFieldId: 'events_user_id',
    eventNameFieldId: 'events_event_name',
    dateRange: {
        type: 'custom',
        start: '2024-02-01T00:00:00Z',
        end: '2024-03-01T00:00:00Z',
    },
    bornEvent: 'signup',
    returnEvent: 'purchase',
    cohortType: 'first_time',
    unit: 'week',
    periods: 4,
    criteria: 'on',
    mode: 'calendar',
};

const generate = (overrides: Partial<RetentionQueryRequest> = {}) =>
    generateRetentionSql({
        request: { ...baseRequest, ...overrides },
        explore: EVENTS_EXPLORE,
        sqlBuilder,
        timezone: 'UTC',
        now,
    });

describe('generateRetentionSql', () => {
    it('builds a cohort matrix query over the aliased base table', () => {
        const sql = generate();
        expect(sql).toContain('FROM "analytics"."raw_events" AS "events"');
        expect(sql).toContain(`"events".event_name IN ('signup', 'purchase')`);
        expect(sql).toContain(`WHERE "activity" = 'signup'`);
        expect(sql).toContain(`AND s."activity" = 'purchase'`);
        expect(sql).toContain('ROW_NUMBER() OVER (');
        expect(sql).toContain('PARTITION BY "customer"\n');
        expect(sql).toContain(`DATE_TRUNC('WEEK', "events".occurred_at)`);
        expect(sql).toContain('LEFT JOIN retained r');
        expect(sql).toContain('COUNT(DISTINCT "customer") AS "cohort_size"');
    });

    it('first-time cohorts scan all born events but only in-window returns', () => {
        const sql = generate();
        expect(sql).toContain(
            `("events".occurred_at >= CAST('2024-02-01T00:00:00.000Z' AS TIMESTAMP) OR "events".event_name IN ('signup'))`,
        );
        expect(sql).toContain(
            `+ INTERVAL '5 WEEK'`, // periods + 1 buckets past the window end
        );
    });

    it('recurring cohorts partition births by period', () => {
        const sql = generate({ cohortType: 'recurring' });
        expect(sql).toContain('PARTITION BY "customer", "period_start"');
        expect(sql).toContain(
            `"events".occurred_at >= CAST('2024-02-01T00:00:00.000Z' AS TIMESTAMP)\n      AND "events".occurred_at <`,
        );
    });

    it('any return event drops the event predicate on the return join', () => {
        const sql = generate({ returnEvent: null });
        expect(sql).not.toContain(`'signup', 'purchase'`);
        expect(sql).not.toContain(`AND s."activity" =`);
    });

    it('rolling mode measures periods from the birth timestamp', () => {
        const sql = generate({ mode: 'rolling', unit: 'day' });
        expect(sql).toContain(
            'FLOOR(EXTRACT(EPOCH FROM (s."ts" - c."birth_ts")) / 86400)',
        );
    });

    it('calendar months use calendar month arithmetic', () => {
        const sql = generate({ unit: 'month' });
        expect(sql).toContain(
            '(EXTRACT(YEAR FROM s."period_start") - EXTRACT(YEAR FROM c."period_start")) * 12',
        );
    });

    it('on_or_after caps each user at their last period', () => {
        const sql = generate({ criteria: 'on_or_after' });
        expect(sql).toContain('customer_last_period AS');
        expect(sql).toContain('CASE WHEN MAX("period") > 4 THEN 4');
    });

    it('adds breakdown to every grouping and a null-safe join', () => {
        const sql = generate({ breakdownDimensionId: 'events_platform' });
        expect(sql).toContain('"events".platform AS "breakdown_value"');
        expect(sql).toContain(
            'GROUP BY "period_start", "breakdown_value", "period"',
        );
        expect(sql).toContain(
            '(r."breakdown_value" IS NULL AND c."breakdown_value" IS NULL)',
        );
    });

    it('compiles semantic layer dimension filters into the scan', () => {
        const sql = generate({
            filters: {
                dimensions: {
                    id: 'root',
                    and: [
                        {
                            id: 'r1',
                            target: { fieldId: 'events_platform' },
                            operator: FilterOperator.EQUALS,
                            values: ['ios'],
                        },
                    ],
                },
            },
        });
        expect(sql).toContain(`(("events".platform) IN ('ios'))`);
    });

    it('rejects filters on joined tables', () => {
        expect(() =>
            generate({
                filters: {
                    dimensions: {
                        id: 'root',
                        and: [
                            {
                                id: 'r1',
                                target: { fieldId: 'users_country' },
                                operator: FilterOperator.EQUALS,
                                values: ['UK'],
                            },
                        ],
                    },
                },
            }),
        ).toThrow(/base table/);
    });

    it('rejects too many periods', () => {
        expect(() => generate({ unit: 'day', periods: 61 })).toThrow(
            /cannot exceed 60/,
        );
    });

    it('escapes event names', () => {
        const sql = generate({ bornEvent: "o'clock" });
        expect(sql).toContain(`'o''clock'`);
    });
});

describe('toCohortDateString', () => {
    it('handles strings, dates and BigQuery wrappers', () => {
        expect(toCohortDateString('2024-02-05T00:00:00.000Z')).toBe(
            '2024-02-05',
        );
        expect(toCohortDateString(new Date(2024, 1, 5))).toBe('2024-02-05');
        expect(toCohortDateString({ value: '2024-02-05' })).toBe('2024-02-05');
    });
});

describe('parseRetentionRows', () => {
    const rows = [
        { cohort_date: '2024-02-05', cohort_size: 10, period: 0, users: 10 },
        { cohort_date: '2024-02-05', cohort_size: 10, period: 1, users: 4 },
        { cohort_date: '2024-02-05', cohort_size: 10, period: 3, users: 1 },
        {
            cohort_date: '2024-02-26',
            cohort_size: 5,
            period: null,
            users: null,
        },
    ];

    it('builds the cohort matrix with completeness', () => {
        const { cohorts, averages } = parseRetentionRows(
            rows,
            { unit: 'week', periods: 3, criteria: 'on', mode: 'calendar' },
            now,
        );
        expect(cohorts).toHaveLength(2);
        expect(cohorts[0]).toMatchObject({
            cohortDate: '2024-02-05',
            cohortSize: 10,
            counts: [10, 4, 0, 1],
            rates: [100, 40, 0, 10],
            lastCompletePeriod: 3,
        });
        expect(cohorts[1]).toMatchObject({
            cohortDate: '2024-02-26',
            cohortSize: 5,
            counts: [0, 0, 0, 0],
            lastCompletePeriod: 0,
        });
        // The second cohort only contributes to period 0
        expect(averages[0].cohortSizes).toEqual([15, 10, 10, 10]);
        expect(averages[0].rates[0]).toBeCloseTo(66.67, 2);
        expect(averages[0].rates.slice(1)).toEqual([40, 0, 10]);
    });

    it('accumulates on_or_after counts backwards', () => {
        const { cohorts } = parseRetentionRows(
            rows.slice(0, 3),
            {
                unit: 'week',
                periods: 3,
                criteria: 'on_or_after',
                mode: 'calendar',
            },
            now,
        );
        // last period 0: 10 users, 1: 4 users, 3: 1 user
        expect(cohorts[0].counts).toEqual([15, 5, 1, 1]);
    });
});
