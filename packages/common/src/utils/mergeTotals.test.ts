import {
    DimensionType,
    FieldType,
    MetricType,
    type Metric,
} from '../types/field';
import {
    getMergeTotalAggregation,
    getMergeTotalUnavailableReason,
} from './mergeTotals';

const metric = (type: MetricType, label = 'Value'): Metric => ({
    fieldType: FieldType.METRIC,
    type,
    name: 'value',
    label,
    table: 'a',
    tableLabel: 'Orders',
    sql: '',
    hidden: false,
});

describe('merge totals', () => {
    it('has no total for a column that repeats on every matching row', () => {
        expect(getMergeTotalAggregation(metric(MetricType.SUM), true)).toBe(
            null,
        );
        expect(
            getMergeTotalUnavailableReason(metric(MetricType.SUM), true),
        ).toBe(
            'Value repeats on every matching row of the other query, so a total over the merged rows would count it more than once.',
        );
    });

    it.each([
        [MetricType.SUM, 'sum'],
        [MetricType.COUNT, 'sum'],
        [MetricType.MIN, 'min'],
        [MetricType.MAX, 'max'],
    ])('totals a %s over the merged rows with %s', (type, aggregation) => {
        expect(getMergeTotalAggregation(metric(type))).toBe(aggregation);
    });

    // An average of per-key averages, or a distinct count of distinct counts,
    // is a different number from the metric over all rows.
    it.each([
        MetricType.AVERAGE,
        MetricType.COUNT_DISTINCT,
        MetricType.SUM_DISTINCT,
        MetricType.MEDIAN,
        MetricType.PERCENTILE,
        MetricType.NUMBER,
        MetricType.PERCENT_OF_TOTAL,
    ])('has no exact total for a %s', (type) => {
        expect(getMergeTotalAggregation(metric(type))).toBeNull();
    });

    it('has no total for a dimension', () => {
        expect(
            getMergeTotalAggregation({
                fieldType: FieldType.DIMENSION,
                type: DimensionType.NUMBER,
                name: 'key',
                label: 'Key',
                table: 'merge',
                tableLabel: 'Merged',
                sql: '',
                hidden: false,
            }),
        ).toBeNull();
    });

    it("explains the missing total in the user's terms", () => {
        expect(
            getMergeTotalUnavailableReason(
                metric(MetricType.AVERAGE, 'Average rating'),
            ),
        ).toBe(
            'Totals over merged rows are exact only for sums, counts, minimums and maximums. Average rating is an average, so it has no total here.',
        );
    });
});
