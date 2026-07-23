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

        const monday = config.props.getDayProps?.('2025-01-06');
        const sunday = config.props.getDayProps?.('2025-01-12');
        expect(monday).toMatchObject({ inRange: true, firstInRange: true });
        expect(sunday).toMatchObject({ inRange: true, lastInRange: true });
    });

    it('supports partial week selections and extends them by whole weeks', () => {
        const { result } = renderHook(() =>
            useDateRangePicker({
                value: initialValue,
                timeInterval: TimeFrames.WEEK,
            }),
        );
        act(() => result.current.handleOpen(true));

        const firstConfig = result.current.calendarConfig;
        if (!firstConfig || firstConfig.type !== TimeFrames.WEEK) {
            throw new Error('Expected week picker config');
        }
        act(() => firstConfig.props.onChange(['2025-01-15', null]));
        expect(result.current.tempDateRange).toEqual([
            new Date(2025, 0, 13),
            new Date(2025, 0, 19, 23, 59, 59, 999),
        ]);

        const secondConfig = result.current.calendarConfig;
        if (!secondConfig || secondConfig.type !== TimeFrames.WEEK) {
            throw new Error('Expected week picker config');
        }
        act(() => secondConfig.props.onChange(['2025-01-22', null]));
        expect(result.current.tempDateRange).toEqual([
            new Date(2025, 0, 13),
            new Date(2025, 0, 26, 23, 59, 59, 999),
        ]);
    });

    it('snaps a complete week range emission to whole weeks, across year boundaries', () => {
        const { result } = renderHook(() =>
            useDateRangePicker({
                value: initialValue,
                timeInterval: TimeFrames.WEEK,
            }),
        );
        act(() => result.current.handleOpen(true));

        const config = result.current.calendarConfig;
        if (!config || config.type !== TimeFrames.WEEK) {
            throw new Error('Expected week picker config');
        }
        act(() => config.props.onChange(['2024-12-30', '2025-01-05']));
        expect(result.current.tempDateRange).toEqual([
            new Date(2024, 11, 30),
            new Date(2025, 0, 5, 23, 59, 59, 999),
        ]);

        const midWeekConfig = result.current.calendarConfig;
        if (!midWeekConfig || midWeekConfig.type !== TimeFrames.WEEK) {
            throw new Error('Expected week picker config');
        }
        act(() => midWeekConfig.props.onChange(['2025-01-01', '2025-01-08']));
        expect(result.current.tempDateRange).toEqual([
            new Date(2024, 11, 30),
            new Date(2025, 0, 12, 23, 59, 59, 999),
        ]);
    });

    it('keeps the current week range when the picker emits a cleared range', () => {
        const { result } = renderHook(() =>
            useDateRangePicker({
                value: initialValue,
                timeInterval: TimeFrames.WEEK,
            }),
        );
        act(() => result.current.handleOpen(true));

        const config = result.current.calendarConfig;
        if (!config || config.type !== TimeFrames.WEEK) {
            throw new Error('Expected week picker config');
        }
        act(() => config.props.onChange([null, null]));
        expect(result.current.tempDateRange).toEqual(initialValue);
    });

    it.each([
        [
            TimeFrames.MONTH,
            ['2025-03-15', '2025-04-02'],
            [new Date(2025, 2, 1), new Date(2025, 3, 30, 23, 59, 59, 999)],
        ],
        [
            TimeFrames.YEAR,
            ['2024-06-15', '2025-02-02'],
            [new Date(2024, 0, 1), new Date(2025, 11, 31, 23, 59, 59, 999)],
        ],
    ] as const)(
        'normalizes %s picker ranges at the domain boundary',
        (timeInterval, mantineRange, expected) => {
            const { result } = renderHook(() =>
                useDateRangePicker({
                    value: initialValue,
                    timeInterval,
                }),
            );
            act(() => result.current.handleOpen(true));

            const config = result.current.calendarConfig;
            if (!config) throw new Error('Expected picker config');
            act(() =>
                config.props.onChange([mantineRange[0], mantineRange[1]]),
            );
            expect(result.current.tempDateRange).toEqual(expected);
        },
    );

    it('keeps preset changes temporary until apply and restores on cancel', () => {
        const onChange = vi.fn();
        const presetRange: [Date, Date] = [
            new Date(2025, 3, 1),
            new Date(2025, 3, 30),
        ];
        const { result } = renderHook(() =>
            useDateRangePicker({
                value: initialValue,
                onChange,
                timeInterval: TimeFrames.DAY,
            }),
        );
        const preset = {
            label: 'April',
            controlLabel: 'April',
            getValue: () => presetRange,
        };

        act(() => {
            result.current.handleOpen(true);
            result.current.handlePresetSelect(preset);
        });
        expect(result.current.tempDateRange).toEqual(presetRange);
        act(() => result.current.handleOpen(false));
        expect(onChange).not.toHaveBeenCalled();

        act(() => result.current.handleOpen(true));
        expect(result.current.tempDateRange).toEqual(initialValue);
        act(() => {
            result.current.handlePresetSelect(preset);
        });
        act(() => result.current.handleApply());
        expect(onChange).toHaveBeenCalledWith(presetRange);
    });
});
