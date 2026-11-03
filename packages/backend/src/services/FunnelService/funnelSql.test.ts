import { NotFoundError } from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { generateFunnelSql } from './funnelSql';
import { eventsExplore, funnelDefinition } from './funnelSql.mock';

const sqlBuilder = warehouseSqlBuilderFromType('postgres');
const squash = (sql: string) => sql.replace(/\s+/g, ' ');

describe('generateFunnelSql', () => {
    it('builds one CTE per step, each requiring the previous step', () => {
        const sql = squash(
            generateFunnelSql(funnelDefinition, eventsExplore, sqlBuilder),
        );

        expect(sql).toContain('step_1_users AS (');
        expect(sql).toContain('step_2_users AS (');
        expect(sql).toContain('step_3_users AS (');
        expect(sql).not.toContain('step_4_users');
        expect(sql).toContain('SELECT 1 FROM step_1_users prev');
        expect(sql).toContain('SELECT 1 FROM step_2_users prev');
        expect(sql).toContain('FROM "public"."events"');
    });

    it('quotes and escapes event names', () => {
        const sql = squash(
            generateFunnelSql(funnelDefinition, eventsExplore, sqlBuilder),
        );

        expect(sql).toContain(
            `"events".event_name IN ('signup', 'user''s first query', 'invite')`,
        );
        expect(sql).toContain(`'user''s first query' AS "step_name"`);
        expect(sql).not.toContain(`'user's first query'`);
    });

    it('defaults the conversion window to 30 days', () => {
        const sql = generateFunnelSql(
            funnelDefinition,
            eventsExplore,
            sqlBuilder,
        );

        expect(sql).toContain(`+ INTERVAL '30 DAY'`);
    });

    it('uses the requested conversion window', () => {
        const sql = generateFunnelSql(
            {
                ...funnelDefinition,
                conversionWindow: { value: 2, unit: 'hours' },
            },
            eventsExplore,
            sqlBuilder,
        );

        expect(sql).toContain(`+ INTERVAL '2 HOUR'`);
        expect(sql).not.toContain(`INTERVAL '30 DAY'`);
    });

    it('partitions conversion rates by the breakdown dimension', () => {
        const withBreakdown = squash(
            generateFunnelSql(
                { ...funnelDefinition, breakdownDimensionId: 'events_country' },
                eventsExplore,
                sqlBuilder,
            ),
        );
        const withoutBreakdown = squash(
            generateFunnelSql(funnelDefinition, eventsExplore, sqlBuilder),
        );

        expect(withBreakdown).toContain(
            '"events".country AS "breakdown_value"',
        );
        expect(withBreakdown).toContain(
            'OVER (PARTITION BY "breakdown_value" ORDER BY "step_order")',
        );
        expect(withBreakdown).toContain(
            'ORDER BY "breakdown_value", "step_order"',
        );
        expect(withoutBreakdown).not.toContain('breakdown_value');
        expect(withoutBreakdown).toContain('OVER ( ORDER BY "step_order")');
    });

    it('rejects a field that is not a dimension of the explore', () => {
        expect(() =>
            generateFunnelSql(
                { ...funnelDefinition, userIdFieldId: 'events_missing' },
                eventsExplore,
                sqlBuilder,
            ),
        ).toThrow(NotFoundError);
    });
});
