import { fireEvent, screen } from '@testing-library/react';
import { type MouseEventHandler } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import FilterQuarterPicker from './FilterQuarterPicker';

vi.mock('@mantine-8/dates', () => ({
    MonthPicker: ({
        date: displayedDate,
        getMonthControlProps,
        onChange,
        onMouseLeave,
    }: {
        date: string;
        getMonthControlProps: (date: string) => {
            className?: string;
            'data-quarter-selected'?: boolean;
            'data-quarter-hovered'?: boolean;
            onMouseEnter: MouseEventHandler;
            onMouseLeave: MouseEventHandler;
        };
        onChange: (date: string) => void;
        onMouseLeave: MouseEventHandler;
    }) => (
        <div data-testid="month-picker" onMouseLeave={onMouseLeave}>
            {Array.from({ length: 12 }, (_, month) => {
                const year = Number(displayedDate.slice(0, 4));
                const date = `${year}-${String(month + 1).padStart(2, '0')}-01`;
                return (
                    <button
                        key={month}
                        type="button"
                        data-testid={`month-${month}`}
                        {...getMonthControlProps(date)}
                        onClick={() => onChange(date)}
                    >
                        {month}
                    </button>
                );
            })}
        </div>
    ),
}));

const renderPicker = (
    value: Date | null,
    onChange: (date: Date | null) => void,
) =>
    renderWithProviders(
        <FilterQuarterPicker value={value} onChange={onChange} />,
    );

describe('FilterQuarterPicker', () => {
    it('styles selected and hovered quarters with stable data attributes', async () => {
        const onChange = vi.fn();
        renderPicker(new Date(2025, 0, 1), onChange);
        fireEvent.click(screen.getByRole('textbox'));

        expect(await screen.findByTestId('month-0')).toHaveAttribute(
            'data-quarter-selected',
        );
        expect(screen.getByTestId('month-2')).toHaveAttribute(
            'data-quarter-selected',
        );
        expect(screen.getByTestId('month-3')).not.toHaveAttribute(
            'data-quarter-selected',
        );

        fireEvent.mouseEnter(screen.getByTestId('month-4'));

        expect(screen.getByTestId('month-3')).toHaveAttribute(
            'data-quarter-hovered',
        );
        expect(screen.getByTestId('month-5')).toHaveAttribute(
            'data-quarter-hovered',
        );
        expect(screen.getByText('2025-Q2')).toBeInTheDocument();

        fireEvent.mouseLeave(screen.getByTestId('month-picker'));
        expect(screen.queryByText('2025-Q2')).not.toBeInTheDocument();
        expect(onChange).not.toHaveBeenCalled();
    });

    it('normalizes user selections, not controlled prop updates', async () => {
        const onChange = vi.fn();
        const { rerender } = renderPicker(new Date(2025, 1, 15), onChange);

        expect(onChange).not.toHaveBeenCalled();

        rerender(
            <FilterQuarterPicker
                value={new Date(2026, 8, 20)}
                onChange={onChange}
            />,
        );
        expect(onChange).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('textbox'));
        fireEvent.click(await screen.findByTestId('month-7'));
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange.mock.calls[0][0]).toEqual(new Date(2026, 6, 1));
    });
});
