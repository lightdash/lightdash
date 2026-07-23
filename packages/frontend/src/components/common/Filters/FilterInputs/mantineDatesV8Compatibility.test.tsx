import { fireEvent, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import FiltersContext from '../context';
import FilterDatePicker from './FilterDatePicker';
import FilterDateTimePicker from './FilterDateTimePicker';
import FilterMonthAndYearPicker from './FilterMonthAndYearPicker';
import FilterWeekPicker from './FilterWeekPicker';
import FilterYearPicker from './FilterYearPicker';

const mocks = vi.hoisted(() => ({
    closeInvalidInput: vi.fn(),
    project: {
        queryTimezone: undefined as string | undefined,
        useProjectTimezoneInFilters: false,
    },
    timezoneSupportEnabled: false,
}));

vi.mock('../../../../hooks/useProject', () => ({
    useProject: () => ({ data: mocks.project }),
}));

vi.mock('../../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({
        data: { enabled: mocks.timezoneSupportEnabled },
    }),
}));

vi.mock('./InvalidDateInput', () => ({
    default: ({
        children,
    }: {
        children: (props: { close: () => void }) => ReactNode;
    }) => <div>{children({ close: mocks.closeInvalidInput })}</div>,
}));

vi.mock('@mantine-8/dates', () => {
    const picker = (
        testId: string,
        value: unknown,
        onChange: (value: string) => void,
        nextValue: string,
        extra?: Record<string, unknown>,
    ) => (
        <button
            type="button"
            data-testid={testId}
            data-value={String(value ?? '')}
            data-min={String(extra?.minDate ?? '')}
            data-max={String(extra?.maxDate ?? '')}
            data-time-picker={String(Boolean(extra?.timePickerProps))}
            onClick={() => onChange(nextValue)}
        />
    );

    return {
        DateInput: ({
            value,
            onChange,
            minDate,
            maxDate,
            getDayProps,
        }: {
            value: unknown;
            onChange: (value: string) => void;
            minDate?: string;
            maxDate?: string;
            getDayProps?: (value: string) => {
                inRange?: boolean;
                firstInRange?: boolean;
                lastInRange?: boolean;
            };
        }) => {
            const dayProps = getDayProps?.('2025-05-14');
            return (
                <>
                    {picker('date-input', value, onChange, '2025-05-14', {
                        minDate,
                        maxDate,
                    })}
                    {getDayProps && (
                        <output
                            data-testid="day-props"
                            data-in-range={String(Boolean(dayProps?.inRange))}
                            data-first={String(Boolean(dayProps?.firstInRange))}
                            data-last={String(Boolean(dayProps?.lastInRange))}
                        />
                    )}
                </>
            );
        },
        DatePicker: ({
            value,
            onChange,
            getDayProps,
            minDate,
            maxDate,
        }: {
            value: unknown;
            onChange: (value: string) => void;
            getDayProps?: (value: string) => {
                inRange?: boolean;
                firstInRange?: boolean;
                lastInRange?: boolean;
            };
            minDate?: string;
            maxDate?: string;
        }) => {
            const dayProps = getDayProps?.('2025-05-14');
            return (
                <>
                    {picker('date-picker', value, onChange, '2025-05-14', {
                        minDate,
                        maxDate,
                    })}
                    <output
                        data-testid="day-props"
                        data-in-range={String(Boolean(dayProps?.inRange))}
                        data-first={String(Boolean(dayProps?.firstInRange))}
                        data-last={String(Boolean(dayProps?.lastInRange))}
                    />
                </>
            );
        },
        DateTimePicker: ({
            value,
            onChange,
            minDate,
            maxDate,
            timePickerProps,
            submitButtonProps,
        }: {
            value: unknown;
            onChange: (value: string) => void;
            minDate?: string;
            maxDate?: string;
            timePickerProps?: unknown;
            submitButtonProps?: {
                onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
            };
        }) => (
            <>
                {picker(
                    'date-time-picker',
                    value,
                    onChange,
                    '2025-05-14 10:11:12',
                    { minDate, maxDate, timePickerProps },
                )}
                <button
                    type="button"
                    data-testid="submit-date-time"
                    onClick={(event) => submitButtonProps?.onClick?.(event)}
                />
            </>
        ),
        MonthPicker: ({
            value,
            onChange,
        }: {
            value: unknown;
            onChange: (value: string) => void;
        }) => picker('month-picker', value, onChange, '2025-05-01'),
        MonthPickerInput: ({
            value,
            onChange,
        }: {
            value: unknown;
            onChange: (value: string) => void;
        }) => picker('month-picker-input', value, onChange, '2025-05-01'),
        YearPicker: ({
            value,
            onChange,
        }: {
            value: unknown;
            onChange: (value: string) => void;
        }) => picker('year-picker', value, onChange, '2025-01-01'),
        YearPickerInput: ({
            value,
            onChange,
        }: {
            value: unknown;
            onChange: (value: string) => void;
        }) => picker('year-picker-input', value, onChange, '2025-01-01'),
    };
});

const renderDateTimePicker = (
    element: ReactNode,
    metricQueryTimezone?: string,
) =>
    renderWithProviders(
        <FiltersContext.Provider
            value={{
                itemsMap: {},
                metricQueryTimezone,
                getField: () => undefined,
                getAutocompleteFilterGroup: () => undefined,
            }}
        >
            {element}
        </FiltersContext.Provider>,
    );

describe('Mantine Dates v8 wrapper boundaries', () => {
    it('formats and parses date values and bounds as local calendar dates', () => {
        const onChange = vi.fn();
        renderWithProviders(
            <FilterDatePicker
                value={new Date(2024, 1, 29)}
                minDate={new Date(2024, 0, 1)}
                maxDate={new Date(2024, 11, 31)}
                firstDayOfWeek={1}
                onChange={onChange}
            />,
        );

        const picker = screen.getByTestId('date-input');
        expect(picker).toHaveAttribute('data-value', '2024-02-29');
        expect(picker).toHaveAttribute('data-min', '2024-01-01');
        expect(picker).toHaveAttribute('data-max', '2024-12-31');

        fireEvent.click(picker);
        expect(onChange).toHaveBeenCalledWith(new Date(2025, 4, 14));
    });

    it('normalizes week, month, and year string callbacks to Dates', () => {
        const onWeekChange = vi.fn();
        const { unmount } = renderWithProviders(
            <FilterWeekPicker
                value={new Date(2025, 4, 12)}
                firstDayOfWeek={1}
                onChange={onWeekChange}
            />,
        );
        fireEvent.click(screen.getByTestId('date-input'));
        expect(onWeekChange).toHaveBeenCalledWith(new Date(2025, 4, 12));
        expect(screen.getByTestId('day-props')).toHaveAttribute(
            'data-in-range',
            'true',
        );
        unmount();

        const onMonthChange = vi.fn();
        const month = renderWithProviders(
            <FilterMonthAndYearPicker
                value={new Date(2024, 1, 1)}
                onChange={onMonthChange}
            />,
        );
        fireEvent.click(screen.getByTestId('month-picker-input'));
        expect(onMonthChange).toHaveBeenCalledWith(new Date(2025, 4, 1));
        month.unmount();

        const onYearChange = vi.fn();
        renderWithProviders(
            <FilterYearPicker
                value={new Date(2024, 0, 1)}
                onChange={onYearChange}
            />,
        );
        fireEvent.click(screen.getByTestId('year-picker-input'));
        expect(onYearChange).toHaveBeenCalledWith(new Date(2025, 0, 1));
    });

    it('preserves the project-timezone shift/string/unshift pipeline', () => {
        mocks.timezoneSupportEnabled = true;
        mocks.project.useProjectTimezoneInFilters = true;
        const onChange = vi.fn();

        renderDateTimePicker(
            <FilterDateTimePicker
                value={new Date('2024-07-01T12:00:00.987Z')}
                minDate={new Date('2024-07-01T11:00:00.000Z')}
                maxDate={new Date('2024-07-01T13:00:00.000Z')}
                firstDayOfWeek={1}
                withSeconds
                timePickerProps={{ withDropdown: true }}
                onChange={onChange}
            />,
            'America/New_York',
        );

        const picker = screen.getByTestId('date-time-picker');
        expect(picker).toHaveAttribute('data-value', '2024-07-01 08:00:00');
        expect(picker).toHaveAttribute('data-min', '2024-07-01 07:00:00');
        expect(picker).toHaveAttribute('data-max', '2024-07-01 09:00:00');
        expect(picker).toHaveAttribute('data-time-picker', 'true');

        fireEvent.click(picker);
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange.mock.calls[0][0].toISOString()).toBe(
            '2025-05-14T14:11:12.987Z',
        );
    });

    it('preserves datetime bounds and fractional milliseconds', () => {
        mocks.timezoneSupportEnabled = false;
        mocks.project.useProjectTimezoneInFilters = false;
        const onChange = vi.fn();

        renderDateTimePicker(
            <FilterDateTimePicker
                value={new Date(2025, 4, 14, 10, 0, 0, 987)}
                minDate={new Date(2025, 4, 14, 9, 0, 0)}
                maxDate={new Date(2025, 4, 14, 10, 59, 59)}
                firstDayOfWeek={1}
                withSeconds
                onChange={onChange}
            />,
        );

        const picker = screen.getByTestId('date-time-picker');
        expect(picker).toHaveAttribute('data-min', '2025-05-14 09:00:00');
        expect(picker).toHaveAttribute('data-max', '2025-05-14 10:59:59');

        fireEvent.click(picker);
        expect(onChange).toHaveBeenCalledWith(
            new Date(2025, 4, 14, 10, 11, 12, 987),
        );
    });

    it('closes invalid replacement only after a valid parsed submission', () => {
        mocks.timezoneSupportEnabled = false;
        mocks.project.useProjectTimezoneInFilters = false;
        mocks.closeInvalidInput.mockClear();
        const onChange = vi.fn();

        renderDateTimePicker(
            <FilterDateTimePicker
                value={null}
                invalidValue="not-a-date"
                firstDayOfWeek={1}
                onChange={onChange}
            />,
        );

        fireEvent.click(screen.getByTestId('submit-date-time'));
        expect(onChange).not.toHaveBeenCalled();
        expect(mocks.closeInvalidInput).not.toHaveBeenCalled();

        fireEvent.click(screen.getByTestId('date-time-picker'));
        fireEvent.click(screen.getByTestId('submit-date-time'));
        expect(onChange).toHaveBeenCalledWith(
            new Date(2025, 4, 14, 10, 11, 12),
        );
        expect(mocks.closeInvalidInput).toHaveBeenCalledTimes(1);
    });
});
