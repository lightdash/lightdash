import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import CalendarRangePicker from './CalendarRangePicker';
import CalendarRangePickerInput from './CalendarRangePickerInput';

const clickDay = async (day: string) => {
    let control: HTMLElement | undefined;
    await waitFor(() => {
        control = screen
            .getAllByRole('button')
            .find((button) => button.textContent === day);
        expect(control).toBeDefined();
    });
    if (!control) throw new Error(`Expected day control ${day}`);
    fireEvent.click(control);
};

describe('CalendarRangePicker', () => {
    it('round-trips Date values through the real v8 DatePicker', async () => {
        const onChange = vi.fn();
        const { container } = renderWithProviders(
            <CalendarRangePicker
                value={[new Date(2025, 4, 12), new Date(2025, 4, 14)]}
                defaultDate={new Date(2025, 4, 1)}
                onChange={onChange}
            />,
        );

        expect(
            container.querySelector('[data-first-in-range]'),
        ).toHaveTextContent('12');
        expect(
            container.querySelector('[data-last-in-range]'),
        ).toHaveTextContent('14');

        await clickDay('20');
        expect(onChange).toHaveBeenCalledWith([new Date(2025, 4, 20), null]);
    });

    it('never fires onChange for controlled prop updates', () => {
        const onChange = vi.fn();
        const { rerender } = renderWithProviders(
            <CalendarRangePicker
                value={[new Date(2025, 4, 12), new Date(2025, 4, 14)]}
                onChange={onChange}
            />,
        );
        rerender(
            <CalendarRangePicker
                value={[new Date(2025, 5, 2), new Date(2025, 5, 8)]}
                onChange={onChange}
            />,
        );
        expect(onChange).not.toHaveBeenCalled();
    });

    it('formats Date bounds for the underlying picker', async () => {
        const onChange = vi.fn();
        renderWithProviders(
            <CalendarRangePicker
                value={[null, null]}
                defaultDate={new Date(2025, 4, 1)}
                maxDate={new Date(2025, 4, 14)}
                onChange={onChange}
            />,
        );

        await clickDay('20');
        expect(onChange).not.toHaveBeenCalled();

        await clickDay('14');
        expect(onChange).toHaveBeenCalledWith([new Date(2025, 4, 14), null]);
    });
});

describe('CalendarRangePickerInput', () => {
    it('renders Date values and emits Dates from the real v8 DatePickerInput', async () => {
        const onChange = vi.fn();
        renderWithProviders(
            <CalendarRangePickerInput
                label="Custom Date Range"
                value={[new Date(2025, 4, 12), new Date(2025, 4, 14)]}
                onChange={onChange}
            />,
        );

        const input = screen
            .getAllByRole('button')
            .find((button) => button.textContent?.includes('May 12, 2025'));
        expect(input).toBeDefined();
        if (!input) throw new Error('Expected range picker input');
        expect(input.textContent).toContain('May 14, 2025');
        fireEvent.click(input);
        await clickDay('20');
        expect(onChange).toHaveBeenCalledWith([new Date(2025, 4, 20), null]);
    });

    it('never fires onChange for controlled prop updates', () => {
        const onChange = vi.fn();
        const { rerender } = renderWithProviders(
            <CalendarRangePickerInput
                value={[new Date(2025, 4, 12), null]}
                onChange={onChange}
            />,
        );
        rerender(
            <CalendarRangePickerInput
                value={[new Date(2025, 5, 2), new Date(2025, 5, 8)]}
                onChange={onChange}
            />,
        );
        expect(onChange).not.toHaveBeenCalled();
    });
});
