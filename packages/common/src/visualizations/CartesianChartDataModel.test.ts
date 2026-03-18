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

describe('CartesianChartDataModel.filterToTopGroups', () => {
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

        const { filteredValuesColumns, filteredResults } =
            CartesianChartDataModel.filterToTopGroups(valuesColumns, results, {
                ...defaultGroupLimit,
                maxGroups: 3,
            });

        expect(filteredValuesColumns).toEqual(valuesColumns);
        expect(filteredResults).toEqual(results);
    });

    it('returns data unchanged when groups equal the limit', () => {
        const valuesColumns = [
            makeColumn('a'),
            makeColumn('b'),
            makeColumn('c'),
        ];
        const results = [{ date: '2024-01', a: 10, b: 20, c: 30 }];

        const { filteredValuesColumns, filteredResults } =
            CartesianChartDataModel.filterToTopGroups(valuesColumns, results, {
                ...defaultGroupLimit,
                maxGroups: 3,
            });

        expect(filteredValuesColumns).toEqual(valuesColumns);
        expect(filteredResults).toEqual(results);
    });

    it('keeps only top N groups and drops the rest', () => {
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

        const { filteredValuesColumns, filteredResults } =
            CartesianChartDataModel.filterToTopGroups(valuesColumns, results, {
                ...defaultGroupLimit,
                maxGroups: 2,
            });

        expect(filteredValuesColumns).toHaveLength(2);
        expect(filteredValuesColumns[0].pivotColumnName).toBe('a');
        expect(filteredValuesColumns[1].pivotColumnName).toBe('b');

        expect(filteredResults[0]).toEqual({
            date: '2024-01',
            a: 60,
            b: 30,
        });
        expect(filteredResults[1]).toEqual({
            date: '2024-02',
            a: 40,
            b: 20,
        });

        expect(filteredResults[0]).not.toHaveProperty('c');
        expect(filteredResults[0]).not.toHaveProperty('d');
    });

    it('ranks groups by absolute value so negative values are handled', () => {
        const valuesColumns = [
            makeColumn('a'),
            makeColumn('b'),
            makeColumn('c'),
        ];
        const results = [{ date: '2024-01', a: 100, b: -80, c: 10 }];

        const { filteredValuesColumns, filteredResults } =
            CartesianChartDataModel.filterToTopGroups(valuesColumns, results, {
                ...defaultGroupLimit,
                maxGroups: 2,
            });

        expect(filteredValuesColumns).toHaveLength(2);
        expect(filteredValuesColumns[0].pivotColumnName).toBe('a');
        expect(filteredValuesColumns[1].pivotColumnName).toBe('b');

        expect(filteredResults[0]).toEqual({
            date: '2024-01',
            a: 100,
            b: -80,
        });
    });

    it('works with maxGroups = 1', () => {
        const valuesColumns = [
            makeColumn('x'),
            makeColumn('y'),
            makeColumn('z'),
        ];
        const results = [{ date: '2024-01', x: 50, y: 30, z: 20 }];

        const { filteredValuesColumns, filteredResults } =
            CartesianChartDataModel.filterToTopGroups(valuesColumns, results, {
                ...defaultGroupLimit,
                maxGroups: 1,
            });

        expect(filteredValuesColumns).toHaveLength(1);
        expect(filteredValuesColumns[0].pivotColumnName).toBe('x');

        expect(filteredResults[0]).toEqual({ date: '2024-01', x: 50 });
        expect(filteredResults[0]).not.toHaveProperty('y');
        expect(filteredResults[0]).not.toHaveProperty('z');
    });

    it('handles all-zero values gracefully', () => {
        const valuesColumns = [
            makeColumn('a'),
            makeColumn('b'),
            makeColumn('c'),
            makeColumn('d'),
        ];
        const results = [{ date: '2024-01', a: 0, b: 0, c: 0, d: 0 }];

        const { filteredValuesColumns, filteredResults } =
            CartesianChartDataModel.filterToTopGroups(valuesColumns, results, {
                ...defaultGroupLimit,
                maxGroups: 2,
            });

        expect(filteredValuesColumns).toHaveLength(2);
        expect(filteredResults[0]).not.toHaveProperty('c');
        expect(filteredResults[0]).not.toHaveProperty('d');
    });
});
