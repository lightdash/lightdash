import { DuckDBInstance } from '@duckdb/node-api';
import {
    DimensionType,
    FieldType,
    MergeJoinType,
    MetricType,
    SupportedDbtAdapter,
    VizAggregationOptions,
    VizIndexType,
    type ItemsMap,
    type MergeFieldTypes,
    type MergeTypedColumn,
    type WarehouseClient,
} from '@lightdash/common';
import { buildComposeMergeSql } from './composeMergeSql';
import { applyMergeTerminalWrapper } from './MergeQueryBuilder';
import { MergeQueryComposer } from './MergeQueryComposer';

const duckdbWarehouseClient = {
    getFieldQuoteChar: () => '"',
    getAdapterType: () => SupportedDbtAdapter.DUCKDB,
    getStartOfWeek: () => undefined,
    getStringQuoteChar: () => "'",
    escapeString: (value: string) => value.replaceAll("'", "''"),
    supportsCteMaterialization: () => true,
    credentials: { type: 'duckdb' },
} as unknown as WarehouseClient;

const itemsMap = {
    merge_month: {
        fieldType: FieldType.DIMENSION,
        type: DimensionType.DATE,
        name: 'month',
        label: 'Month',
        table: 'merge',
        tableLabel: 'Merged',
        sql: '',
        hidden: false,
    },
    a_orders_count: {
        fieldType: FieldType.METRIC,
        type: MetricType.COUNT_DISTINCT,
        name: 'orders_count',
        label: 'Orders',
        table: 'a',
        tableLabel: 'Query A',
        sql: '',
        hidden: false,
    },
    b_payments_sum: {
        fieldType: FieldType.METRIC,
        type: MetricType.SUM,
        name: 'payments_sum',
        label: 'Payments',
        table: 'b',
        tableLabel: 'Query B',
        sql: '',
        hidden: false,
    },
} as ItemsMap;

const typedColumns: MergeTypedColumn[] = [
    {
        reference: 'merge_month',
        type: DimensionType.DATE,
        origin: {
            kind: 'joinKey',
            fieldIdBySourceId: { a: 'orders_month', b: 'payments_month' },
        },
    },
    {
        reference: 'a_orders_count',
        type: DimensionType.NUMBER,
        origin: {
            kind: 'source',
            sourceId: 'a',
            sourceFieldId: 'orders_count',
        },
    },
    {
        reference: 'b_payments_sum',
        type: DimensionType.NUMBER,
        origin: {
            kind: 'source',
            sourceId: 'b',
            sourceFieldId: 'payments_sum',
        },
    },
];

const joinKey = [
    {
        name: 'month',
        fieldIdBySourceId: { a: 'orders_month', b: 'payments_month' },
    },
];

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
        sources: [
            { id: 'a', valueColumns: ['orders_count'] },
            { id: 'b', valueColumns: ['payments_sum'] },
        ],
        joinKey,
        joinType: MergeJoinType.FULL,
        tableCalculations: [],
        fieldTypes,
        outputAliasByColumn,
        limit: 500,
        ...overrides,
    });

/** The runnable statement: the core with its terminal stage attached. */
const toSql = (result: ReturnType<typeof buildComposeMergeSql>) =>
    applyMergeTerminalWrapper(result.coreSql, result.terminalWrapper);

/**
 * Executes the generated statement on a real in-memory DuckDB with the
 * reference tables predefined — exactly how the compose engine sees it,
 * minus the S3 read_json binding. This is the dialect-validity proof: the
 * FULL OUTER JOIN and typed null placeholders must run on the actual engine,
 * not just look plausible.
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
        const built = build();
        const sql = toSql(built);
        const { referenceTableBySourceId } = built;
        expect(referenceTableBySourceId).toEqual({
            a: 'merge_source_0',
            b: 'merge_source_1',
        });
        expect(sql).toContain('SELECT * FROM "merge_source_0"');
        expect(sql).toContain('SELECT * FROM "merge_source_1"');
    });

    test('joins null-safe, so null keys match each other without a placeholder', () => {
        const sql = toSql(build());
        expect(sql).toContain('FULL OUTER JOIN');
        expect(sql).toContain('IS NOT DISTINCT FROM');
        expect(sql).not.toContain('1970-01-01');
    });

    // The sources are legs that already ran at the row cap, so a guard here
    // could never see past it. The run path reads the legs' own row counts
    // instead (getMergeRowCapError).
    test('carries no in-SQL row cap guard', () => {
        const sql = toSql(build());
        expect(sql).not.toContain('__merge');
        expect(sql).not.toContain('COUNT(*)');
    });

    test('full outer join merges on the key, keeps unmatched sides and matches null keys', async () => {
        const rows = await runOnDuckdb(toSql(build()), SETUP);
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
    });

    test('left join keeps only the first source keys', async () => {
        const rows = await runOnDuckdb(
            toSql(build({ joinType: MergeJoinType.LEFT })),
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
            toSql(build({ joinType: MergeJoinType.INNER })),
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
        const rows = await runOnDuckdb(toSql(build({ limit: 2 })), SETUP);
        expect(rows).toHaveLength(2);
    });

    test('compiles merge table calculations over the merged row', async () => {
        const rows = await runOnDuckdb(
            toSql(
                build({
                    tableCalculations: [
                        {
                            name: 'combined',
                            displayName: 'Combined',
                            sql: 'COALESCE(${a.orders_count}, 0) + COALESCE(${b.payments_sum}, 0)',
                        },
                    ],
                }),
            ),
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

    test('executes a formula over fields from both sources', async () => {
        const rows = await runOnDuckdb(
            toSql(
                build({
                    tableCalculations: [
                        {
                            name: 'ratio',
                            displayName: 'Ratio',
                            sql: '',
                            formula: '=a_orders_count / b_payments_sum',
                        },
                    ],
                }),
            ),
            SETUP,
        );

        expect(
            rows
                .filter((row) => row.a_orders_count && row.b_payments_sum)
                .map((row) => Number(row.ratio)),
        ).toEqual([7 / 20.5, 0.5]);
    });

    test('casts string keys before coalescing', () => {
        const sql = toSql(
            build({
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
            }),
        );
        expect(sql).toContain('AS VARCHAR');
    });

    test('pivots the merged result through the composer on the compose engine', async () => {
        const built = build();
        const composer = new MergeQueryComposer({
            coreSql: built.coreSql,
            terminalWrapper: built.terminalWrapper,
            itemsMap,
            typedColumns,
            columnOrder: ['merge_month', 'a_orders_count', 'b_payments_sum'],
            sorts: [],
            limit: 500,
            parameterReferences: [],
            usedParametersValues: {},
            warehouseClient: duckdbWarehouseClient,
            // Indexed pivot (groupByColumns present), so the DENSE_RANK
            // row/column-index pipeline compiles for the DuckDB dialect —
            // the shape a pivoted merged visualization sends
            pivotConfiguration: {
                indexColumn: {
                    reference: 'merge_month',
                    type: VizIndexType.TIME,
                },
                valuesColumns: [
                    {
                        reference: 'b_payments_sum',
                        aggregation: VizAggregationOptions.ANY,
                    },
                ],
                groupByColumns: [{ reference: 'a_orders_count' }],
                sortBy: undefined,
            },
        });
        const sql = composer.getSql({ columnLimit: 100 });
        expect(sql).toContain('row_index');
        expect(sql).toContain('column_index');

        const rows = await runOnDuckdb(sql, SETUP);
        // One pivot row per index value, tagged for the two-phase transform
        expect(rows.map((row) => [row.merge_month, row.row_index])).toEqual([
            ['2024-01-01', '1'],
            ['2024-02-01', '2'],
            ['2024-03-01', '3'],
            [null, '4'],
        ]);
        expect(rows.every((row) => Number(row.column_index) >= 1)).toBe(true);
    });
});

describe('multi-source scorecards', () => {
    const key = [
        {
            name: 'week',
            fieldIdBySourceId: { a: 'week', b: 'week', c: 'week' },
        },
        {
            name: 'team',
            fieldIdBySourceId: { a: 'team', b: 'team', c: 'team' },
        },
    ];
    const setup = [
        'CREATE TABLE merge_source_0 (week INTEGER, team VARCHAR, value DOUBLE)',
        "INSERT INTO merge_source_0 VALUES (1, 'X', 10), (NULL, 'X', 1)",
        'CREATE TABLE merge_source_1 (week INTEGER, team VARCHAR, value DOUBLE)',
        "INSERT INTO merge_source_1 VALUES (1, 'X', 20), (2, 'X', 30), (4, NULL, 4), (NULL, 'X', 2)",
        'CREATE TABLE merge_source_2 (week INTEGER, team VARCHAR, value DOUBLE)',
        "INSERT INTO merge_source_2 VALUES (1, 'X', 40), (2, 'X', 50), (2, 'Y', 60), (4, NULL, 8), (NULL, 'X', 3)",
    ];
    test.each([MergeJoinType.FULL, MergeJoinType.LEFT, MergeJoinType.INNER])(
        '%s joins match complete keys across all sources',
        async (joinType) => {
            const built = buildComposeMergeSql({
                sources: ['a', 'b', 'c'].map((id) => ({
                    id,
                    valueColumns: ['value'],
                })),
                joinKey: key,
                joinType,
                limit: 500,
                fieldTypes: Object.fromEntries(
                    ['a', 'b', 'c'].map((id) => [
                        id,
                        {
                            week: {
                                type: DimensionType.NUMBER,
                                timeInterval: null,
                            },
                            team: {
                                type: DimensionType.STRING,
                                timeInterval: null,
                            },
                        },
                    ]),
                ),
                outputAliasByColumn: {
                    week: 'merge_week',
                    team: 'merge_team',
                    c0_0: 'a_value',
                    c1_0: 'b_value',
                    c2_0: 'c_value',
                },
                tableCalculations: [
                    {
                        name: 'combined',
                        displayName: 'Combined',
                        sql: 'COALESCE(${a.value}, 0) + COALESCE(${b.value}, 0) + COALESCE(${c.value}, 0)',
                    },
                ],
            });
            const rows = await runOnDuckdb(toSql(built), setup);
            const common = [
                {
                    merge_week: '1',
                    merge_team: 'X',
                    a_value: '10',
                    b_value: '20',
                    c_value: '40',
                    combined: '70',
                },
                {
                    merge_week: null,
                    merge_team: 'X',
                    a_value: '1',
                    b_value: '2',
                    c_value: '3',
                    combined: '6',
                },
            ];
            expect(rows).toHaveLength(joinType === MergeJoinType.FULL ? 5 : 2);
            expect(rows).toEqual(expect.arrayContaining(common));
            if (joinType === MergeJoinType.FULL) {
                expect(rows).toEqual(
                    expect.arrayContaining([
                        {
                            merge_week: '2',
                            merge_team: 'X',
                            a_value: null,
                            b_value: '30',
                            c_value: '50',
                            combined: '80',
                        },
                        {
                            merge_week: '2',
                            merge_team: 'Y',
                            a_value: null,
                            b_value: null,
                            c_value: '60',
                            combined: '60',
                        },
                        {
                            merge_week: '4',
                            merge_team: null,
                            a_value: null,
                            b_value: '4',
                            c_value: '8',
                            combined: '12',
                        },
                    ]),
                );
            }
        },
    );

    test('joins seven independent explores without losing keys absent from the chart source', async () => {
        const sources = Array.from({ length: 7 }, (_, index) => ({
            id: `s${index}`,
            valueColumns: ['value'],
        }));
        const built = buildComposeMergeSql({
            sources,
            joinKey: [
                {
                    name: 'week',
                    fieldIdBySourceId: Object.fromEntries(
                        sources.map(({ id }) => [id, 'week']),
                    ),
                },
            ],
            joinType: MergeJoinType.FULL,
            limit: 500,
            fieldTypes: Object.fromEntries(
                sources.map(({ id }) => [
                    id,
                    {
                        week: {
                            type: DimensionType.NUMBER,
                            timeInterval: null,
                        },
                    },
                ]),
            ),
            outputAliasByColumn: {
                week: 'merge_week',
                ...Object.fromEntries(
                    sources.map(({ id }, index) => [
                        `c${index}_0`,
                        `${id}_value`,
                    ]),
                ),
            },
            tableCalculations: [
                {
                    name: 'combined',
                    displayName: 'Combined',
                    sql: sources
                        .map(({ id }) => `COALESCE(\${${id}.value}, 0)`)
                        .join(' + '),
                },
            ],
        });
        const rows = await runOnDuckdb(
            toSql(built),
            sources.flatMap((_, index) => [
                `CREATE TABLE merge_source_${index} (week INTEGER, value DOUBLE)`,
                `INSERT INTO merge_source_${index} VALUES (1, ${index + 1})${index > 0 ? `, (2, ${index + 1})` : ''}`,
            ]),
        );
        expect(rows).toHaveLength(2);
        expect(rows.find((row) => row.merge_week === '1')?.combined).toBe('28');
        expect(rows.find((row) => row.merge_week === '2')).toMatchObject({
            s0_value: null,
            s6_value: '7',
            combined: '27',
        });
    });
});
