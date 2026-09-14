import {
    createTemporaryVirtualView,
    DimensionType,
    FilterOperator,
    MergeJoinType,
    MetricType,
    SupportedDbtAdapter,
    TimeFrames,
    WeekDay,
    type MetricQuery,
    type WarehouseSqlBuilder,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { compileMetricQuery } from '../../queryCompiler';
import {
    applyMergeTerminalWrapper,
    MergeQueryBuilder,
    type MergeQuerySourceSql,
    type MergeSort,
} from './MergeQueryBuilder';
import { MetricQueryBuilder } from './MetricQueryBuilder';

const mockWarehouseSqlBuilder = {
    getFieldQuoteChar: () => '"',
    getAdapterType: () => SupportedDbtAdapter.DUCKDB,
    supportsCteMaterialization: () => true,
    getStartOfWeek: () => WeekDay.MONDAY,
    getStringQuoteChar: () => "'",
    escapeString: (value: string) => value.replaceAll("'", "''"),
} as unknown as WarehouseSqlBuilder;

const collapse = (sql: string) => sql.replace(/\s+/g, ' ').trim();

// Query A: new followers per day. Query B: total followers per day from
// snapshots. Both unique on the date.
const sourceA: MergeQuerySourceSql = {
    id: 'a',
    sql: 'SELECT created_date AS "date_day", 1 AS "new_organic", 2 AS "new_paid" FROM followers',
    joinKeyColumnByName: { date_day: 'date_day' },
    valueColumns: ['new_organic', 'new_paid'],
};

const sourceB: MergeQuerySourceSql = {
    id: 'b',
    sql: 'SELECT date AS "date_day", 3 AS "total_followers" FROM follower_snapshots',
    joinKeyColumnByName: { date_day: 'date_day' },
    valueColumns: ['total_followers'],
};

const build = (
    joinType: MergeJoinType,
    sources: MergeQuerySourceSql[] = [sourceA, sourceB],
    limit?: number,
) =>
    new MergeQueryBuilder({
        sources,
        joinKeyNames: ['date_day'],
        joinType,
        warehouseSqlBuilder: mockWarehouseSqlBuilder,
        limit,
    });

describe('MergeQueryBuilder', () => {
    it('compiles both queries into one statement, one CTE each', () => {
        const sql = build(MergeJoinType.FULL).toSql();

        expect(sql).toContain('WITH merge_0_a AS (');
        expect(sql).toContain('merge_1_b AS (');
        expect(sql).toContain('FROM followers');
        expect(sql).toContain('FROM follower_snapshots');
        // One statement, not two fetches: a single SELECT over both CTEs.
        expect(sql.match(/\bWITH\b/g)).toHaveLength(1);
    });

    it('coalesces the join key under a full outer join', () => {
        const sql = collapse(build(MergeJoinType.FULL).toSql());

        expect(sql).toContain(
            'COALESCE(merge_0_a."date_day", merge_1_b."date_day") AS "date_day"',
        );
        expect(sql).toContain('FULL OUTER JOIN merge_1_b ON');
    });

    it('takes the key from the first source under left and inner joins', () => {
        expect(collapse(build(MergeJoinType.LEFT).toSql())).toContain(
            'merge_0_a."date_day" AS "date_day"',
        );
        expect(collapse(build(MergeJoinType.LEFT).toSql())).toContain(
            'LEFT JOIN merge_1_b ON',
        );
        expect(collapse(build(MergeJoinType.INNER).toSql())).toContain(
            'INNER JOIN merge_1_b ON',
        );
        expect(collapse(build(MergeJoinType.INNER).toSql())).not.toContain(
            'COALESCE(',
        );
    });

    // Null-safe for every include mode, so toggling full/left/inner never
    // changes what a null key means.
    it('joins null-safe with IS NOT DISTINCT FROM', () => {
        const sql = collapse(build(MergeJoinType.FULL).toSql());

        expect(sql).toContain(
            'ON merge_0_a."date_day" IS NOT DISTINCT FROM merge_1_b."date_day"',
        );
        expect(sql).not.toContain('IS NULL');
    });

    it('prefixes value columns per source so two sources cannot collide', () => {
        const collidingB: MergeQuerySourceSql = {
            ...sourceB,
            valueColumns: ['new_organic'],
            sql: 'SELECT date AS "date_day", 3 AS "new_organic" FROM follower_snapshots',
        };
        const sql = collapse(
            build(MergeJoinType.FULL, [sourceA, collidingB]).toSql(),
        );

        expect(sql).toContain('merge_0_a."new_organic" AS "c0_0"');
        expect(sql).toContain('merge_1_b."new_organic" AS "c1_0"');
    });

    it('reports where every merged column came from', () => {
        expect(build(MergeJoinType.FULL).getColumns()).toEqual({
            joinKeyColumns: ['date_day'],
            valueColumnBySourceColumn: {
                a: {
                    new_organic: 'c0_0',
                    new_paid: 'c0_1',
                },
                b: { total_followers: 'c1_0' },
            },
        });
    });

    it('keeps source ids that differ only in punctuation apart', () => {
        const columns = new MergeQueryBuilder({
            sources: [
                { ...sourceA, id: 'query-a' },
                { ...sourceB, id: 'query.a' },
            ],
            joinKeyNames: ['date_day'],
            joinType: MergeJoinType.FULL,
            warehouseSqlBuilder: mockWarehouseSqlBuilder,
        }).getColumns().valueColumnBySourceColumn;

        expect(columns['query-a'].new_organic).toBe('c0_0');
        expect(columns['query.a'].total_followers).toBe('c1_0');
    });

    it('names columns short enough to survive an identifier length limit', () => {
        const longFieldName = `followers_${'very_long_field_name_'.repeat(5)}`;
        const columns = new MergeQueryBuilder({
            sources: [{ ...sourceA, valueColumns: [longFieldName] }, sourceB],
            joinKeyNames: ['date_day'],
            joinType: MergeJoinType.FULL,
            warehouseSqlBuilder: mockWarehouseSqlBuilder,
        }).getColumns().valueColumnBySourceColumn;

        // Postgres truncates at 63 characters, which would collapse two
        // columns into one without saying so.
        expect(columns.a[longFieldName].length).toBeLessThanOrEqual(63);
    });

    describe('three sources', () => {
        const sourceC: MergeQuerySourceSql = {
            id: 'c',
            sql: 'SELECT date AS "date_day", 4 AS "unfollows" FROM unfollows',
            joinKeyColumnByName: { date_day: 'date_day' },
            valueColumns: ['unfollows'],
        };

        it('coalesces every preceding source into the join condition', () => {
            const sql = collapse(
                build(MergeJoinType.FULL, [sourceA, sourceB, sourceC]).toSql(),
            );

            // The third source must compare against the coalesce of the first
            // two: under a full join either earlier key can be null on a row
            // that source did not contribute.
            expect(sql).toContain(
                'ON COALESCE(merge_0_a."date_day", merge_1_b."date_day") IS NOT DISTINCT FROM merge_2_c."date_day"',
            );
        });

        it('joins every later source onto the first under a left join', () => {
            const sql = collapse(
                build(MergeJoinType.LEFT, [sourceA, sourceB, sourceC]).toSql(),
            );

            expect(sql).toContain(
                'ON merge_0_a."date_day" IS NOT DISTINCT FROM merge_2_c."date_day"',
            );
            expect(sql).not.toContain('COALESCE(');
        });
    });

    describe('composite join keys', () => {
        it('joins on every key part', () => {
            const withRegion = (source: MergeQuerySourceSql) => ({
                ...source,
                joinKeyColumnByName: {
                    ...source.joinKeyColumnByName,
                    region: 'region',
                },
            });
            const sql = collapse(
                new MergeQueryBuilder({
                    sources: [withRegion(sourceA), withRegion(sourceB)],
                    joinKeyNames: ['date_day', 'region'],
                    joinType: MergeJoinType.FULL,
                    warehouseSqlBuilder: mockWarehouseSqlBuilder,
                }).toSql(),
            );

            expect(sql).toContain(' AND ');
            expect(sql).toContain('AS "region"');
            expect(sql).toContain('ORDER BY "date_day", "region"');
        });
    });

    it('throws when a source has no column for a join key part', () => {
        expect(() =>
            new MergeQueryBuilder({
                sources: [sourceA, { ...sourceB, joinKeyColumnByName: {} }],
                joinKeyNames: ['date_day'],
                joinType: MergeJoinType.FULL,
                warehouseSqlBuilder: mockWarehouseSqlBuilder,
            }).toSql(),
        ).toThrow('has no column for join key "date_day"');
    });

    describe('null keys', () => {
        it.each([MergeJoinType.FULL, MergeJoinType.LEFT, MergeJoinType.INNER])(
            'matches null to null under a %s join, with no placeholder',
            (joinType) => {
                const sql = collapse(build(joinType).toSql());

                // The SELECT may coalesce the key for output; the ON clause
                // itself is the null-safe comparison
                const onClause = sql.slice(sql.indexOf(' ON '));
                expect(onClause).toContain(
                    'ON merge_0_a."date_day" IS NOT DISTINCT FROM merge_1_b."date_day"',
                );
                expect(onClause).not.toContain('COALESCE');
                expect(sql).not.toContain('1970-01-01');
            },
        );
    });

    describe('output aliases', () => {
        // Internal aliases are positional so they cannot breach an identifier
        // limit, which also makes them meaningless. Results keyed by a
        // meaningless name match no field downstream, so the outermost
        // projection renames them.
        it('renames columns for the caller in the outer projection', () => {
            const sql = collapse(
                build(MergeJoinType.FULL).toSql({
                    date_day: 'merge_date_day',
                    c0_0: 'a_new_organic',
                    c1_0: 'b_total_followers',
                }),
            );

            expect(sql).toContain('merged_output."c0_0" AS "a_new_organic"');
            expect(sql).toContain(
                'merged_output."c1_0" AS "b_total_followers"',
            );
            expect(sql).toContain(') AS merged_output');
        });

        it('orders by the renamed columns, not the internal ones', () => {
            const sql = collapse(
                build(MergeJoinType.FULL).toSql({
                    date_day: 'merge_date_day',
                }),
            );

            expect(sql).toContain('ORDER BY "merge_date_day"');
        });

        it('leaves the statement unrenamed when no aliases are given', () => {
            expect(collapse(build(MergeJoinType.FULL).toSql())).not.toContain(
                'merged_output',
            );
        });
    });

    // The canonical pipeline: join within each source, merge between
    // sources, pivot after — where "pivot after" is the standard pivot stage
    // wrapped around the merged statement by the composer, not anything this
    // builder does. What it CAN pin: calculations wrap the join, and a merge
    // input is never presentation-pivoted (there is no field to say so — the
    // invariant is held by the types, unrepresentable rather than refused).
    describe('golden shapes', () => {
        it('stages the statement as source -> merge -> calcs', () => {
            const sql = collapse(
                new MergeQueryBuilder({
                    sources: [sourceA, sourceB],
                    joinKeyNames: ['date_day'],
                    joinType: MergeJoinType.FULL,
                    warehouseSqlBuilder: mockWarehouseSqlBuilder,
                    tableCalculations: [
                        {
                            name: 'ratio',
                            displayName: 'Ratio',
                            sql: '${a.new_organic} / ${b.total_followers}',
                        },
                    ],
                }).toSql(),
            );

            // The stages nest: calcs wrap the join. Innermost executes first,
            // so outermost appears earliest in the text.
            const calcAt = sql.indexOf('merged_result.*');
            const joinAt = sql.indexOf('FULL OUTER JOIN');
            expect(calcAt).toBeGreaterThan(-1);
            expect(joinAt).toBeGreaterThan(calcAt);
            expect(sql).toContain('AS "ratio"');
        });
    });

    describe('sorting', () => {
        const sorted = (sorts: MergeSort[], sources = [sourceA, sourceB]) =>
            collapse(
                new MergeQueryBuilder({
                    sources,
                    joinKeyNames: ['date_day'],
                    joinType: MergeJoinType.FULL,
                    warehouseSqlBuilder: mockWarehouseSqlBuilder,
                    sorts,
                }).toSql(),
            );

        it('orders by the join key when no sort is asked for', () => {
            expect(collapse(build(MergeJoinType.FULL).toSql())).toContain(
                'ORDER BY "date_day"',
            );
        });

        it('orders by a merged column', () => {
            expect(sorted([{ column: 'c1_0', descending: true }])).toContain(
                'ORDER BY "c1_0" DESC',
            );
        });

        it('keeps sort order stable across several terms', () => {
            expect(
                sorted([
                    { column: 'date_day', descending: false },
                    { column: 'c0_1', descending: true },
                ]),
            ).toContain('ORDER BY "date_day", "c0_1" DESC');
        });

        it('refuses a sort on a column the merged result does not have', () => {
            expect(() =>
                sorted([{ column: 'nope', descending: false }]),
            ).toThrow(/no column for/);
        });

        // Left inside the wrapper the ordering sits in a subquery, which a
        // warehouse is free to discard, and a calculated column is not in
        // scope to sort on at all.
        it('orders outside the calculation wrapper', () => {
            const sql = collapse(
                new MergeQueryBuilder({
                    sources: [sourceA, sourceB],
                    joinKeyNames: ['date_day'],
                    joinType: MergeJoinType.FULL,
                    warehouseSqlBuilder: mockWarehouseSqlBuilder,
                    tableCalculations: [
                        {
                            name: 'ratio',
                            displayName: 'Ratio',
                            sql: '${a.new_organic} / ${b.total_followers}',
                        },
                    ],
                    sorts: [{ column: 'ratio', descending: true }],
                }).toSql(),
            );

            expect(sql).toContain('AS merged_result ORDER BY "ratio" DESC');
        });
    });

    describe('merge table calculations', () => {
        const withCalc = (sql: string) =>
            new MergeQueryBuilder({
                sources: [sourceA, sourceB],
                joinKeyNames: ['date_day'],
                joinType: MergeJoinType.FULL,
                warehouseSqlBuilder: mockWarehouseSqlBuilder,
                tableCalculations: [
                    { name: 'ratio', displayName: 'Ratio', sql },
                ],
            });

        it('resolves references to the merged column names', () => {
            const sql = collapse(
                withCalc('${a.new_organic} / ${b.total_followers}').toSql(),
            );

            expect(sql).toContain(
                'merged_result."c0_0" / merged_result."c1_0" AS "ratio"',
            );
            expect(sql).toContain('FROM ( WITH merge_0_a AS');
        });

        it('resolves a join key reference', () => {
            expect(collapse(withCalc('${date_day}').toSql())).toContain(
                'merged_result."date_day" AS "ratio"',
            );
        });

        it('computes over the merged row, not either source', () => {
            const sql = withCalc('${a.new_organic} + 1').toSql();
            // The calculation wraps the whole merged statement, so it sees the
            // joined row rather than one query's rows.
            expect(sql.indexOf('SELECT merged_result.*')).toBeLessThan(
                sql.indexOf('WITH merge_0_a'),
            );
        });

        it('refuses a reference the merged result has no column for', () => {
            expect(() => withCalc('${a.nope}').toSql()).toThrow(
                'has no column for',
            );
        });

        it('adds nothing when there are no calculations', () => {
            expect(build(MergeJoinType.FULL).toSql()).not.toContain(
                'merged_result',
            );
        });
    });

    it('applies the row limit to the merged statement', () => {
        expect(
            collapse(build(MergeJoinType.FULL, undefined, 10).toSql()),
        ).toContain('LIMIT 10');
    });

    // The output contract: the compile emits a composable core and a terminal
    // wrapper, and the statement that runs is exactly the wrapper applied to
    // the core. The core must stay clean under `SELECT *` — no ordering, no
    // limit — because a virtual view embeds it verbatim.
    describe('composable core and terminal wrapper', () => {
        const builderWithEverything = () =>
            new MergeQueryBuilder({
                sources: [sourceA, sourceB],
                joinKeyNames: ['date_day'],
                joinType: MergeJoinType.FULL,
                warehouseSqlBuilder: mockWarehouseSqlBuilder,
                limit: 25,
                tableCalculations: [
                    {
                        name: 'ratio',
                        displayName: 'Ratio',
                        sql: '${a.new_organic} / ${b.total_followers}',
                    },
                ],
            });

        it('emits a core with no ORDER BY and no LIMIT', () => {
            const core = builderWithEverything().toCoreSql({
                date_day: 'merge_date_day',
            });

            expect(core).not.toMatch(/ORDER BY/i);
            expect(core).not.toMatch(/\bLIMIT\b/);
            // Self-contained: one statement, starting at its own WITH.
            expect(core.startsWith('SELECT') || core.startsWith('WITH')).toBe(
                true,
            );
        });

        it('runs exactly the wrapper applied to the core', () => {
            const builder = builderWithEverything();
            const aliases = { date_day: 'merge_date_day' };

            expect(builder.toSql(aliases)).toBe(
                applyMergeTerminalWrapper(
                    builder.toCoreSql(aliases),
                    builder.buildTerminalWrapper(aliases),
                ),
            );
        });

        it('wraps sort and limit around whatever it is given', () => {
            const sql = collapse(
                applyMergeTerminalWrapper('SELECT 1 AS "date_day"', {
                    orderBy: ['"date_day"'],
                    limit: 10,
                }),
            );

            expect(sql).toBe(
                'SELECT 1 AS "date_day" ORDER BY "date_day" LIMIT 10',
            );
        });

        it('adds no wrapper layer when there is nothing terminal to add', () => {
            expect(
                applyMergeTerminalWrapper('SELECT 1 AS "date_day"', {
                    orderBy: [],
                    limit: null,
                }),
            ).toBe('SELECT 1 AS "date_day"');
        });

        // The provable bar: further queryability is not a claim, it is a
        // compile. A virtual view built from the core and the typed field
        // list must support a filtered, re-aggregated metric query with an
        // explicit custom aggregate — the exact shape a synthetic explore
        // would run.
        it('backs a virtual view that compiles a filtered, re-aggregated query', () => {
            const duckdb = warehouseSqlBuilderFromType(
                SupportedDbtAdapter.DUCKDB,
                WeekDay.MONDAY,
            );
            const core = new MergeQueryBuilder({
                sources: [sourceA, sourceB],
                joinKeyNames: ['date_day'],
                joinType: MergeJoinType.FULL,
                warehouseSqlBuilder: duckdb,
            }).toCoreSql({
                date_day: 'merge_date_day',
                c0_0: 'a_new_organic',
                c0_1: 'a_new_paid',
                c1_0: 'b_total_followers',
            });

            // What compileMergeQuery emits as typedColumns, VizColumn-shaped.
            const virtualView = createTemporaryVirtualView('merge', core, [
                { reference: 'merge_date_day', type: DimensionType.DATE },
                { reference: 'a_new_organic', type: DimensionType.NUMBER },
                { reference: 'a_new_paid', type: DimensionType.NUMBER },
                { reference: 'b_total_followers', type: DimensionType.NUMBER },
            ]);

            const metricQuery: MetricQuery = {
                exploreName: 'merge',
                dimensions: ['merge_merge_date_day'],
                metrics: ['merge_total_new_organic'],
                filters: {
                    dimensions: {
                        id: 'root',
                        and: [
                            {
                                id: 'f1',
                                target: { fieldId: 'merge_b_total_followers' },
                                operator: FilterOperator.GREATER_THAN,
                                values: [0],
                            },
                        ],
                    },
                },
                sorts: [],
                limit: 10,
                tableCalculations: [],
                additionalMetrics: [
                    {
                        table: 'merge',
                        name: 'total_new_organic',
                        type: MetricType.SUM,
                        sql: '${TABLE}.a_new_organic',
                    },
                ],
            };

            const compiledMetricQuery = compileMetricQuery({
                explore: virtualView,
                metricQuery,
                warehouseSqlBuilder: duckdb,
                availableParameters: [],
            });
            const { query } = new MetricQueryBuilder({
                explore: virtualView,
                compiledMetricQuery,
                warehouseSqlBuilder: duckdb,
                intrinsicUserAttributes: {},
                timezone: 'UTC',
                parameterDefinitions: {},
            }).compileQuery();

            // The core is embedded whole as the view's table...
            expect(query).toContain('merge_0_a AS (');
            // ...and the ordinary metric pipeline works on top of it.
            expect(query).toMatch(/SUM\(/);
            expect(query).toMatch(/GROUP BY/);
            expect(query).toContain('> (0)');
        });
    });
});
