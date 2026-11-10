import {
    computePreAggregateWarnings,
    PRE_AGGREGATE_FIELD_COUNT_WARNING_THRESHOLD,
} from './preAggregate';

describe('computePreAggregateWarnings', () => {
    test('warns before materializing when the definition has too many fields', () => {
        expect(computePreAggregateWarnings(null, { fieldCount: 881 })).toEqual([
            expect.objectContaining({
                type: 'field_count_exceeded',
                fieldCount: 881,
                threshold: PRE_AGGREGATE_FIELD_COUNT_WARNING_THRESHOLD,
            }),
        ]);
    });

    test('does not warn at the threshold', () => {
        expect(
            computePreAggregateWarnings(null, {
                fieldCount: PRE_AGGREGATE_FIELD_COUNT_WARNING_THRESHOLD,
            }),
        ).toEqual([]);
    });

    test('keeps row count warnings alongside the field count warning', () => {
        expect(
            computePreAggregateWarnings(
                { rowCount: 2_000_000 },
                { fieldCount: 150 },
            ).map((warning) => warning.type),
        ).toEqual(['field_count_exceeded', 'row_count_exceeded']);
    });
});
