import {
    MergeJoinType,
    SupportedDbtAdapter,
    WeekDay,
    type WarehouseSqlBuilder,
} from '@lightdash/common';
import {
    MergeQueryBuilder,
    type MergeQuerySourceSql,
    type MergeSort,
} from './MergeQueryBuilder';

const mockWarehouseSqlBuilder = {
    getFieldQuoteChar: () => '"',
    getAdapterType: () => SupportedDbtAdapter.POSTGRES,
    supportsCteMaterialization: () => true,
    getStartOfWeek: () => WeekDay.MONDAY,
    getStringQuoteChar: () => "'",
    escapeString: (value: string) => value.replaceAll("'", "''"),
} as unknown as WarehouseSqlBuilder;

const collapse = (sql: string) => sql.replace(/\s+/g, ' ').trim();

// Query A: new followers per day, already pre-pivoted on source so it is
// unique on the date. Query B: total followers per day from snapshots.
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

    // Postgres rejects a FULL OUTER JOIN whose condition is not merge- or
    // hash-joinable, which rules out both the warehouse null-safe helper and
    // IS NOT DISTINCT FROM. Equality is used for every include mode so that
    // toggling full/left/inner never changes what a null key means.
    it('joins on plain equality, not the null-safe helper', () => {
        const sql = collapse(build(MergeJoinType.FULL).toSql());

        expect(sql).toContain('ON merge_0_a."date_day" = merge_1_b."date_day"');
        expect(sql).not.toContain('IS NULL');
        expect(sql).not.toContain('IS NOT DISTINCT FROM');
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
                'ON COALESCE(merge_0_a."date_day", merge_1_b."date_day") = merge_2_c."date_day"',
            );
        });

        it('joins every later source onto the first under a left join', () => {
            const sql = collapse(
                build(MergeJoinType.LEFT, [sourceA, sourceB, sourceC]).toSql(),
            );

            expect(sql).toContain(
                'ON merge_0_a."date_day" = merge_2_c."date_day"',
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

    describe('post-pivot', () => {
        const withRegion = (source: MergeQuerySourceSql) => ({
            ...source,
            joinKeyColumnByName: {
                ...source.joinKeyColumnByName,
                region: 'region',
            },
        });

        const buildPostPivot = (values = ['emea', 'amer']) =>
            new MergeQueryBuilder({
                sources: [withRegion(sourceA), withRegion(sourceB)],
                joinKeyNames: ['date_day', 'region'],
                joinType: MergeJoinType.FULL,
                warehouseSqlBuilder: mockWarehouseSqlBuilder,
                postPivot: { keyName: 'region', values, includeNulls: false },
            });

        it('widens every source column over the pivoted key part', () => {
            const sql = collapse(buildPostPivot().toSql());

            expect(sql).toContain(
                `CASE WHEN "region" = 'emea' THEN "c0_0" END`,
            );
            expect(sql).toContain(
                `CASE WHEN "region" = 'amer' THEN "c1_0" END`,
            );
        });

        it('groups by the remaining key parts, so one row per date survives', () => {
            const sql = collapse(buildPostPivot().toSql());

            expect(sql).toContain('GROUP BY "date_day"');
            expect(sql).toContain('ORDER BY "date_day"');
        });

        // The merge is already unique on the full join key, so each conditional
        // matches at most one row. Nothing is actually rolled up, which is why
        // a post-pivot is safe over metrics that do not sum (count distinct,
        // averages, ratios) — and why it is only offered on join key parts.
        //
        // The aggregate must still skip nulls: each group has one matching row
        // and N-1 nulls. Postgres compiles ANY to (ARRAY_AGG(x))[1], which
        // keeps the nulls and returns one whenever the matching row is not
        // first — silently blanking every column it touches.
        it('collapses with a null-skipping aggregate, never ANY', () => {
            const sql = collapse(buildPostPivot().toSql());

            expect(sql).toContain('max(CASE WHEN "region" =');
            expect(sql).not.toContain('ARRAY_AGG');
            expect(sql).not.toContain('sum(');
        });

        it('reports a column per source column per value', () => {
            const columns = buildPostPivot().getColumns();

            expect(columns.joinKeyColumns).toEqual(['date_day']);
            expect(columns.valueColumnBySourceColumn.a).toEqual({
                'new_organic.emea': 'c0_0_0_emea',
                'new_organic.amer': 'c0_0_1_amer',
                'new_paid.emea': 'c0_1_0_emea',
                'new_paid.amer': 'c0_1_1_amer',
            });
        });

        it('refuses to pivot on something outside the join key', () => {
            expect(
                () =>
                    new MergeQueryBuilder({
                        sources: [sourceA, sourceB],
                        joinKeyNames: ['date_day'],
                        joinType: MergeJoinType.FULL,
                        warehouseSqlBuilder: mockWarehouseSqlBuilder,
                        postPivot: {
                            keyName: 'new_organic',
                            values: ['x'],
                            includeNulls: false,
                        },
                    }),
            ).toThrow('is not part of the join key');
        });
    });

    describe('null keys', () => {
        it('leaves null keys unmatched when no placeholder is supplied', () => {
            const sql = collapse(build(MergeJoinType.FULL).toSql());

            // The SELECT still coalesces the key for output; it is the ON
            // clause that must stay a plain equality.
            const onClause = sql.slice(sql.indexOf(' ON '));
            expect(onClause).toContain(
                'ON merge_0_a."date_day" = merge_1_b."date_day"',
            );
            expect(onClause).not.toContain('COALESCE');
        });

        it('matches null to null when a placeholder is supplied', () => {
            const sql = collapse(
                new MergeQueryBuilder({
                    sources: [sourceA, sourceB],
                    joinKeyNames: ['date_day'],
                    joinType: MergeJoinType.FULL,
                    warehouseSqlBuilder: mockWarehouseSqlBuilder,
                    nullPlaceholderByKeyName: { date_day: "'1970-01-01'" },
                }).toSql(),
            );

            // Both terms are plain equalities, which is what keeps the
            // condition acceptable to Postgres under a FULL JOIN.
            expect(sql).toContain(
                '(merge_0_a."date_day" IS NULL) = (merge_1_b."date_day" IS NULL)',
            );
            expect(sql).toContain(
                `COALESCE(merge_0_a."date_day", '1970-01-01') = COALESCE(merge_1_b."date_day", '1970-01-01')`,
            );
            expect(sql).not.toContain('IS NOT DISTINCT FROM');
        });
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

    describe('the source row cap', () => {
        const withCap = (cap: number) =>
            new MergeQueryBuilder({
                sources: [sourceA, sourceB],
                joinKeyNames: ['date_day'],
                joinType: MergeJoinType.FULL,
                warehouseSqlBuilder: mockWarehouseSqlBuilder,
                sourceRowCap: cap,
            }).toSql();

        it('bounds each query one row past the cap, so hitting it is detectable', () => {
            expect(collapse(withCap(100))).toContain(') AS capped LIMIT 101');
        });

        it('reports that a query hit the cap instead of trimming it away', () => {
            const sql = collapse(withCap(100));

            expect(sql).toContain(
                '(SELECT COUNT(*) FROM merge_0_a) > 100 OR (SELECT COUNT(*) FROM merge_1_b) > 100',
            );
            expect(sql).toContain('AS "__merge_truncated"');
            expect(sql).toContain('CROSS JOIN merge_guard');
        });

        it('adds nothing when no cap is set', () => {
            const sql = build(MergeJoinType.FULL).toSql();

            expect(sql).not.toContain('merge_guard');
            expect(sql).not.toContain('AS capped');
        });
    });

    it('applies the row limit to the merged statement', () => {
        expect(
            collapse(build(MergeJoinType.FULL, undefined, 10).toSql()),
        ).toContain('LIMIT 10');
    });
});
