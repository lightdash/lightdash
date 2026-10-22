import { act, renderHook } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import {
    applyLegendScrollIndex,
    getLegendItemsKey,
    useLegendScrollIndex,
} from './useLegendScrollIndex';

const cartesianOption = (
    seriesNames: string[],
    selected: Record<string, boolean> = {},
) => ({
    legend: { type: 'scroll', show: true, selected },
    series: seriesNames.map((name) => ({ type: 'bar', name })),
});

const pieOption = (sliceNames: string[]) => ({
    legend: { type: 'scroll', show: true },
    series: [
        {
            type: 'pie',
            data: sliceNames.map((name) => ({ name, value: 1 })),
        },
    ],
});

describe('applyLegendScrollIndex', () => {
    test('sets scrollDataIndex on the legend', () => {
        const option = cartesianOption(['a', 'b'], { a: false });

        expect(applyLegendScrollIndex(option, 12).legend).toEqual({
            type: 'scroll',
            show: true,
            selected: { a: false },
            scrollDataIndex: 12,
        });
    });

    test('sets scrollDataIndex on every legend in an array', () => {
        const option = { legend: [{ type: 'scroll' }, { type: 'plain' }] };

        expect(applyLegendScrollIndex(option, 3).legend).toEqual([
            { type: 'scroll', scrollDataIndex: 3 },
            { type: 'plain', scrollDataIndex: 3 },
        ]);
    });

    test('returns the same option on the first page', () => {
        const option = cartesianOption(['a']);

        expect(applyLegendScrollIndex(option, 0)).toBe(option);
    });

    test('returns the same option when there is no legend', () => {
        const option = { series: [] };

        expect(applyLegendScrollIndex(option, 5)).toBe(option);
    });

    test('does not mutate the input option', () => {
        const option = cartesianOption(['a']);
        applyLegendScrollIndex(option, 4);

        expect(option.legend).not.toHaveProperty('scrollDataIndex');
    });
});

describe('getLegendItemsKey', () => {
    test('ignores legend selection', () => {
        expect(getLegendItemsKey(cartesianOption(['a', 'b']))).toBe(
            getLegendItemsKey(cartesianOption(['a', 'b'], { a: false })),
        );
    });

    test('changes when the series change', () => {
        expect(getLegendItemsKey(cartesianOption(['a', 'b']))).not.toBe(
            getLegendItemsKey(cartesianOption(['a', 'c'])),
        );
    });

    test('uses slice names for pie charts', () => {
        expect(getLegendItemsKey(pieOption(['x', 'y']))).not.toBe(
            getLegendItemsKey(pieOption(['x', 'z'])),
        );
    });
});

describe('useLegendScrollIndex', () => {
    test('passes the option through before any scroll', () => {
        const option = cartesianOption(['a', 'b']);
        const { result } = renderHook(() => useLegendScrollIndex(option));

        expect(result.current.option).toBe(option);
    });

    test('returns undefined for an undefined option', () => {
        const { result } = renderHook(() => useLegendScrollIndex(undefined));

        expect(result.current.option).toBeUndefined();
    });

    test('keeps the scrolled page when the selection changes', () => {
        const { result, rerender } = renderHook(
            ({ option }) => useLegendScrollIndex(option),
            { initialProps: { option: cartesianOption(['a', 'b', 'c']) } },
        );

        act(() => result.current.onLegendScroll({ scrollDataIndex: 2 }));
        rerender({ option: cartesianOption(['a', 'b', 'c'], { c: false }) });

        expect(result.current.option?.legend).toMatchObject({
            scrollDataIndex: 2,
            selected: { c: false },
        });
    });

    test('keeps the scrolled page for pie slices', () => {
        const { result, rerender } = renderHook(
            ({ option }) => useLegendScrollIndex(option),
            { initialProps: { option: pieOption(['x', 'y', 'z']) } },
        );

        act(() => result.current.onLegendScroll({ scrollDataIndex: 1 }));
        rerender({ option: pieOption(['x', 'y', 'z']) });

        expect(result.current.option?.legend).toMatchObject({
            scrollDataIndex: 1,
        });
    });

    test('resets to the first page when the series change', () => {
        const { result, rerender } = renderHook(
            ({ option }) => useLegendScrollIndex(option),
            { initialProps: { option: cartesianOption(['a', 'b', 'c']) } },
        );

        act(() => result.current.onLegendScroll({ scrollDataIndex: 2 }));
        const newResults = cartesianOption(['d', 'e', 'f']);
        rerender({ option: newResults });

        expect(result.current.option).toBe(newResults);

        // Returning to the old series doesn't restore the old page either
        rerender({ option: cartesianOption(['a', 'b', 'c']) });

        expect(result.current.option?.legend).not.toHaveProperty(
            'scrollDataIndex',
        );
    });

    test('ignores scroll events without an index', () => {
        const { result, rerender } = renderHook(
            ({ option }) => useLegendScrollIndex(option),
            { initialProps: { option: cartesianOption(['a', 'b']) } },
        );

        act(() => result.current.onLegendScroll({ scrollDataIndex: 1 }));
        act(() => result.current.onLegendScroll({}));
        rerender({ option: cartesianOption(['a', 'b'], { a: false }) });

        expect(result.current.option?.legend).toMatchObject({
            scrollDataIndex: 1,
        });
    });

    test('keeps onLegendScroll stable across renders', () => {
        const { result, rerender } = renderHook(
            ({ option }) => useLegendScrollIndex(option),
            { initialProps: { option: cartesianOption(['a']) } },
        );
        const first = result.current.onLegendScroll;
        rerender({ option: cartesianOption(['b']) });

        expect(result.current.onLegendScroll).toBe(first);
    });
});
