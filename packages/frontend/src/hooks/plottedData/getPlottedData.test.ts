import { describe, expect, it } from 'vitest';
import { getPivotedData } from './getPlottedData';
import {
    EXPECTED_MULTIPLE_PIVOT_RESULTS,
    EXPECTED_MULTIPLE_PIVOT_ROW_KEY_MAP,
    EXPECTED_MULTIPLE_PIVOT_VALUE_MAP,
    EXPECTED_PIVOT_ON_ITSELF_RESULTS,
    EXPECTED_PIVOT_RESULTS_WITH_ALL_DIMENSIONS,
    EXPECTED_PIVOT_RESULTS_WITH_SAME_FIELD_PIVOTED_AND_NON_PIVOTED,
    EXPECTED_PIVOT_RESULTS_WITH_SOME_DIMENSIONS,
    EXPECTED_SIMPLE_PIVOT_RESULTS,
    EXPECTED_SIMPLE_PIVOT_ROW_KEY_MAP,
    EXPECTED_SIMPLE_PIVOT_VALUE_MAP,
    RESULTS_FOR_MULTIPLE_PIVOT,
    RESULTS_FOR_PIVOT_ON_ITSELF,
    RESULTS_FOR_PIVOT_WITH_MULTIPLE_DIMENSIONS,
    RESULTS_FOR_SIMPLE_PIVOT,
} from './getPlottedData.mock';

describe('usePlottedData', () => {
    it('should pivot data with 1 dimension and 1 metric', () => {
        const data = getPivotedData(
            RESULTS_FOR_SIMPLE_PIVOT,
            ['dim2'],
            ['metric1'],
            ['dim1'],
        );
        expect(data.rows).toEqual(EXPECTED_SIMPLE_PIVOT_RESULTS);
        expect(data.rowKeyMap).toEqual(EXPECTED_SIMPLE_PIVOT_ROW_KEY_MAP);
        expect(data.pivotValuesMap).toEqual(EXPECTED_SIMPLE_PIVOT_VALUE_MAP);
    });
    it('should multiple pivot data', () => {
        const data = getPivotedData(
            RESULTS_FOR_MULTIPLE_PIVOT,
            ['dim2', 'dim3'],
            ['metric1'],
            ['dim1'],
        );
        expect(data.rows).toEqual(EXPECTED_MULTIPLE_PIVOT_RESULTS);
        expect(data.rowKeyMap).toEqual(EXPECTED_MULTIPLE_PIVOT_ROW_KEY_MAP);
        expect(data.pivotValuesMap).toEqual(EXPECTED_MULTIPLE_PIVOT_VALUE_MAP);
    });
    it('should pivot data with all dimension and 1 metric', () => {
        expect(
            getPivotedData(
                RESULTS_FOR_PIVOT_WITH_MULTIPLE_DIMENSIONS,
                ['dim3'],
                ['metric1'],
                ['dim1', 'dim2'],
            ).rows,
        ).toEqual(EXPECTED_PIVOT_RESULTS_WITH_ALL_DIMENSIONS);
    });
    it('should pivot data with some dimension and 1 metric', () => {
        expect(
            getPivotedData(
                RESULTS_FOR_PIVOT_WITH_MULTIPLE_DIMENSIONS,
                ['dim3'],
                ['metric1'],
                ['dim1'],
            ).rows,
        ).toEqual(EXPECTED_PIVOT_RESULTS_WITH_SOME_DIMENSIONS);
    });
    it('should pivot data on itself', () => {
        expect(
            getPivotedData(
                RESULTS_FOR_PIVOT_ON_ITSELF,
                ['dim1'],
                ['metric1', 'metric2'],
                ['dim1'],
            ).rows,
        ).toEqual(EXPECTED_PIVOT_ON_ITSELF_RESULTS);
    });
    it('should pivot data with same field pivoted and non pivoted', () => {
        expect(
            getPivotedData(
                RESULTS_FOR_SIMPLE_PIVOT,
                ['dim1'],
                ['metric1'],
                ['metric1'],
            ).rows,
        ).toEqual(
            EXPECTED_PIVOT_RESULTS_WITH_SAME_FIELD_PIVOTED_AND_NON_PIVOTED,
        );
    });

    it('drops a table calculation that is not in keysToPivot or keysToNotPivot from the pivoted output (#19252)', () => {
        // https://github.com/lightdash/lightdash/issues/19252
        // Repro: stacked bar chart with xField, a metric yField, a groupBy
        // dimension, AND a table calculation that is NOT used as a y-axis
        // value. Stacking computed wrong totals because the TC field leaked
        // into the pivoted row map and ECharts treated it as another stack
        // member. Removing the TC, or making it the yField, made stacking
        // work — pinning the regression at "TC not in yField must be
        // excluded from the pivoted result row".
        // Expectation: getPivotedData strips fields that are neither in
        // keysToPivot (yField) nor in keysToNotPivot (xField/dimensions),
        // so the TC never appears in result.rows or rowKeyMap. A regression
        // that re-introduces the TC into the row map would break stacking.
        const tcFieldId = 'tc_running_total';
        const rowsWithTc: typeof RESULTS_FOR_SIMPLE_PIVOT = [
            {
                dim1: { value: { raw: 1, formatted: '1' } },
                dim2: { value: { raw: true, formatted: 'yes' } },
                dim3: { value: { raw: 'value1', formatted: 'value1' } },
                metric1: { value: { raw: 10, formatted: '10' } },
                [tcFieldId]: { value: { raw: 100, formatted: '100' } },
            },
            {
                dim1: { value: { raw: 1, formatted: '1' } },
                dim2: { value: { raw: false, formatted: 'false' } },
                dim3: { value: { raw: 'value2', formatted: 'value2' } },
                metric1: { value: { raw: 20, formatted: '20' } },
                [tcFieldId]: { value: { raw: 200, formatted: '200' } },
            },
            {
                dim1: { value: { raw: 3, formatted: '1' } },
                dim2: { value: { raw: true, formatted: 'yes' } },
                dim3: { value: { raw: 'value1', formatted: 'value1' } },
                metric1: { value: { raw: 30, formatted: '30' } },
                [tcFieldId]: { value: { raw: 300, formatted: '300' } },
            },
        ];

        const result = getPivotedData(
            rowsWithTc,
            // pivot on dim2
            ['dim2'],
            // yFields: only metric1 — TC is intentionally excluded
            ['metric1'],
            // nonPivoted dimensions: only dim1 — TC is intentionally
            // excluded here too. This is the exact scenario from #19252.
            ['dim1'],
        );

        // The TC field is neither pivoted nor preserved as an index col;
        // it must be silently dropped so stacking treats only the yField
        // as a stack member.
        result.rows.forEach((row) => {
            Object.keys(row).forEach((key) => {
                expect(key).not.toContain(tcFieldId);
            });
        });

        // rowKeyMap also has no entry for the TC — neither bare nor as a
        // PivotReference.field — guarding the second pathway by which the
        // TC could leak back into stack groupings.
        Object.entries(result.rowKeyMap).forEach(([hashedKey, value]) => {
            expect(hashedKey).not.toContain(tcFieldId);
            if (typeof value !== 'string') {
                expect(value.field).not.toBe(tcFieldId);
            }
        });

        // Sanity: the metric IS pivoted (the bug only matters when the
        // pivot pipeline is active).
        const pivotedKeys = Object.keys(result.rowKeyMap).filter(
            (k) => k !== 'dim1',
        );
        expect(pivotedKeys.length).toBeGreaterThan(0);
        pivotedKeys.forEach((k) => expect(k).toContain('metric1'));
    });
});
