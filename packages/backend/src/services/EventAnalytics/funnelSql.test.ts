import {
    DimensionType,
    FieldType,
    FilterOperator,
    SupportedDbtAdapter,
    type Explore,
    type FunnelQueryRequest,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { describe, expect, it } from 'vitest';
import { generateFunnelSql } from './funnelSql';

const dimension = (name: string, type: DimensionType) => ({
    type,
    name,
    label: name,
    table: 'events',
    tableLabel: 'events',
    fieldType: FieldType.DIMENSION as const,
    sql: `\${TABLE}.${name}`,
    compiledSql: `"events".${name}`,
    tablesReferences: ['events'],
    hidden: false,
});

const EVENTS_EXPLORE: Explore = {
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    name: 'events',
    label: 'Events',
    baseTable: 'events',
    tags: [],
    joinedTables: [],
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
    },
};

const sqlBuilder = warehouseSqlBuilderFromType(SupportedDbtAdapter.POSTGRES);

const baseRequest: FunnelQueryRequest = {
    exploreName: 'events',
    timestampFieldId: 'events_occurred_at',
    userIdFieldId: 'events_user_id',
    eventNameFieldId: 'events_event_name',
    dateRange: {
        type: 'custom',
        start: '2024-02-01T00:00:00Z',
        end: '2024-03-01T00:00:00Z',
    },
    steps: [
        { stepOrder: 1, eventName: 'signup' },
        { stepOrder: 2, eventName: 'add_to_cart' },
        { stepOrder: 3, eventName: 'purchase' },
    ],
    conversionWindow: { value: 7, unit: 'days' },
};

const generate = (overrides: Partial<FunnelQueryRequest> = {}) =>
    generateFunnelSql({
        request: { ...baseRequest, ...overrides },
        explore: EVENTS_EXPLORE,
        sqlBuilder,
        timezone: 'UTC',
        now: new Date('2024-03-10T12:00:00Z'),
    });

describe('generateFunnelSql', () => {
    it('chains steps as first-after appends within the conversion window', () => {
        const sql = generate();
        expect(sql).toContain('FROM "analytics"."raw_events" AS "events"');
        expect(sql).toContain(
            `"events".event_name IN ('signup', 'add_to_cart', 'purchase')`,
        );
        expect(sql).toContain(`WHERE "activity" = 'signup'`);
        expect(sql).toContain('step_2 AS (');
        expect(sql).toContain(`s."activity" = 'add_to_cart'`);
        expect(sql).toContain(`s."ts" > c."step_1_ts"`);
        expect(sql).toContain(`s."ts" <= c."step_1_ts" + INTERVAL '7 DAY'`);
        expect(sql).toContain('MIN(s."ts") AS "step_2_ts"');
        expect(sql).toContain(`s."ts" > c."step_2_ts"`);
        expect(sql).toContain('MIN(s."ts") AS "step_3_ts"');
    });

    it('computes conversion rates per step', () => {
        const sql = generate();
        expect(sql).toContain('3 AS "step_order"');
        expect(sql).toContain(
            'PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("step_3_ts" - "step_2_ts")))',
        );
        expect(sql).toContain(
            'FIRST_VALUE("total_users") OVER ( ORDER BY "step_order")',
        );
        expect(sql).toContain(
            'LAG("total_users") OVER ( ORDER BY "step_order")',
        );
    });

    it('defaults the conversion window to 30 days', () => {
        const sql = generate({ conversionWindow: undefined });
        expect(sql).toContain(`INTERVAL '30 DAY'`);
    });

    it('carries the breakdown from the first step', () => {
        const sql = generate({ breakdownDimensionId: 'events_platform' });
        expect(sql).toContain('"events".platform AS "breakdown_value"');
        expect(sql).toContain('c."breakdown_value"');
        expect(sql).toContain('GROUP BY "breakdown_value"');
        expect(sql).toContain(
            'PARTITION BY "breakdown_value" ORDER BY "step_order"',
        );
    });

    it('applies semantic layer filters to the stream', () => {
        const sql = generate({
            filters: {
                dimensions: {
                    id: 'root',
                    or: [
                        {
                            id: 'r1',
                            target: { fieldId: 'events_platform' },
                            operator: FilterOperator.EQUALS,
                            values: ['ios'],
                        },
                        {
                            id: 'r2',
                            target: { fieldId: 'events_platform' },
                            operator: FilterOperator.NULL,
                        },
                    ],
                },
            },
        });
        expect(sql).toContain(
            `(("events".platform) IN ('ios') OR ("events".platform) IS NULL)`,
        );
    });

    it('escapes event names', () => {
        const sql = generate({
            steps: [
                { stepOrder: 1, eventName: "it's" },
                { stepOrder: 2, eventName: 'done' },
            ],
        });
        expect(sql).toContain(`'it''s'`);
    });
});
