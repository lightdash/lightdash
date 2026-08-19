import { DuckDBInstance } from '@duckdb/node-api';
import {
    DimensionType,
    MERGE_TRUNCATED_COLUMN,
    MergeJoinType,
    type MergeFieldTypes,
    type MergeQuery,
    type MetricQuery,
} from '@lightdash/common';
import { buildComposeMergeSql } from './composeMergeSql';

const metricQuery = (
    exploreName: string,
    dimensions: string[],
    metrics: string[],
): MetricQuery => ({
    exploreName,
    dimensions,
    metrics,
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
});

const mergeQuery: MergeQuery = {
    sources: [
        {
            id: 'a',
            metricQuery: metricQuery(
                'orders',
                ['orders_month'],
                ['orders_count'],
            ),
        },
        {
            id: 'b',
            metricQuery: metricQuery(
                'payments',
                ['payments_month'],
                ['payments_sum'],
            ),
        },
    ],
    joinKey: [
        {
            name: 'month',
            fieldIdBySourceId: { a: 'orders_month', b: 'payments_month' },
        },
    ],
    joinType: MergeJoinType.FULL,
    tableCalculations: [],
    limit: 500,
};

const fieldTypes: MergeFieldTypes = {
    a: {
        orders_month: { type: DimensionType.DATE, timeInterval: null },
    },
    b: {
        payments_month: { type: DimensionType.DATE, timeInterval: null },
    },
};

const outputAliasByColumn = {
    month: 'merge_month',
    c0_0: 'a_orders_count',
    c1_0: 'b_payments_sum',
};

const build = (
    overrides: Partial<Parameters<typeof buildComposeMergeSql>[0]> = {},
) =>
    buildComposeMergeSql({
        mergeQuery,
        fieldTypes,
        outputAliasByColumn,
        limit: 500,
        sourceRowCap: 100,
        ...overrides,
    });

/**
 * Executes the generated statement on a real in-memory DuckDB with the
 * reference tables predefined — exactly how the compose engine sees it,
 * minus the S3 read_json binding. This is the dialect-validity proof: the
 * FULL OUTER JOIN, typed null placeholders and truncation guard must run on
 * the actual engine, not just look plausible.
 */
const runOnDuckdb = async (
    sql: string,
    setupStatements: string[],
): Promise<Record<string, string | null>[]> => {
    const instance = await DuckDBInstance.create(':memory:');
    const connection = await instance.connect();
    try {
        for (const statement of setupStatements) {
            // eslint-disable-next-line no-await-in-loop -- DDL runs in order
            await connection.run(statement);
        }
        const reader = await connection.runAndReadAll(sql);
        return reader
            .getRowObjects()
            .map((row) =>
                Object.fromEntries(
                    Object.entries(row).map(([key, value]) => [
                        key,
                        value === null ? null : String(value),
                    ]),
                ),
            );
    } finally {
        connection.closeSync();
    }
};

const SETUP = [
    `CREATE TABLE merge_source_0 (orders_month DATE, orders_count BIGINT)`,
    `INSERT INTO merge_source_0 VALUES
        (DATE '2024-01-01', 5),
        (DATE '2024-02-01', 7),
        (NULL, 2)`,
    `CREATE TABLE merge_source_1 (payments_month DATE, payments_sum DOUBLE)`,
    `INSERT INTO merge_source_1 VALUES
        (DATE '2024-02-01', 20.5),
        (DATE '2024-03-01', 9),
        (NULL, 4)`,
];

describe('buildComposeMergeSql', () => {
    test('reads each source from its reference table', () => {
        const { sql, referenceTableBySourceId } = build();
        expect(referenceTableBySourceId).toEqual({
            a: 'merge_source_0',
            b: 'merge_source_1',
        });
        expect(sql).toContain('SELECT * FROM "merge_source_0"');
        expect(sql).toContain('SELECT * FROM "merge_source_1"');
    });

    test('joins with the shared null-safe semantics and typed placeholder', () => {
        const { sql } = build();
        expect(sql).toContain('FULL OUTER JOIN');
        expect(sql).toContain('IS NULL) = (');
        // The DATE-typed placeholder from the shared key-option derivation
        expect(sql).toContain('1970-01-01');
    });

    test('guards truncation by counting the capped reference tables', () => {
        const { sql } = build({ sourceRowCap: 100 });
        expect(sql).toContain(MERGE_TRUNCATED_COLUMN);
        expect(sql).toMatch(/SELECT COUNT\(\*\) FROM \(\s*SELECT \* FROM \(/);
        expect(sql).toContain('> 100');
    });

    test('full outer join merges on the key, keeps unmatched sides and matches null keys', async () => {
        const rows = await runOnDuckdb(build().sql, SETUP);
        expect(
            rows.map((row) => [
                row.merge_month,
                row.a_orders_count,
                row.b_payments_sum,
            ]),
        ).toEqual([
            ['2024-01-01', '5', null],
            ['2024-02-01', '7', '20.5'],
            ['2024-03-01', null, '9'],
            // Null keys match each other via the typed placeholder
            [null, '2', '4'],
        ]);
        expect(
            rows.every((row) => row[MERGE_TRUNCATED_COLUMN] === 'false'),
        ).toBe(true);
    });

    test('reports truncation when a source reaches the row cap', async () => {
        const rows = await runOnDuckdb(build({ sourceRowCap: 2 }).sql, SETUP);
        expect(
            rows.every((row) => row[MERGE_TRUNCATED_COLUMN] === 'true'),
        ).toBe(true);
    });

    test('left join keeps only the first source keys', async () => {
        const rows = await runOnDuckdb(
            build({
                mergeQuery: { ...mergeQuery, joinType: MergeJoinType.LEFT },
            }).sql,
            SETUP,
        );
        expect(rows.map((row) => row.merge_month)).toEqual([
            '2024-01-01',
            '2024-02-01',
            null,
        ]);
    });

    test('inner join keeps only shared keys', async () => {
        const rows = await runOnDuckdb(
            build({
                mergeQuery: { ...mergeQuery, joinType: MergeJoinType.INNER },
            }).sql,
            SETUP,
        );
        expect(
            rows.map((row) => [
                row.merge_month,
                row.a_orders_count,
                row.b_payments_sum,
            ]),
        ).toEqual([
            ['2024-02-01', '7', '20.5'],
            [null, '2', '4'],
        ]);
    });

    test('applies the merged-result limit', async () => {
        const rows = await runOnDuckdb(build({ limit: 2 }).sql, SETUP);
        expect(rows).toHaveLength(2);
    });

    test('compiles merge table calculations over the merged row', async () => {
        const rows = await runOnDuckdb(
            build({
                mergeQuery: {
                    ...mergeQuery,
                    tableCalculations: [
                        {
                            name: 'combined',
                            displayName: 'Combined',
                            sql: 'COALESCE(${a.orders_count}, 0) + COALESCE(${b.payments_sum}, 0)',
                        },
                    ],
                },
            }).sql,
            SETUP,
        );
        expect(
            rows.map((row) => [row.merge_month, Number(row.combined)]),
        ).toEqual([
            ['2024-01-01', 5],
            ['2024-02-01', 27.5],
            ['2024-03-01', 9],
            [null, 6],
        ]);
    });

    test('casts string keys before coalescing', () => {
        const { sql } = build({
            fieldTypes: {
                a: {
                    orders_month: {
                        type: DimensionType.STRING,
                        timeInterval: null,
                    },
                },
                b: {
                    payments_month: {
                        type: DimensionType.STRING,
                        timeInterval: null,
                    },
                },
            },
        });
        expect(sql).toContain('AS VARCHAR');
    });
});
