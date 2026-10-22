import { renderHook } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { useLegendScrollPosition } from './useLegendScrollPosition';

describe('useLegendScrollPosition', () => {
    test('returns the option unchanged until the legend has been scrolled', () => {
        const option = { legend: { type: 'scroll' } };
        const { result, rerender } = renderHook(
            ({ value }) => useLegendScrollPosition(value),
            { initialProps: { value: option } },
        );
        expect(result.current.optionWithScrollPosition).toBe(option);

        const nextOption = { legend: { type: 'scroll' } };
        rerender({ value: nextOption });
        expect(result.current.optionWithScrollPosition).toBe(nextOption);
    });

    test('builds the next option at the scrolled legend page', () => {
        const { result, rerender } = renderHook(
            ({ value }) => useLegendScrollPosition(value),
            { initialProps: { value: { legend: { type: 'scroll' } } } },
        );

        result.current.onLegendScroll({ scrollDataIndex: 12 });
        rerender({ value: { legend: { type: 'scroll' } } });

        expect(result.current.optionWithScrollPosition).toEqual({
            legend: { type: 'scroll', scrollDataIndex: 12 },
        });
    });

    test('leaves an option without a legend unchanged', () => {
        const { result, rerender } = renderHook(
            ({ value }) => useLegendScrollPosition<{ legend?: object }>(value),
            { initialProps: { value: {} } },
        );

        result.current.onLegendScroll({ scrollDataIndex: 3 });
        const nextOption = {};
        rerender({ value: nextOption });

        expect(result.current.optionWithScrollPosition).toBe(nextOption);
    });
});
