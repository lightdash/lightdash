import { ComparisonFormatTypes, type BigNumber } from '@lightdash/common';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { withVisualizationStore } from '../testing/visualizationStore';
import useBigNumberConfig from './useBigNumberConfig';

const render = (initial?: BigNumber) =>
    renderHook(
        ({ config }) => useBigNumberConfig(config, undefined, undefined),
        {
            wrapper: withVisualizationStore(),
            initialProps: { config: initial },
        },
    );

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

    it('accepts values and updaters, and re-syncs when the config changes', () => {
        const { result, rerender } = render({ label: 'Orders' });
        act(() => result.current.setBigNumberLabel('Edited'));
        act(() => result.current.setShowComparison((prev) => !prev));
        expect(result.current.bigNumberLabel).toBe('Edited');
        expect(result.current.showComparison).toBe(true);

        rerender({ config: { label: 'Saved', selectedField: 'orders_total' } });
        expect(result.current.bigNumberLabel).toBe('Saved');
        expect(result.current.selectedField).toBe('orders_total');
        expect(result.current.showComparison).toBe(false);
    });
});
