import { screen } from '@testing-library/react';
import { type ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import FilterDateRangePicker from './FilterDateRangePicker';
import FilterDateTimeRangePicker from './FilterDateTimeRangePicker';

vi.mock('./FilterDatePicker', () => ({
    default: ({
        placeholder,
        value,
    }: {
        placeholder: string;
        value: Date | null;
    }) => (
        <output data-testid={placeholder}>
            {value?.toISOString() ?? 'null'}
        </output>
    ),
}));

vi.mock('./FilterDateTimePicker', () => ({
    default: ({
        placeholder,
        value,
    }: {
        placeholder: string;
        value: Date | null;
    }) => (
        <output data-testid={placeholder}>
            {value?.toISOString() ?? 'null'}
        </output>
    ),
}));

const initialStart = new Date(2025, 0, 1, 9, 30);
const initialEnd = new Date(2025, 0, 2, 17, 45);
const nextStart = new Date(2026, 5, 10, 8, 15);
const nextEnd = new Date(2026, 5, 11, 18, 0);

const commonProps = {
    startValue: initialStart,
    endValue: initialEnd,
    firstDayOfWeek: 1,
    onChange: vi.fn(),
} satisfies ComponentProps<typeof FilterDateRangePicker>;

describe.each([
    ['date range', FilterDateRangePicker],
    ['date-time range', FilterDateTimeRangePicker],
] as const)('%s controlled state', (_, Component) => {
    it('synchronizes external values without emitting a change', () => {
        const onChange = vi.fn();
        const { rerender } = renderWithProviders(
            <Component {...commonProps} onChange={onChange} />,
        );

        rerender(
            <Component
                {...commonProps}
                startValue={nextStart}
                endValue={nextEnd}
                onChange={onChange}
            />,
        );

        expect(screen.getByTestId('Start date')).toHaveTextContent(
            nextStart.toISOString(),
        );
        expect(screen.getByTestId('End date')).toHaveTextContent(
            nextEnd.toISOString(),
        );
        expect(onChange).not.toHaveBeenCalled();
    });

    it('synchronizes cleared external values', () => {
        const onChange = vi.fn();
        const { rerender } = renderWithProviders(
            <Component {...commonProps} onChange={onChange} />,
        );

        rerender(
            <Component
                {...commonProps}
                startValue={null}
                endValue={null}
                onChange={onChange}
            />,
        );

        expect(screen.getByTestId('Start date')).toHaveTextContent('null');
        expect(screen.getByTestId('End date')).toHaveTextContent('null');
        expect(onChange).not.toHaveBeenCalled();
    });
});
