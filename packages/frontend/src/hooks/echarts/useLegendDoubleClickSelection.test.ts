import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
    getDisabledLegendEntries,
    useLegendDoubleClickSelection,
} from './useLegendDoubleClickSelection';

describe('useLegendDoubleClickSelection', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    test('defaults to an empty selection', () => {
        const { result } = renderHook(() => useLegendDoubleClickSelection());

        expect(result.current.selectedLegends).toEqual({});
    });

    test('seeds selection from initial value', () => {
        const { result } = renderHook(() =>
            useLegendDoubleClickSelection({ '5 quarters ago': false }),
        );

        expect(result.current.selectedLegends).toEqual({
            '5 quarters ago': false,
        });
    });

    test('single click applies the echarts selection after the double-click delay and notifies onChange', () => {
        const onChange = vi.fn();
        const { result } = renderHook(() =>
            useLegendDoubleClickSelection(undefined, onChange),
        );

        act(() => {
            result.current.onLegendChange({
                name: 'a',
                selected: { a: false, b: true },
            });
        });
        act(() => {
            vi.advanceTimersByTime(400);
        });

        expect(result.current.selectedLegends).toEqual({ a: false, b: true });
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith({ a: false, b: true });
    });

    test('double click solos the clicked legend and notifies onChange once', () => {
        const onChange = vi.fn();
        const { result } = renderHook(() =>
            useLegendDoubleClickSelection(undefined, onChange),
        );

        act(() => {
            result.current.onLegendChange({
                name: 'a',
                selected: { a: false, b: true, c: true },
            });
            result.current.onLegendChange({
                name: 'a',
                selected: { a: true, b: true, c: true },
            });
        });
        act(() => {
            vi.advanceTimersByTime(400);
        });

        expect(result.current.selectedLegends).toEqual({
            a: true,
            b: false,
            c: false,
        });
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith({ a: true, b: false, c: false });
    });
});

describe('getDisabledLegendEntries', () => {
    test('keeps only disabled entries', () => {
        expect(
            getDisabledLegendEntries({ a: true, b: false, c: false }),
        ).toEqual({ b: false, c: false });
    });

    test('returns undefined when nothing is disabled', () => {
        expect(getDisabledLegendEntries({ a: true, b: true })).toBeUndefined();
        expect(getDisabledLegendEntries({})).toBeUndefined();
    });
});
