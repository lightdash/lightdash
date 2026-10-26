import { ChartType, type SankeyChart } from '@lightdash/common';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
    fields,
    results,
} from '../components/LightdashVisualization/visualizationDifferential.fixtures';
import { withVisualizationStore } from '../testing/visualizationStore';
import useSankeyChartConfig from './useSankeyChartConfig';

const render = (config: SankeyChart, loaded = true) =>
    renderHook(() => useSankeyChartConfig(), {
        wrapper: withVisualizationStore(
            { type: ChartType.SANKEY, config },
            { itemsMap: fields, resultsData: loaded ? results : undefined },
        ),
    });

describe('useSankeyChartConfig', () => {
    it('auto-selects source, target and metric without writing them', () => {
        const { result } = render({});
        expect(result.current.validConfig).toMatchObject({
            sourceFieldId: 'orders_status',
            targetFieldId: 'orders_channel',
            metricFieldId: 'orders_revenue',
        });
    });

    it('keeps the stored fields while the results load', () => {
        const { result } = render({}, false);
        expect(result.current.sourceFieldId).toBeNull();
        expect(result.current.targetFieldId).toBeNull();
    });

    it('picks the target against the stored source when the source is gone', () => {
        const { result } = render({ sourceFieldId: 'missing' });
        expect(result.current.sourceFieldId).toBe('orders_status');
        expect(result.current.targetFieldId).toBe('orders_status');
    });

    it('applies edits and keeps actions stable', () => {
        const { result } = render({});
        const actions = result.current.onSourceFieldChange;
        act(() => result.current.onSourceFieldChange('orders_channel'));
        act(() => result.current.onTargetFieldChange('bucket'));
        act(() => result.current.onOrientChange('vertical'));
        expect(result.current.validConfig).toMatchObject({
            sourceFieldId: 'orders_channel',
            targetFieldId: 'bucket',
            orient: 'vertical',
        });
        expect(result.current.onSourceFieldChange).toBe(actions);
    });
});
