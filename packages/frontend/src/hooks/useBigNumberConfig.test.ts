import {
    ChartType,
    ComparisonFormatTypes,
    type BigNumber,
    type ItemsMap,
} from '@lightdash/common';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { withVisualizationStore } from '../testing/visualizationStore';
import useBigNumberConfig from './useBigNumberConfig';

const render = (config?: BigNumber, itemsMap?: ItemsMap) =>
    renderHook(() => useBigNumberConfig(), {
        wrapper: withVisualizationStore(
            { type: ChartType.BIG_NUMBER, config },
            { itemsMap },
        ),
    });

describe('useBigNumberConfig', () => {
    it('applies the config defaults on mount', () => {
        const { result } = render(undefined);
        expect(result.current.validConfig).toMatchObject({
            showBigNumberLabel: true,
            showTableNamesInLabel: true,
            showComparison: false,
            comparisonFormat: ComparisonFormatTypes.RAW,
            flipColors: false,
            conditionalFormattings: [],
        });
    });

    it('sets values and toggles', () => {
        const { result } = render({ label: 'Orders' });
        act(() => result.current.setBigNumberLabel('Edited'));
        act(() => result.current.toggleShowComparison());
        expect(result.current.bigNumberLabel).toBe('Edited');
        expect(result.current.showComparison).toBe(true);
        expect(result.current.validConfig.label).toBe('Edited');
    });

    it('falls back to the first available field when the selected one is gone', () => {
        const itemsMap: ItemsMap = {
            orders_total: {
                name: 'orders_total',
                displayName: 'Total',
                sql: '1',
            },
        };
        const { result } = render({ selectedField: 'missing' }, itemsMap);
        expect(result.current.selectedField).toBe('orders_total');
        expect(result.current.validConfig.selectedField).toBe('orders_total');
    });
});
