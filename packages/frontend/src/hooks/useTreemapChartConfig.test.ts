import { ChartType, type TreemapChart } from '@lightdash/common';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
    fields,
    results,
} from '../components/LightdashVisualization/visualizationDifferential.fixtures';
import {
    tableCalculationsRenamed,
    useVisualizationDispatch,
} from '../features/visualization/store';
import { withVisualizationStore } from '../testing/visualizationStore';
import useTreemapChartConfig from './useTreemapChartConfig';

vi.mock('./useProjectUuid', () => ({ useProjectUuid: () => undefined }));
vi.mock('./useAsyncCalculateTotal', () => ({
    useAsyncCalculateSubtotals: () => ({
        data: undefined,
        isFetching: false,
        error: null,
    }),
}));

const dimensionIds = [
    'orders_status',
    'orders_channel',
    'orders_created_day',
    'orders_created_at',
    'bucket',
];

const render = (config: TreemapChart) =>
    renderHook(() => useTreemapChartConfig(), {
        wrapper: withVisualizationStore(
            { type: ChartType.TREEMAP, config },
            { itemsMap: fields, resultsData: results },
        ),
    });

// Seeded with the TC `margin`; the explorer now shows it as margin3 with only the last rename
const renamedTwice = () => {
    const { margin, ...rest } = fields;
    return {
        itemsMap: {
            ...rest,
            margin3: { ...margin, name: 'margin3', sql: '1' },
        },
        tableCalculationsMetadata: [{ oldName: 'margin2', name: 'margin3' }],
    };
};

describe('useTreemapChartConfig', () => {
    it('falls back to every dimension and the first metric', () => {
        const { result } = render({
            groupFieldIds: ['missing'],
            sizeMetricId: 'missing',
        });
        expect(result.current.groupFieldIds).toEqual(dimensionIds);
        expect(result.current.sizeMetricId).toBe('orders_revenue');
        expect(result.current.validConfig.sizeMetricId).toBe('orders_revenue');
    });

    it('keeps a valid saved order and its identity across edits', () => {
        const saved = [...dimensionIds].reverse();
        const { result } = render({ groupFieldIds: saved });
        const before = result.current.groupFieldIds;
        expect(before).toEqual(saved);
        act(() => result.current.setVisibleMin(5));
        expect(result.current.groupFieldIds).toBe(before);
    });

    it('reorders the displayed group fields', () => {
        const { result } = render({ groupFieldIds: ['missing'] });
        act(() => result.current.groupReorder({ from: 0, to: 1 }));
        expect(result.current.groupFieldIds).toEqual([
            'orders_channel',
            'orders_status',
            ...dimensionIds.slice(2),
        ]);
    });

    it('drops the color metric when dynamic colors are turned off', () => {
        const { result } = render({
            useDynamicColors: true,
            colorMetricId: 'orders_profit',
        });
        act(() => result.current.toggleDynamicColors());
        expect(result.current.useDynamicColors).toBe(false);
        expect(result.current.colorMetricId).toBeNull();
    });

    it('follows a table calculation renamed twice', () => {
        const { result } = renderHook(
            () => ({
                config: useTreemapChartConfig(),
                dispatch: useVisualizationDispatch(),
            }),
            {
                wrapper: withVisualizationStore(
                    {
                        type: ChartType.TREEMAP,
                        config: {
                            sizeMetricId: 'margin',
                            useDynamicColors: true,
                            colorMetricId: 'margin',
                        },
                    },
                    { ...renamedTwice(), resultsData: results },
                ),
            },
        );
        act(() => {
            result.current.dispatch(
                tableCalculationsRenamed([
                    { oldName: 'margin', name: 'margin2' },
                ]),
            );
            result.current.dispatch(
                tableCalculationsRenamed([
                    { oldName: 'margin2', name: 'margin3' },
                ]),
            );
        });
        expect(result.current.config.validConfig).toMatchObject({
            sizeMetricId: 'margin3',
            colorMetricId: 'margin3',
        });
    });
});
