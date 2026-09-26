import {
    computePreAggregateWarnings,
    hasPreAggregateMaterializationReachedMaxRows,
} from './preAggregate';

describe('hasPreAggregateMaterializationReachedMaxRows', () => {
    it.each([
        { rowCount: 100, resolvedMaxRows: 100, expected: true },
        { rowCount: 101, resolvedMaxRows: 100, expected: true },
        { rowCount: 99, resolvedMaxRows: 100, expected: false },
        { rowCount: null, resolvedMaxRows: 100, expected: false },
        { rowCount: 100, resolvedMaxRows: null, expected: false },
        { rowCount: null, resolvedMaxRows: null, expected: false },
    ])(
        'returns $expected for rowCount=$rowCount and resolvedMaxRows=$resolvedMaxRows',
        ({ rowCount, resolvedMaxRows, expected }) => {
            expect(
                hasPreAggregateMaterializationReachedMaxRows({
                    rowCount,
                    resolvedMaxRows,
                }),
            ).toBe(expected);
        },
    );
});

describe('computePreAggregateWarnings', () => {
    it('emits max_rows_applied exactly when the materialization reached the cap', () => {
        const atCap = computePreAggregateWarnings(
            { rowCount: 100 },
            { materializationMaxRows: 100 },
        );
        expect(atCap).toEqual([
            expect.objectContaining({ type: 'max_rows_applied', maxRows: 100 }),
        ]);

        const underCap = computePreAggregateWarnings(
            { rowCount: 99 },
            { materializationMaxRows: 100 },
        );
        expect(underCap).toEqual([]);
    });
});
