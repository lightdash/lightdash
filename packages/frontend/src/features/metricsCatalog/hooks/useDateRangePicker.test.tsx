import { TimeFrames } from '@lightdash/common';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDateRangePicker } from './useDateRangePicker';

const initialValue: [Date, Date] = [
    new Date(2025, 0, 6),
    new Date(2025, 0, 12, 23, 59, 59, 999),
];

describe('useDateRangePicker', () => {
    it('synchronizes controlled values without emitting a change', () => {
        const onChange = vi.fn();
        const { result, rerender } = renderHook(
            ({ value }) =>
                useDateRangePicker({
                    value,
                    onChange,
                    timeInterval: TimeFrames.WEEK,
                }),
            { initialProps: { value: initialValue } },
        );

        const nextValue: [Date, Date] = [
            new Date(2025, 1, 3),
            new Date(2025, 1, 9, 23, 59, 59, 999),
        ];
        rerender({ value: nextValue });

        expect(result.current.buttonLabel).toContain('Feb');
        expect(onChange).not.toHaveBeenCalled();
    });

    it('keeps week selection boundaries and CSS class contracts', () => {
        const { result } = renderHook(() =>
            useDateRangePicker({
                value: initialValue,
                timeInterval: TimeFrames.WEEK,
            }),
        );

        act(() => result.current.handleOpen(true));

        const config = result.current.calendarConfig;
        expect(config?.type).toBe(TimeFrames.WEEK);
        if (!config || config.type !== TimeFrames.WEEK) {
            throw new Error('Expected week picker config');
        }

        expect('classNames' in config.props).toBe(true);
        expect('styles' in config.props).toBe(false);

        const monday = config.props.getDayProps?.(new Date(2025, 0, 6));
        const sunday = config.props.getDayProps?.(new Date(2025, 0, 12));
        expect(monday).toMatchObject({ inRange: true, firstInRange: true });
        expect(sunday).toMatchObject({ inRange: true, lastInRange: true });
    });
});
