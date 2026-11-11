import {
    VizAggregationOptions,
    type PivotValuesColumn,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getPivotColumnLimitMessage,
    isWithinChartColumnLimit,
} from './usePivotColumnLimitMessage';

describe('getPivotColumnLimitMessage', () => {
    it('warns that groups are left out when they exceed the limit', () => {
        expect(
            getPivotColumnLimitMessage({
                totalColumnCount: 412,
                maxColumnLimit: 200,
            }),
        ).toBe(
            'Results limited to 200 of 412 columns. Filter the chart or group by a field with fewer values to show all results.',
        );
    });

    it('says the rest are in "Other" when they were folded in', () => {
        expect(
            getPivotColumnLimitMessage({
                totalColumnCount: 412,
                maxColumnLimit: 200,
                hasOtherGroup: true,
            }),
        ).toBe(
            'This chart has 412 grouped columns. The first 200 are shown and the rest are added together as "Other".',
        );
    });

    it.each([
        { totalColumnCount: 200, maxColumnLimit: 200 },
        { totalColumnCount: 3, maxColumnLimit: 200 },
        { totalColumnCount: null, maxColumnLimit: 200 },
        { totalColumnCount: undefined, maxColumnLimit: 200 },
        { totalColumnCount: 412, maxColumnLimit: undefined },
    ])(
        'returns null for $totalColumnCount columns with a limit of $maxColumnLimit',
        (args) => {
            expect(getPivotColumnLimitMessage(args)).toBeNull();
        },
    );
});

describe('isWithinChartColumnLimit', () => {
    const columnFor = (referenceField: string): PivotValuesColumn => ({
        referenceField,
        pivotColumnName: `${referenceField}_any_a`,
        aggregation: VizAggregationOptions.ANY,
        pivotValues: [],
    });
    const oneMetric = [columnFor('orders_total')];
    const twoMetrics = [columnFor('orders_total'), columnFor('orders_count')];

    it.each([
        { chartColumnLimit: 5, valuesColumns: oneMetric, expected: true },
        { chartColumnLimit: 200, valuesColumns: oneMetric, expected: true },
        { chartColumnLimit: 201, valuesColumns: oneMetric, expected: false },
        // Two metrics share the 200 columns, so each keeps 100 groups
        { chartColumnLimit: 100, valuesColumns: twoMetrics, expected: true },
        { chartColumnLimit: 150, valuesColumns: twoMetrics, expected: false },
        {
            chartColumnLimit: undefined,
            valuesColumns: oneMetric,
            expected: false,
        },
    ])(
        'is $expected for a chart limit of $chartColumnLimit',
        ({ chartColumnLimit, valuesColumns, expected }) => {
            expect(
                isWithinChartColumnLimit({
                    chartColumnLimit,
                    maxColumnLimit: 200,
                    valuesColumns,
                }),
            ).toBe(expected);
        },
    );
});
