import { DimensionType } from './field';
import {
    buildMergeQueryFromSaved,
    getUnaccountedDimensions,
    MergeJoinType,
    MergeQueryErrorKind,
    parseSavedMergeQuery,
    SAVED_MERGE_QUERY_SCHEMA_VERSION,
    validateMergeQuery,
    type MergeQuery,
    type MergeQuerySource,
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

describe('saved merge query schemas', () => {
    it('round-trips every source and key in a version 2 payload', () => {
        const saved = {
            primarySourceId: 'payments',
            sources: [
                { id: 'orders', kind: 'chart' as const },
                {
                    id: 'payments',
                    kind: 'query' as const,
                    metricQuery: metricQuery(
                        'payments',
                        ['payments_month'],
                        ['payments_total'],
                    ),
                },
                {
                    id: 'subscriptions',
                    kind: 'query' as const,
                    metricQuery: metricQuery(
                        'subscriptions',
                        ['subscriptions_month'],
                        ['subscriptions_mrr'],
                    ),
                },
            ],
            joinKey: [
                {
                    name: 'month',
                    fieldIdBySourceId: {
                        orders: 'orders_month',
                        payments: 'payments_month',
                        subscriptions: 'subscriptions_month',
                    },
                },
            ],
            joinType: MergeJoinType.LEFT,
            tableCalculations: [],
        };

        const parsed = parseSavedMergeQuery(
            SAVED_MERGE_QUERY_SCHEMA_VERSION,
            saved,
        );
        expect(parsed).toEqual(saved);
        expect(
            buildMergeQueryFromSaved(
                metricQuery('orders', ['orders_month'], ['orders_total']),
                parsed!,
            ).sources.map(({ id }) => id),
        ).toEqual(['payments', 'orders', 'subscriptions']);
    });

    it('rejects unknown schemas and incomplete source mappings', () => {
        expect(parseSavedMergeQuery(1, {})).toBeNull();
        expect(parseSavedMergeQuery(99, {})).toBeNull();
        expect(
            parseSavedMergeQuery(SAVED_MERGE_QUERY_SCHEMA_VERSION, {
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
