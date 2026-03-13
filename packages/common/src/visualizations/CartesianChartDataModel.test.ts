import { CartesianChartDataModel } from './CartesianChartDataModel';
import { VizAggregationOptions, type PivotChartData } from './types';

const makeColumn = (
    name: string,
    referenceField = 'metric',
): PivotChartData['valuesColumns'][number] => ({
    referenceField,
    pivotColumnName: name,
    aggregation: VizAggregationOptions.SUM,
    pivotValues: [
        {
            referenceField: 'group_field',
            value: name,
            formatted: name,
        },
    ],
});

describe('CartesianChartDataModel.aggregateSmallGroups', () => {
    const defaultGroupLimit = {
        enabled: true,
        maxGroups: 3,
        otherLabel: 'Other',
    };

    it('returns data unchanged when fewer groups than limit', () => {
        const valuesColumns = [makeColumn('a'), makeColumn('b')];
        const results = [
            { date: '2024-01', a: 10, b: 20 },
            { date: '2024-02', a: 30, b: 40 },
        ];

        const { filteredValuesColumns, aggregatedResults } =
            CartesianChartDataModel.aggregateSmallGroups(
                valuesColumns,
                results,
                { ...defaultGroupLimit, maxGroups: 3 },
            );

        expect(filteredValuesColumns).toEqual(valuesColumns);
        expect(aggregatedResults).toEqual(results);
    });

    it('returns data unchanged when groups equal the limit', () => {
        const valuesColumns = [
            makeColumn('a'),
            makeColumn('b'),
            makeColumn('c'),
        ];
        const results = [{ date: '2024-01', a: 10, b: 20, c: 30 }];

        const { filteredValuesColumns, aggregatedResults } =
            CartesianChartDataModel.aggregateSmallGroups(
                valuesColumns,
                results,
                { ...defaultGroupLimit, maxGroups: 3 },
            );

        expect(filteredValuesColumns).toEqual(valuesColumns);
        expect(aggregatedResults).toEqual(results);
    });

    it('aggregates small groups into "Other" when more groups than limit', () => {
        // Totals: a=100, b=50, c=30, d=20
        // With maxGroups=2, top 2 are a and b; c and d go into "Other"
        const valuesColumns = [
            makeColumn('a'),
            makeColumn('b'),
            makeColumn('c'),
            makeColumn('d'),
        ];
        const results = [
            { date: '2024-01', a: 60, b: 30, c: 20, d: 10 },
            { date: '2024-02', a: 40, b: 20, c: 10, d: 10 },
        ];

        const { filteredValuesColumns, aggregatedResults } =
            CartesianChartDataModel.aggregateSmallGroups(
                valuesColumns,
                results,
                { ...defaultGroupLimit, maxGroups: 2 },
            );

        // Should have 2 top groups + "Other"
        expect(filteredValuesColumns).toHaveLength(3);
        expect(filteredValuesColumns[0].pivotColumnName).toBe('a');
        expect(filteredValuesColumns[1].pivotColumnName).toBe('b');
        expect(filteredValuesColumns[2].pivotColumnName).toBe('Other');

        // Row 1: Other = c(20) + d(10) = 30
        expect(aggregatedResults[0]).toEqual({
            date: '2024-01',
            a: 60,
            b: 30,
            Other: 30,
        });

        // Row 2: Other = c(10) + d(10) = 20
        expect(aggregatedResults[1]).toEqual({
            date: '2024-02',
            a: 40,
            b: 20,
            Other: 20,
        });

        // Individual "other" columns should be removed
        expect(aggregatedResults[0]).not.toHaveProperty('c');
        expect(aggregatedResults[0]).not.toHaveProperty('d');
    });

    it('handles all-zero values gracefully', () => {
        const valuesColumns = [
            makeColumn('a'),
            makeColumn('b'),
            makeColumn('c'),
            makeColumn('d'),
        ];
        const results = [{ date: '2024-01', a: 0, b: 0, c: 0, d: 0 }];

        const { filteredValuesColumns, aggregatedResults } =
            CartesianChartDataModel.aggregateSmallGroups(
                valuesColumns,
                results,
                { ...defaultGroupLimit, maxGroups: 2 },
            );

        // Should still produce 2 top groups + Other (even if all zeros)
        expect(filteredValuesColumns).toHaveLength(3);
        expect(
            filteredValuesColumns[filteredValuesColumns.length - 1]
                .pivotColumnName,
        ).toBe('Other');

        // Other value should be 0
        const otherVal =
            aggregatedResults[0][
                filteredValuesColumns[filteredValuesColumns.length - 1]
                    .pivotColumnName
            ];
        expect(otherVal).toBe(0);
    });

    it('ranks groups by absolute value so negative values are handled', () => {
        // abs totals: a=100, b=80, c=10
        // With maxGroups=1, top group is a; b and c go into "Other"
        const valuesColumns = [
            makeColumn('a'),
            makeColumn('b'),
            makeColumn('c'),
        ];
        const results = [{ date: '2024-01', a: 100, b: -80, c: 10 }];

        const { filteredValuesColumns, aggregatedResults } =
            CartesianChartDataModel.aggregateSmallGroups(
                valuesColumns,
                results,
                { ...defaultGroupLimit, maxGroups: 1 },
            );

        expect(filteredValuesColumns).toHaveLength(2);
        expect(filteredValuesColumns[0].pivotColumnName).toBe('a');
        expect(filteredValuesColumns[1].pivotColumnName).toBe('Other');

        // Other sums actual values (not abs): -80 + 10 = -70
        expect(aggregatedResults[0].Other).toBe(-70);
    });

    it('works with maxGroups = 1 producing only 1 group + "Other"', () => {
        // abs totals: x=50, y=30, z=20
        const valuesColumns = [
            makeColumn('x'),
            makeColumn('y'),
            makeColumn('z'),
        ];
        const results = [{ date: '2024-01', x: 50, y: 30, z: 20 }];

        const { filteredValuesColumns, aggregatedResults } =
            CartesianChartDataModel.aggregateSmallGroups(
                valuesColumns,
                results,
                { ...defaultGroupLimit, maxGroups: 1 },
            );

        expect(filteredValuesColumns).toHaveLength(2);
        expect(filteredValuesColumns[0].pivotColumnName).toBe('x');
        expect(filteredValuesColumns[1].pivotColumnName).toBe('Other');

        expect(aggregatedResults[0].Other).toBe(50); // y(30) + z(20)
        expect(aggregatedResults[0]).not.toHaveProperty('y');
        expect(aggregatedResults[0]).not.toHaveProperty('z');
    });

    it('uses a custom "Other" label when provided', () => {
        const valuesColumns = [
            makeColumn('a'),
            makeColumn('b'),
            makeColumn('c'),
        ];
        const results = [{ date: '2024-01', a: 100, b: 50, c: 10 }];

        const { filteredValuesColumns, aggregatedResults } =
            CartesianChartDataModel.aggregateSmallGroups(
                valuesColumns,
                results,
                { ...defaultGroupLimit, maxGroups: 1, otherLabel: 'Rest' },
            );

        expect(filteredValuesColumns[1].pivotColumnName).toBe('Rest');
        expect(aggregatedResults[0].Rest).toBe(60); // b(50) + c(10)
        expect(aggregatedResults[0]).not.toHaveProperty('Other');
    });

    it('collects pivot values from aggregated groups into the Other column', () => {
        const valuesColumns = [
            makeColumn('a'),
            makeColumn('b'),
            makeColumn('c'),
        ];
        const results = [{ date: '2024-01', a: 100, b: 50, c: 10 }];

        const { filteredValuesColumns } =
            CartesianChartDataModel.aggregateSmallGroups(
                valuesColumns,
                results,
                { ...defaultGroupLimit, maxGroups: 1 },
            );

        const otherCol =
            filteredValuesColumns[filteredValuesColumns.length - 1];
        // Should contain pivot values from both b and c
        expect(otherCol.pivotValues).toHaveLength(2);
        expect(otherCol.pivotValues[0].value).toBe('b');
        expect(otherCol.pivotValues[1].value).toBe('c');
    });

    it('shares the referenceField from the top group for correct stacking', () => {
        const valuesColumns = [
            makeColumn('a', 'my_metric'),
            makeColumn('b', 'my_metric'),
            makeColumn('c', 'my_metric'),
        ];
        const results = [{ date: '2024-01', a: 100, b: 50, c: 10 }];

        const { filteredValuesColumns } =
            CartesianChartDataModel.aggregateSmallGroups(
                valuesColumns,
                results,
                { ...defaultGroupLimit, maxGroups: 1 },
            );

        const otherCol =
            filteredValuesColumns[filteredValuesColumns.length - 1];
        expect(otherCol.referenceField).toBe('my_metric');
    });
});
