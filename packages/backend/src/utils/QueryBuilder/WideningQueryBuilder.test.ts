import {
    SupportedDbtAdapter,
    VizAggregationOptions,
    type WarehouseSqlBuilder,
} from '@lightdash/common';
import { WideningQueryBuilder } from './WideningQueryBuilder';

const postgres = {
    getFieldQuoteChar: () => '"',
    getAdapterType: () => SupportedDbtAdapter.POSTGRES,
    getStringQuoteChar: () => "'",
    escapeString: (value: string) => value.replaceAll("'", "''"),
} as unknown as WarehouseSqlBuilder;

const collapse = (sql: string) => sql.replace(/\s+/g, ' ').trim();

const build = (
    overrides: Partial<
        ConstructorParameters<typeof WideningQueryBuilder>[0]
    > = {},
) =>
    new WideningQueryBuilder({
        sql: 'SELECT date_day, source, new_followers FROM followers',
        indexColumns: ['date_day'],
        pivotColumn: 'source',
        pivotValues: ['organic', 'paid'],
        valueColumns: [
            {
                reference: 'new_followers',
                aggregation: VizAggregationOptions.SUM,
            },
        ],
        warehouseSqlBuilder: postgres,
        ...overrides,
    });

describe('WideningQueryBuilder', () => {
    it('widens the query with conditional aggregation, one column per value', () => {
        const sql = collapse(build().toSql());

        expect(sql).toContain(
            `sum(CASE WHEN "source" = 'organic' THEN "new_followers" END) AS "new_followers_0_organic"`,
        );
        expect(sql).toContain(
            `sum(CASE WHEN "source" = 'paid' THEN "new_followers" END) AS "new_followers_1_paid"`,
        );
    });

    it('collapses to one row per index column, which is what makes the join safe', () => {
        const sql = collapse(build().toSql());

        expect(sql).toContain('GROUP BY "date_day"');
        // The pivot dimension must not survive as a column of its own,
        // otherwise the result is still long and still fans the merge out.
        expect(sql).not.toMatch(/SELECT "date_day", "source"/);
    });

    it('groups by every index column for a composite key', () => {
        const sql = collapse(
            build({ indexColumns: ['date_day', 'region'] }).toSql(),
        );

        expect(sql).toContain('GROUP BY "date_day", "region"');
    });

    it('emits a column per metric per value', () => {
        const sql = collapse(
            build({
                valueColumns: [
                    {
                        reference: 'new_followers',
                        aggregation: VizAggregationOptions.SUM,
                    },
                    {
                        reference: 'reach',
                        aggregation: VizAggregationOptions.MAX,
                    },
                ],
            }).toSql(),
        );

        expect(sql).toContain('AS "new_followers_0_organic"');
        expect(sql).toContain('AS "new_followers_1_paid"');
        expect(sql).toContain('max(CASE WHEN "source" = \'organic\'');
        expect(sql).toContain('AS "reach_1_paid"');
    });

    it('keeps values that differ only in punctuation on separate columns', () => {
        const columns = build({
            pivotValues: ['no-show', 'no show'],
        })
            .getColumns()
            .valueColumns.map((column) => column.column);

        expect(columns).toEqual([
            'new_followers_0_no_show',
            'new_followers_1_no_show',
        ]);
        expect(new Set(columns).size).toBe(2);
    });

    it('escapes string values rather than interpolating them raw', () => {
        const sql = build({ pivotValues: ["o'brien"] }).toSql();

        expect(sql).toContain(`"source" = 'o''brien'`);
    });

    it('omits a null bucket unless asked for one', () => {
        expect(build().toSql()).not.toContain('IS NULL');
    });

    it('adds a null bucket on request', () => {
        const builder = build({ includeNulls: true });

        expect(collapse(builder.toSql())).toContain(
            'CASE WHEN "source" IS NULL THEN "new_followers" END) AS "new_followers_2_null"',
        );
        expect(
            builder.getColumns().valueColumns.map((c) => c.pivotValue),
        ).toEqual(['organic', 'paid', null]);
    });

    it('reports the column each value landed in', () => {
        expect(build().getColumns()).toEqual({
            indexColumns: ['date_day'],
            valueColumns: [
                {
                    reference: 'new_followers',
                    pivotValue: 'organic',
                    column: 'new_followers_0_organic',
                },
                {
                    reference: 'new_followers',
                    pivotValue: 'paid',
                    column: 'new_followers_1_paid',
                },
            ],
        });
    });

    it('uses the adapter aggregation, not a hardcoded one', () => {
        // Postgres has no ANY_VALUE before v16, so getAggregatedField emits
        // (ARRAY_AGG(x))[1]. The CASE has to land inside that, not around it.
        const sql = collapse(
            build({
                valueColumns: [
                    {
                        reference: 'new_followers',
                        aggregation: VizAggregationOptions.ANY,
                    },
                ],
            }).toSql(),
        );

        expect(sql).toContain(
            `(ARRAY_AGG(CASE WHEN "source" = 'organic' THEN "new_followers" END))[1] AS "new_followers_0_organic"`,
        );
    });
});
