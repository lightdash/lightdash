import {
    getUnaccountedDimensions,
    MergeJoinType,
    MergeQueryErrorKind,
    validateMergeQuery,
    type MergeQuery,
    type MergeQuerySource,
} from './mergeQuery';
import { type MetricQuery } from './metricQuery';

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
// followers split by source, query B reads total followers from daily
// snapshots. The join key is the date.
const queryA = (pivotDimensions: string[] = []): MergeQuerySource => ({
    id: 'a',
    metricQuery: metricQuery(
        'followers',
        ['followers_created_date', 'followers_source'],
        ['followers_count'],
    ),
    pivotDimensions,
});

const queryB = (): MergeQuerySource => ({
    id: 'b',
    metricQuery: metricQuery(
        'follower_snapshots',
        ['follower_snapshots_date'],
        ['follower_snapshots_total_followers'],
    ),
    pivotDimensions: [],
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
    postPivotKeyName: null,
    limit: 500,
    ...overrides,
});

describe('validateMergeQuery', () => {
    describe('the fan-out trap', () => {
        it('rejects a source carrying a dimension that is neither joined on nor pivoted', () => {
            const errors = validateMergeQuery(mergeQuery());

            expect(errors).toHaveLength(1);
            expect(errors[0]).toMatchObject({
                kind: MergeQueryErrorKind.FAN_OUT,
                sourceId: 'a',
                fieldIds: ['followers_source'],
            });
        });

        it('accepts the same merge once the extra dimension is pivoted away', () => {
            const errors = validateMergeQuery(
                mergeQuery({
                    sources: [queryA(['followers_source']), queryB()],
                }),
            );

            expect(errors).toEqual([]);
        });

        it('accepts the same merge once the extra dimension is dropped', () => {
            const source = queryA();
            const errors = validateMergeQuery(
                mergeQuery({
                    sources: [
                        {
                            ...source,
                            metricQuery: {
                                ...source.metricQuery,
                                dimensions: ['followers_created_date'],
                            },
                        },
                        queryB(),
                    ],
                }),
            );

            expect(errors).toEqual([]);
        });

        it('accepts the extra dimension when both sources have it and it joins', () => {
            // Both queries grouped by date and region: region belongs in the
            // join key, and the merge stays at grain without any pivot.
            const withRegion = (source: MergeQuerySource, field: string) => ({
                ...source,
                metricQuery: {
                    ...source.metricQuery,
                    dimensions: [...source.metricQuery.dimensions, field],
                },
            });

            const errors = validateMergeQuery(
                mergeQuery({
                    sources: [
                        withRegion(
                            {
                                ...queryA(),
                                metricQuery: metricQuery(
                                    'followers',
                                    ['followers_created_date'],
                                    ['followers_count'],
                                ),
                            },
                            'followers_region',
                        ),
                        withRegion(queryB(), 'follower_snapshots_region'),
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

    describe('pivot placement', () => {
        it('accepts a post-pivot on a join key part', () => {
            const errors = validateMergeQuery(
                mergeQuery({
                    sources: [queryA(['followers_source']), queryB()],
                    postPivotKeyName: 'date_day',
                }),
            );

            expect(errors).toEqual([]);
        });

        it('rejects a post-pivot naming something outside the join key', () => {
            const errors = validateMergeQuery(
                mergeQuery({
                    sources: [queryA(['followers_source']), queryB()],
                    postPivotKeyName: 'followers_source',
                }),
            );

            expect(errors).toHaveLength(1);
            expect(errors[0].kind).toBe(
                MergeQueryErrorKind.UNKNOWN_POST_PIVOT_KEY,
            );
        });

        it('rejects pre-pivoting the field the source joins on', () => {
            const errors = validateMergeQuery(
                mergeQuery({
                    sources: [
                        queryA(['followers_source', 'followers_created_date']),
                        queryB(),
                    ],
                }),
            );

            expect(errors).toHaveLength(1);
            expect(errors[0]).toMatchObject({
                kind: MergeQueryErrorKind.PIVOT_ON_JOIN_KEY,
                sourceId: 'a',
                fieldIds: ['followers_created_date'],
            });
        });

        it('rejects pre-pivoting a dimension the source does not select', () => {
            const errors = validateMergeQuery(
                mergeQuery({
                    sources: [queryA(['followers_campaign']), queryB()],
                }),
            );

            expect(errors.map((error) => error.kind)).toEqual(
                expect.arrayContaining([
                    MergeQueryErrorKind.PIVOT_DIMENSION_NOT_SELECTED,
                ]),
            );
        });
    });

    describe('shape of the merge', () => {
        it('rejects a merge with fewer than two sources', () => {
            const errors = validateMergeQuery(
                mergeQuery({ sources: [queryA(['followers_source'])] }),
            );

            expect(errors.map((error) => error.kind)).toEqual(
                expect.arrayContaining([MergeQueryErrorKind.TOO_FEW_SOURCES]),
            );
        });

        it('rejects duplicate source ids', () => {
            const errors = validateMergeQuery(
                mergeQuery({
                    sources: [
                        queryA(['followers_source']),
                        queryA(['followers_source']),
                    ],
                }),
            );

            expect(errors.map((error) => error.kind)).toEqual(
                expect.arrayContaining([
                    MergeQueryErrorKind.DUPLICATE_SOURCE_ID,
                ]),
            );
        });

        it('rejects an empty join key', () => {
            const errors = validateMergeQuery(
                mergeQuery({
                    sources: [queryA(['followers_source']), queryB()],
                    joinKey: [],
                }),
            );

            expect(errors.map((error) => error.kind)).toEqual(
                expect.arrayContaining([MergeQueryErrorKind.EMPTY_JOIN_KEY]),
            );
        });

        it('rejects a join key that does not cover every source', () => {
            const errors = validateMergeQuery(
                mergeQuery({
                    sources: [queryA(['followers_source']), queryB()],
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
                    sources: [queryA(['followers_source']), queryB()],
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
    });
});

describe('getUnaccountedDimensions', () => {
    it('reports the dimension that would fan the merge out', () => {
        expect(getUnaccountedDimensions(queryA(), dateJoinKey)).toEqual([
            'followers_source',
        ]);
    });

    it('reports nothing once the dimension is pivoted', () => {
        expect(
            getUnaccountedDimensions(queryA(['followers_source']), dateJoinKey),
        ).toEqual([]);
    });
});
