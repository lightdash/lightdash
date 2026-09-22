import { SupportedDbtAdapter } from './dbt';
import { DimensionType } from './field';
import {
    buildMergeQueryFromMergeDefinition,
    buildMergeQueryFromSaved,
    buildSavedMergeDefinition,
    getMergeCompiledSqlText,
    getUnaccountedDimensions,
    getWarehouseDefaultNullsFirst,
    MAX_MERGE_TABLE_CALCULATION_FORMULA_LENGTH,
    MergeJoinType,
    MergeQueryErrorKind,
    normalizeSavedMergeDefinition,
    parseSavedMergeDefinition,
    parseSavedMergeQuery,
    parseStoredMergeDefinition,
    placeMergeSortNulls,
    resolveMergeSorts,
    SAVED_MERGE_QUERY_SCHEMA_VERSION_V2,
    toMergedSorts,
    upgradeSavedMergeQuery,
    validateMergeQuery,
    type MergeQuery,
    type MergeQuerySource,
    type SavedMergeQuery,
} from './mergeQuery';
import { type MetricQuery } from './metricQuery';
import { TimeFrames } from './timeFrames';

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

// The running example from the merge-queries field guide: query A counts new
// followers per day, query B reads total followers from daily snapshots. The
// join key is the date.
const queryA = (
    dimensions: string[] = ['followers_created_date'],
): MergeQuerySource => ({
    id: 'a',
    metricQuery: metricQuery('followers', dimensions, ['followers_count']),
});

const queryB = (): MergeQuerySource => ({
    id: 'b',
    metricQuery: metricQuery(
        'follower_snapshots',
        ['follower_snapshots_date'],
        ['follower_snapshots_total_followers'],
    ),
});

const dateJoinKey = [
    {
        name: 'date_day',
        fieldIdBySourceId: {
            a: 'followers_created_date',
            b: 'follower_snapshots_date',
        },
    },
];

const mergeQuery = (overrides: Partial<MergeQuery> = {}): MergeQuery => ({
    sources: [queryA(), queryB()],
    joinKey: dateJoinKey,
    joinType: MergeJoinType.FULL,
    tableCalculations: [],
    limit: 500,
    ...overrides,
});

describe('validateMergeQuery', () => {
    describe('the fan-out trap', () => {
        it('rejects a source carrying a dimension that is not joined on', () => {
            const errors = validateMergeQuery(
                mergeQuery({
                    sources: [
                        queryA(['followers_created_date', 'followers_source']),
                        queryB(),
                    ],
                }),
            );

            expect(errors).toHaveLength(1);
            expect(errors[0]).toMatchObject({
                kind: MergeQueryErrorKind.FAN_OUT,
                sourceId: 'a',
                fieldIds: ['followers_source'],
            });
        });

        it('accepts the same merge once the extra dimension is dropped', () => {
            expect(validateMergeQuery(mergeQuery())).toEqual([]);
        });

        // The lookup the user asked for: B's total repeats on every A row
        // that shares the date, and A keeps its split.
        it('accepts the extra dimension when the other source repeats its values', () => {
            const errors = validateMergeQuery(
                mergeQuery({
                    sources: [
                        queryA(['followers_created_date', 'followers_source']),
                        { ...queryB(), repeatValues: true },
                    ],
                }),
            );

            expect(errors).toEqual([]);
        });

        it('refuses a many-to-many join when both split sources repeat', () => {
            const errors = validateMergeQuery(
                mergeQuery({
                    sources: [
                        {
                            ...queryA([
                                'followers_created_date',
                                'followers_source',
                            ]),
                            repeatValues: true,
                        },
                        {
                            id: 'b',
                            repeatValues: true,
                            metricQuery: metricQuery(
                                'follower_snapshots',
                                [
                                    'follower_snapshots_date',
                                    'follower_snapshots_category',
                                ],
                                ['follower_snapshots_total_followers'],
                            ),
                        },
                    ],
                }),
            );
            expect(errors).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        kind: MergeQueryErrorKind.FAN_OUT,
                        sourceId: 'a',
                    }),
                    expect.objectContaining({
                        kind: MergeQueryErrorKind.FAN_OUT,
                        sourceId: 'b',
                    }),
                ]),
            );
        });

        it('still refuses the extra dimension when only the split source repeats', () => {
            const errors = validateMergeQuery(
                mergeQuery({
                    sources: [
                        {
                            ...queryA([
                                'followers_created_date',
                                'followers_source',
                            ]),
                            repeatValues: true,
                        },
                        queryB(),
                    ],
                }),
            );

            expect(errors.map((error) => error.kind)).toEqual([
                MergeQueryErrorKind.FAN_OUT,
            ]);
        });

        it('accepts the extra dimension when both sources have it and it joins', () => {
            // Both queries grouped by date and region: region belongs in the
            // join key, and the merge stays at grain.
            const errors = validateMergeQuery(
                mergeQuery({
                    sources: [
                        queryA(['followers_created_date', 'followers_region']),
                        {
                            ...queryB(),
                            metricQuery: metricQuery(
                                'follower_snapshots',
                                [
                                    'follower_snapshots_date',
                                    'follower_snapshots_region',
                                ],
                                ['follower_snapshots_total_followers'],
                            ),
                        },
                    ],
                    joinKey: [
                        ...dateJoinKey,
                        {
                            name: 'region',
                            fieldIdBySourceId: {
                                a: 'followers_region',
                                b: 'follower_snapshots_region',
                            },
                        },
                    ],
                }),
            );

            expect(errors).toEqual([]);
        });
    });

    describe('shape of the merge', () => {
        it('rejects a merge with fewer than two sources', () => {
            const errors = validateMergeQuery(
                mergeQuery({ sources: [queryA()] }),
            );

            expect(errors.map((error) => error.kind)).toEqual(
                expect.arrayContaining([MergeQueryErrorKind.TOO_FEW_SOURCES]),
            );
        });

        it('rejects a merge with more than two sources', () => {
            const queryC: MergeQuerySource = {
                id: 'c',
                metricQuery: metricQuery(
                    'unfollows',
                    ['unfollows_date'],
                    ['unfollows_count'],
                ),
            };
            const errors = validateMergeQuery(
                mergeQuery({
                    sources: [queryA(), queryB(), queryC],
                    joinKey: [
                        {
                            name: 'date_day',
                            fieldIdBySourceId: {
                                a: 'followers_created_date',
                                b: 'follower_snapshots_date',
                                c: 'unfollows_date',
                            },
                        },
                    ],
                }),
            );

            expect(errors.map((error) => error.kind)).toEqual(
                expect.arrayContaining([MergeQueryErrorKind.TOO_MANY_SOURCES]),
            );
        });

        it('rejects duplicate source ids', () => {
            const errors = validateMergeQuery(
                mergeQuery({ sources: [queryA(), queryA()] }),
            );

            expect(errors.map((error) => error.kind)).toEqual(
                expect.arrayContaining([
                    MergeQueryErrorKind.DUPLICATE_SOURCE_ID,
                ]),
            );
        });

        it('rejects "merge" as a source id', () => {
            const errors = validateMergeQuery(
                mergeQuery({
                    sources: [{ ...queryA(), id: 'merge' }, queryB()],
                    joinKey: [
                        {
                            name: 'date_day',
                            fieldIdBySourceId: {
                                merge: 'followers_created_date',
                                b: 'follower_snapshots_date',
                            },
                        },
                    ],
                }),
            );

            expect(errors.map((error) => error.kind)).toEqual(
                expect.arrayContaining([
                    MergeQueryErrorKind.RESERVED_SOURCE_ID,
                ]),
            );
        });

        it('rejects an empty join key', () => {
            const errors = validateMergeQuery(mergeQuery({ joinKey: [] }));

            expect(errors.map((error) => error.kind)).toEqual(
                expect.arrayContaining([MergeQueryErrorKind.EMPTY_JOIN_KEY]),
            );
        });

        it('rejects a join key that does not cover every source', () => {
            const errors = validateMergeQuery(
                mergeQuery({
                    joinKey: [
                        {
                            name: 'date_day',
                            fieldIdBySourceId: { a: 'followers_created_date' },
                        },
                    ],
                }),
            );

            expect(errors.map((error) => error.kind)).toEqual(
                expect.arrayContaining([
                    MergeQueryErrorKind.JOIN_KEY_COVERAGE,
                    // b's date is now unaccounted for as well.
                    MergeQueryErrorKind.FAN_OUT,
                ]),
            );
        });

        it('rejects a join key referencing an unknown source', () => {
            const errors = validateMergeQuery(
                mergeQuery({
                    joinKey: [
                        {
                            name: 'date_day',
                            fieldIdBySourceId: {
                                a: 'followers_created_date',
                                b: 'follower_snapshots_date',
                                c: 'ghost_date',
                            },
                        },
                    ],
                }),
            );

            expect(errors.map((error) => error.kind)).toEqual(
                expect.arrayContaining([
                    MergeQueryErrorKind.UNKNOWN_SOURCE_IN_JOIN_KEY,
                ]),
            );
        });

        it('rejects a join key naming a field a source does not group by', () => {
            const errors = validateMergeQuery(
                mergeQuery({
                    joinKey: [
                        {
                            name: 'date_day',
                            fieldIdBySourceId: {
                                a: 'followers_signup_date',
                                b: 'follower_snapshots_date',
                            },
                        },
                    ],
                }),
            );

            expect(errors).toContainEqual(
                expect.objectContaining({
                    kind: MergeQueryErrorKind.JOIN_KEY_NOT_SELECTED,
                    sourceId: 'a',
                    fieldIds: ['followers_signup_date'],
                }),
            );
        });
    });

    describe('merge calculations', () => {
        it('rejects two calculations sharing a name', () => {
            const errors = validateMergeQuery(
                mergeQuery({
                    tableCalculations: [
                        { name: 'net', displayName: 'Net', sql: '1' },
                        { name: 'net', displayName: 'Net again', sql: '2' },
                    ],
                }),
            );

            expect(errors).toEqual([
                expect.objectContaining({
                    kind: MergeQueryErrorKind.DUPLICATE_CALCULATION_NAME,
                    sourceId: null,
                    fieldIds: ['net'],
                }),
            ]);
        });

        it('rejects a formula that exceeds the parser limit', () => {
            const errors = validateMergeQuery(
                mergeQuery({
                    tableCalculations: [
                        {
                            name: 'too_large',
                            displayName: 'Too large',
                            sql: '',
                            formula: `=${'1+'.repeat(
                                MAX_MERGE_TABLE_CALCULATION_FORMULA_LENGTH,
                            )}1`,
                        },
                    ],
                }),
            );

            expect(errors).toEqual([
                expect.objectContaining({
                    kind: MergeQueryErrorKind.CALCULATION_FORMULA_TOO_LONG,
                    fieldIds: ['too_large'],
                }),
            ]);
        });
    });
});

describe('join key comparability', () => {
    const withTypes = (
        a: { type: DimensionType; timeInterval: TimeFrames | null },
        b: { type: DimensionType; timeInterval: TimeFrames | null },
    ) =>
        validateMergeQuery(mergeQuery(), {
            a: { followers_created_date: a },
            b: { follower_snapshots_date: b },
        });

    const day = {
        type: DimensionType.DATE,
        timeInterval: TimeFrames.DAY,
    };

    it('accepts two date fields at the same grain', () => {
        expect(withTypes(day, day)).toEqual([]);
    });

    it('accepts a date joined to a timestamp at the same grain', () => {
        // Every supported warehouse compares these; the grain is what matters.
        expect(
            withTypes(day, {
                type: DimensionType.TIMESTAMP,
                timeInterval: TimeFrames.DAY,
            }),
        ).toEqual([]);
    });

    it('rejects a date joined to a string', () => {
        const errors = withTypes(day, {
            type: DimensionType.STRING,
            timeInterval: null,
        });

        expect(errors).toHaveLength(1);
        expect(errors[0].kind).toBe(MergeQueryErrorKind.JOIN_KEY_TYPE_MISMATCH);
    });

    it('rejects a month joined to a day', () => {
        const errors = withTypes(day, {
            type: DimensionType.DATE,
            timeInterval: TimeFrames.MONTH,
        });

        expect(errors).toHaveLength(1);
        expect(errors[0].kind).toBe(
            MergeQueryErrorKind.JOIN_KEY_GRANULARITY_MISMATCH,
        );
    });

    it('keeps types separate when two sources use the same field id', () => {
        const query = mergeQuery({
            sources: [
                queryA(['shared']),
                {
                    ...queryB(),
                    metricQuery: metricQuery(
                        'follower_snapshots',
                        ['shared'],
                        [],
                    ),
                },
            ],
            joinKey: [
                {
                    name: 'shared',
                    fieldIdBySourceId: { a: 'shared', b: 'shared' },
                },
            ],
        });
        const errors = validateMergeQuery(query, {
            a: { shared: day },
            b: {
                shared: { type: DimensionType.STRING, timeInterval: null },
            },
        });

        expect(errors.map(({ kind }) => kind)).toContain(
            MergeQueryErrorKind.JOIN_KEY_TYPE_MISMATCH,
        );
    });

    it('skips the checks when no field types are supplied', () => {
        expect(validateMergeQuery(mergeQuery())).toEqual([]);
    });
});

describe('result sources', () => {
    const resultSource = { id: 'b', queryUuid: 'existing-query-uuid' };

    test('defer structural checks the validator cannot see to the compiler', () => {
        const errors = validateMergeQuery(
            mergeQuery({ sources: [queryA(), resultSource] }),
        );
        // No fan-out or join-key-not-selected errors for the result source:
        // its structure lives in stored metadata the compiler resolves.
        expect(errors).toEqual([]);
    });

    test('still validates join key coverage for result sources', () => {
        const errors = validateMergeQuery(
            mergeQuery({
                sources: [queryA(), resultSource],
                joinKey: [
                    {
                        name: 'date_day',
                        fieldIdBySourceId: { a: 'followers_created_date' },
                    },
                ],
            }),
        );
        expect(errors.map((error) => error.kind)).toContain(
            MergeQueryErrorKind.JOIN_KEY_COVERAGE,
        );
    });

    test('contribute no unaccounted dimensions', () => {
        expect(getUnaccountedDimensions(resultSource, dateJoinKey)).toEqual([]);
    });
});

describe('getUnaccountedDimensions', () => {
    it('reports the dimension that would fan the merge out', () => {
        expect(
            getUnaccountedDimensions(
                queryA(['followers_created_date', 'followers_source']),
                dateJoinKey,
            ),
        ).toEqual(['followers_source']);
    });

    it('reports nothing when every dimension joins', () => {
        expect(getUnaccountedDimensions(queryA(), dateJoinKey)).toEqual([]);
    });
});

describe('saved merge schemas', () => {
    const chart: MetricQuery = {
        ...metricQuery('orders', ['orders_order_date_month'], ['orders_total']),
        sorts: [{ fieldId: 'orders_order_date_month', descending: true }],
    };
    const paymentsQuery = metricQuery(
        'payments',
        ['orders_order_date_month'],
        ['payments_unique'],
    );
    const savedV2: SavedMergeQuery = {
        primarySourceId: 'a',
        sources: [
            { id: 'a', kind: 'chart' },
            { id: 'b', kind: 'query', metricQuery: paymentsQuery },
        ],
        joinKey: [
            {
                name: 'join_key_0',
                fieldIdBySourceId: {
                    a: 'orders_order_date_month',
                    b: 'orders_order_date_month',
                },
            },
        ],
        joinType: MergeJoinType.LEFT,
        tableCalculations: [],
        repeatValuesSourceIds: ['b'],
    };

    it('accepts either request shape and normalizes it to schema v3', () => {
        const definition = upgradeSavedMergeQuery(savedV2, chart)!;
        expect(normalizeSavedMergeDefinition(savedV2, chart)).toEqual(
            definition,
        );
        expect(normalizeSavedMergeDefinition(definition, chart)).toEqual(
            definition,
        );
        expect(
            normalizeSavedMergeDefinition(
                { ...definition, queries: {} },
                chart,
            ),
        ).toBeNull();
    });

    // A v2 row keeps the ids it had, so no chart config moves: the chart is
    // still `a`, the other query `b`, the key column `merge_join_key_0`.
    it('upgrades a version 2 merge while keeping its field ids', () => {
        const merge = upgradeSavedMergeQuery(savedV2, chart);

        expect(merge).toEqual({
            chartAs: 'a',
            queries: {
                b: {
                    explore: 'payments',
                    dimensions: ['orders_order_date_month'],
                    metrics: ['payments_unique'],
                    repeat: true,
                },
            },
            join: MergeJoinType.LEFT,
            keys: { orders_order_date_month: ['b.orders_order_date_month'] },
            keyNames: { orders_order_date_month: 'join_key_0' },
            sort: [{ by: 'orders_order_date_month', direction: 'desc' }],
            limit: 500,
        });
        expect(
            parseStoredMergeDefinition({
                schemaVersion: SAVED_MERGE_QUERY_SCHEMA_VERSION_V2,
                value: savedV2,
                chartMetricQuery: chart,
            }),
        ).toEqual(merge);
        // The runnable merge is the one the v2 shape produced
        expect(buildMergeQueryFromMergeDefinition(chart, merge!)).toEqual(
            buildMergeQueryFromSaved(chart, savedV2),
        );
    });

    it('has no merge form for a version 2 merge whose primary was not the chart', () => {
        expect(
            upgradeSavedMergeQuery({ ...savedV2, primarySourceId: 'b' }, chart),
        ).toBeNull();
    });

    // A chart saved today goes by its explore's name, and so does each
    // other query, so the file and the merged column ids read the same.
    it('saves a merge using its source names', () => {
        const runnable: MergeQuery = {
            sources: [
                { id: 'orders', metricQuery: chart },
                {
                    id: 'payments',
                    metricQuery: { ...paymentsQuery, timezone: 'UTC' },
                },
            ],
            joinKey: [
                {
                    name: 'orders_order_date_month',
                    fieldIdBySourceId: {
                        orders: 'orders_order_date_month',
                        payments: 'orders_order_date_month',
                    },
                },
            ],
            joinType: MergeJoinType.FULL,
            tableCalculations: [
                { name: 'ratio', displayName: 'Ratio', sql: '1' },
            ],
            sorts: [
                { fieldId: 'payments_payments_unique', descending: true },
                { fieldId: 'merge_orders_order_date_month', descending: false },
                { fieldId: 'orders_orders_total', descending: false },
                { fieldId: 'merge_ratio', descending: true },
            ],
            limit: 250,
        };
        const merge = buildSavedMergeDefinition({
            mergeQuery: runnable,
            chartSourceId: 'orders',
        });

        expect(merge).toEqual({
            queries: {
                payments: {
                    explore: 'payments',
                    dimensions: ['orders_order_date_month'],
                    metrics: ['payments_unique'],
                    timezone: 'UTC',
                },
            },
            join: MergeJoinType.FULL,
            keys: {
                orders_order_date_month: ['payments.orders_order_date_month'],
            },
            sort: [
                { by: 'payments.payments_unique', direction: 'desc' },
                { by: 'orders_order_date_month', direction: 'asc' },
                { by: 'orders_total', direction: 'asc' },
                { by: 'ratio', direction: 'desc' },
            ],
            limit: 250,
            tableCalculations: [
                { name: 'ratio', displayName: 'Ratio', sql: '1' },
            ],
        });
        expect(
            parseSavedMergeDefinition(JSON.parse(JSON.stringify(merge))),
        ).toEqual(merge);
        expect(buildMergeQueryFromMergeDefinition(chart, merge)).toEqual({
            ...runnable,
            sources: [
                runnable.sources[0],
                {
                    id: 'payments',
                    metricQuery: {
                        ...paymentsQuery,
                        timezone: 'UTC',
                        limit: 250,
                    },
                },
            ],
        });
    });

    it('refuses to save a merge over an existing result or without the chart query', () => {
        expect(() =>
            buildSavedMergeDefinition({
                mergeQuery: {
                    sources: [
                        { id: 'orders', metricQuery: chart },
                        { id: 'b', queryUuid: 'result-uuid' },
                    ],
                    joinKey: [],
                    joinType: MergeJoinType.FULL,
                    tableCalculations: [],
                    limit: 500,
                },
                chartSourceId: 'orders',
            }),
        ).toThrow('cannot be saved');
        expect(() =>
            buildSavedMergeDefinition({
                mergeQuery: {
                    sources: [{ id: 'b', metricQuery: chart }],
                    joinKey: [],
                    joinType: MergeJoinType.FULL,
                    tableCalculations: [],
                    limit: 500,
                },
                chartSourceId: 'orders',
            }),
        ).toThrow('requires the chart query');
    });

    it('rejects a merge that does not hold together', () => {
        const valid = upgradeSavedMergeQuery(savedV2, chart)!;
        expect(parseSavedMergeDefinition(null)).toBeNull();
        expect(parseSavedMergeDefinition({ ...valid, queries: {} })).toBeNull();
        // A query name is a merged table name
        expect(
            parseSavedMergeDefinition({
                ...valid,
                queries: { merge: valid.queries.b },
            }),
        ).toBeNull();
        expect(
            parseSavedMergeDefinition({
                ...valid,
                queries: { 'pay.ments': valid.queries.b },
            }),
        ).toBeNull();
        // Every key reaches every query, once
        expect(parseSavedMergeDefinition({ ...valid, keys: {} })).toBeNull();
        expect(
            parseSavedMergeDefinition({
                ...valid,
                keys: { orders_order_date_month: [] },
            }),
        ).toBeNull();
        expect(
            parseSavedMergeDefinition({
                ...valid,
                keys: {
                    orders_order_date_month: ['ghost.orders_order_date_month'],
                },
            }),
        ).toBeNull();
        // No join type fallback, no sort without a direction
        expect(
            parseSavedMergeDefinition({ ...valid, join: 'cross' }),
        ).toBeNull();
        expect(
            parseSavedMergeDefinition({
                ...valid,
                sort: [{ by: 'orders_total' }],
            }),
        ).toBeNull();
        expect(parseSavedMergeDefinition(valid)).toEqual(valid);
    });

    it('leaves a chart without its merge on an unknown schema version', () => {
        expect(
            parseStoredMergeDefinition({
                schemaVersion: 1,
                value: savedV2,
                chartMetricQuery: chart,
            }),
        ).toBeNull();
        expect(
            parseStoredMergeDefinition({
                schemaVersion: 99,
                value: upgradeSavedMergeQuery(savedV2, chart),
                chartMetricQuery: chart,
            }),
        ).toBeNull();
    });

    it('rejects a version 2 merge with incomplete source mappings', () => {
        expect(parseSavedMergeQuery(savedV2)).toEqual(savedV2);
        expect(
            parseSavedMergeQuery({
                primarySourceId: 'orders',
                sources: [
                    { id: 'orders', kind: 'chart' },
                    {
                        id: 'payments',
                        kind: 'query',
                        metricQuery: metricQuery('payments', [], []),
                    },
                ],
                joinKey: [
                    {
                        name: 'month',
                        fieldIdBySourceId: { orders: 'orders_month' },
                    },
                ],
                joinType: 'full',
                tableCalculations: [],
            }),
        ).toBeNull();
    });
});

describe('getMergeCompiledSqlText', () => {
    it('lists each leg under its source, then the join', () => {
        const text = getMergeCompiledSqlText({
            legs: [
                {
                    sourceId: 'orders',
                    sql: 'SELECT 1 AS orders_month',
                    metricQuery: null,
                },
                { sourceId: 'payments', sql: null, metricQuery: null },
            ],
            sql: 'SELECT * FROM "merge_source_0" FULL OUTER JOIN "merge_source_1" USING (month)',
        });

        expect(text).toBe(
            [
                '-- Query A ("orders"): runs on the warehouse',
                'SELECT 1 AS orders_month',
                '',
                '-- Query B ("payments"): existing results, nothing runs',
                '',
                '-- Merge: runs on the compose engine over the results above, read as merge_source_0, merge_source_1, ...',
                'SELECT * FROM "merge_source_0" FULL OUTER JOIN "merge_source_1" USING (month)',
            ].join('\n'),
        );
    });

    it('is null when the merge did not compile', () => {
        expect(getMergeCompiledSqlText({ legs: [], sql: null })).toBeNull();
    });
});

describe('merge sorts', () => {
    const joinKey = [
        {
            name: 'join_key_0',
            fieldIdBySourceId: { a: 'orders_month', b: 'payments_month' },
        },
    ];
    const primary = metricQuery(
        'orders',
        ['orders_month', 'orders_status'],
        ['orders_total'],
    );

    // The Explorer's sort state belongs to the primary query, so a sort set
    // before merging names a primary field; the merged result knows that
    // field by its source-prefixed id, or as the join key column.
    it('maps a primary field sort to its merged column, and a key sort to the join key column', () => {
        expect(
            toMergedSorts({
                sorts: [
                    { fieldId: 'orders_total', descending: true },
                    { fieldId: 'orders_month', descending: false },
                ],
                primarySourceId: 'a',
                primaryMetricQuery: primary,
                joinKey,
            }),
        ).toEqual([
            { fieldId: 'a_orders_total', descending: true },
            { fieldId: 'merge_join_key_0', descending: false },
        ]);
    });

    it('passes a sort set on the merged table through unchanged', () => {
        expect(
            toMergedSorts({
                sorts: [{ fieldId: 'b_payments_count', descending: true }],
                primarySourceId: 'a',
                primaryMetricQuery: primary,
                joinKey,
            }),
        ).toEqual([{ fieldId: 'b_payments_count', descending: true }]);
    });

    it('keeps only the sorts the merged result can honour', () => {
        expect(
            resolveMergeSorts(
                [
                    { fieldId: 'a_orders_total', descending: true },
                    { fieldId: 'gone', descending: false },
                ],
                ['merge_join_key_0', 'a_orders_total'],
            ),
        ).toEqual([{ fieldId: 'a_orders_total', descending: true }]);
        expect(resolveMergeSorts(undefined, ['a_orders_total'])).toEqual([]);
    });
});

describe('null placement of a merged sort', () => {
    // Each warehouse's documented default when a sort says nothing.
    it.each([
        [SupportedDbtAdapter.POSTGRES, true, false],
        [SupportedDbtAdapter.SNOWFLAKE, true, false],
        [SupportedDbtAdapter.REDSHIFT, true, false],
        [SupportedDbtAdapter.TRINO, true, false],
        [SupportedDbtAdapter.ATHENA, true, false],
        [SupportedDbtAdapter.BIGQUERY, false, true],
        [SupportedDbtAdapter.DATABRICKS, false, true],
        [SupportedDbtAdapter.SPARK, false, true],
        [SupportedDbtAdapter.DUCKDB, false, false],
        [SupportedDbtAdapter.CLICKHOUSE, false, false],
    ])(
        '%s puts nulls first on DESC: %s, on ASC: %s',
        (adapter, descendingNullsFirst, ascendingNullsFirst) => {
            expect(getWarehouseDefaultNullsFirst(adapter, true)).toBe(
                descendingNullsFirst,
            );
            expect(getWarehouseDefaultNullsFirst(adapter, false)).toBe(
                ascendingNullsFirst,
            );
        },
    );

    it('states the warehouse default only where the sort says nothing', () => {
        expect(
            placeMergeSortNulls(
                [
                    { fieldId: 'a_total', descending: true },
                    { fieldId: 'b_count', descending: true, nullsFirst: false },
                ],
                SupportedDbtAdapter.POSTGRES,
            ),
        ).toEqual([
            { fieldId: 'a_total', descending: true, nullsFirst: true },
            { fieldId: 'b_count', descending: true, nullsFirst: false },
        ]);
    });
});
