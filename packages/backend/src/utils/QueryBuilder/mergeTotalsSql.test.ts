import { DuckDBInstance } from '@duckdb/node-api';
import { type MergeColumnTotal } from '@lightdash/common';
import { buildMergeTotalsSql } from './mergeTotalsSql';

const columnTotals: Record<string, MergeColumnTotal> = {
    a_orders_total: { from: 'mergedRows', aggregation: 'sum' },
    a_orders_count: { from: 'mergedRows', aggregation: 'sum' },
    b_payments_unique: {
        from: 'sourceQuery',
        sourceId: 'b',
        sourceFieldId: 'payments_unique',
        sourceLabel: 'Payments',
    },
    b_payments_max: { from: 'mergedRows', aggregation: 'max' },
    b_payments_average: { from: null, reason: 'no' },
};

describe('buildMergeTotalsSql', () => {
    it('aggregates over the merged rows and reads each source total from its table, in column order', () => {
        const statement = buildMergeTotalsSql({
            fieldIds: [
                'merge_join_key_0',
                'a_orders_total',
                'a_orders_count',
                'b_payments_unique',
                'b_payments_max',
                'b_payments_average',
            ],
            columnTotals,
            sourceTotalTables: [
                {
                    sourceId: 'b',
                    table: 'source_total_1',
                    sourceFieldIds: ['payments_unique'],
                },
            ],
        });

        expect(statement?.fieldIds).toEqual([
            'a_orders_total',
            'a_orders_count',
            'b_payments_unique',
            'b_payments_max',
        ]);
        expect(statement?.sql).toBe(
            [
                'SELECT SUM("a_orders_total") AS "a_orders_total",',
                '       SUM("a_orders_count") AS "a_orders_count",',
                '       (SELECT "payments_unique" FROM "source_total_1") AS "b_payments_unique",',
                '       MAX("b_payments_max") AS "b_payments_max"',
                'FROM "merged_result"',
            ].join('\n'),
        );
    });

    // A source total the legs could not run (say, a period-over-period
    // metric) leaves its column out rather than reading a missing table.
    it('leaves out a source total no leg carries', () => {
        const statement = buildMergeTotalsSql({
            fieldIds: ['a_orders_total', 'b_payments_unique'],
            columnTotals,
            sourceTotalTables: [],
        });

        expect(statement?.fieldIds).toEqual(['a_orders_total']);
    });

    it.each([
        { rowCount: 0, includeMergedTotal: false },
        { rowCount: 2, includeMergedTotal: false },
        { rowCount: 0, includeMergedTotal: true },
        { rowCount: 2, includeMergedTotal: true },
    ])(
        'returns one totals row for $rowCount merged rows, merged aggregate: $includeMergedTotal',
        async ({ rowCount, includeMergedTotal }) => {
            const statement = buildMergeTotalsSql({
                fieldIds: includeMergedTotal
                    ? ['a_orders_total', 'b_payments_unique']
                    : ['b_payments_unique'],
                columnTotals,
                sourceTotalTables: [
                    {
                        sourceId: 'b',
                        table: 'source_total_1',
                        sourceFieldIds: ['payments_unique'],
                    },
                ],
            });
            if (!statement) throw new Error('Expected a totals statement');
            const instance = await DuckDBInstance.create(':memory:');
            const connection = await instance.connect();
            try {
                await connection.run(
                    `CREATE TABLE merged_result AS SELECT i::DOUBLE AS a_orders_total FROM range(${rowCount}) AS t(i)`,
                );
                await connection.run(
                    'CREATE TABLE source_total_1 AS SELECT 7::DOUBLE AS payments_unique',
                );
                const reader = await connection.runAndReadAll(statement.sql);
                expect(reader.getRowObjects()).toEqual([
                    {
                        ...(includeMergedTotal
                            ? { a_orders_total: rowCount === 0 ? null : 1 }
                            : {}),
                        b_payments_unique: 7,
                    },
                ]);
            } finally {
                connection.closeSync();
                instance.closeSync();
            }
        },
    );

    it('has nothing to run when no column has a total', () => {
        expect(
            buildMergeTotalsSql({
                fieldIds: ['merge_join_key_0', 'b_payments_average'],
                columnTotals,
                sourceTotalTables: [],
            }),
        ).toBeNull();
    });
});
