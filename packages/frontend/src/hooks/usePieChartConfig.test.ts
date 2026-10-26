import { ChartType, type ItemsMap, type PieChart } from '@lightdash/common';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
    fields,
    results,
} from '../components/LightdashVisualization/visualizationDifferential.fixtures';
import {
    tableCalculationsRenamed,
    useVisualizationDispatch,
} from '../features/visualization/store';
import { withVisualizationStore } from '../testing/visualizationStore';
import usePieChartConfig from './usePieChartConfig';

const render = (config: PieChart, itemsMap: ItemsMap = fields) =>
    renderHook(
        () => ({
            config: usePieChartConfig(),
            dispatch: useVisualizationDispatch(),
        }),
        {
            wrapper: withVisualizationStore(
                { type: ChartType.PIE, config },
                { itemsMap, resultsData: results },
            ),
        },
    );

// The explorer's view after a run: the TC is renamed and the rename metadata cleared
const withMarginRenamedTo = (name: string): ItemsMap => {
    const { margin, ...rest } = fields;
    return { ...rest, [name]: { ...margin, name, sql: '1' } };
};

describe('usePieChartConfig', () => {
    it.each([
        ['no saved group', {}],
        ['a saved group that is gone', { groupFieldIds: ['missing_dim'] }],
    ])('adds a group to the shown fallback with %s', (_, config) => {
        const { result } = render(config);
        expect(result.current.config.groupFieldIds).toEqual(['orders_status']);

        act(() => result.current.config.groupAdd());
        expect(result.current.config.validConfig.groupFieldIds).toEqual([
            'orders_status',
            'orders_channel',
        ]);
    });

    it('changes and removes groups on the shown list', () => {
        const { result } = render({ groupFieldIds: ['missing_dim'] });

        act(() =>
            result.current.config.groupChange(
                'orders_status',
                'orders_channel',
            ),
        );
        expect(result.current.config.groupFieldIds).toEqual(['orders_channel']);

        act(() => result.current.config.groupAdd('orders_status'));
        act(() => result.current.config.groupRemove('orders_channel'));
        expect(result.current.config.groupFieldIds).toEqual(['orders_status']);
    });

    it('keeps a renamed table calculation metric after the run clears the rename', () => {
        const { result } = render(
            { metricId: 'margin' },
            withMarginRenamedTo('margin2'),
        );
        act(() => {
            result.current.dispatch(
                tableCalculationsRenamed([
                    { oldName: 'margin', name: 'margin2' },
                ]),
            );
        });
        expect(result.current.config.validConfig.metricId).toBe('margin2');
    });

    it('follows a table calculation metric renamed twice', () => {
        const { result } = render(
            { metricId: 'margin' },
            withMarginRenamedTo('margin3'),
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
        expect(result.current.config.validConfig.metricId).toBe('margin3');
    });
});
