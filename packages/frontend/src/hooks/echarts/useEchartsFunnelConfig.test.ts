import { FunnelChartDataInput } from '@lightdash/common';
import { describe, expect, test } from 'vitest';
import { getFunnelSeriesSort } from './useEchartsFunnelConfig';

describe('getFunnelSeriesSort', () => {
    test('keeps the step order the query returned when steps come from rows', () => {
        expect(getFunnelSeriesSort(FunnelChartDataInput.COLUMN)).toBe('none');
    });

    test('keeps the descending taper when steps are columns, which the query sort cannot order', () => {
        expect(getFunnelSeriesSort(FunnelChartDataInput.ROW)).toBe(
            'descending',
        );
    });
});
