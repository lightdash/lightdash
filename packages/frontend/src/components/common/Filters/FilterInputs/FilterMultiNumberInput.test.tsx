import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import FilterMultiNumberInput from './FilterMultiNumberInput';

const createNumericValues = (count: number) =>
    Array.from({ length: count }, (_, i) => String(i));

describe('FilterMultiNumberInput', () => {
    describe('basic rendering', () => {
        it('renders all values as tags when below inline limit', () => {
            const values = createNumericValues(10);

            renderWithProviders(
                <FilterMultiNumberInput values={values} onChange={vi.fn()} />,
            );

            values.forEach((value) => {
                expect(screen.getByText(value)).toBeInTheDocument();
            });
        });

        it('renders placeholder when no values', () => {
            renderWithProviders(
                <FilterMultiNumberInput
                    values={[]}
                    onChange={vi.fn()}
                    placeholder="Enter numbers..."
                />,
            );

            expect(
                screen.getByPlaceholderText('Enter numbers...'),
            ).toBeInTheDocument();
        });
    });

    describe('number validation', () => {
        it('accepts valid integers via keyboard', async () => {
            const user = userEvent.setup();
            const onChange = vi.fn();

            renderWithProviders(
                <FilterMultiNumberInput values={[]} onChange={onChange} />,
            );

            const input = screen.getByRole('textbox');
            await user.type(input, '42{Enter}');

            await waitFor(() => {
                expect(onChange).toHaveBeenCalledWith(['42']);
            });
        });

        it('accepts negative numbers via keyboard', async () => {
            const user = userEvent.setup();
            const onChange = vi.fn();

            renderWithProviders(
                <FilterMultiNumberInput values={[]} onChange={onChange} />,
            );

            const input = screen.getByRole('textbox');
            await user.type(input, '-17.5{Enter}');

            await waitFor(() => {
                expect(onChange).toHaveBeenCalledWith(['-17.5']);
            });
        });

        it('rejects non-numeric strings via keyboard', async () => {
            const user = userEvent.setup();
            const onChange = vi.fn();

            renderWithProviders(
                <FilterMultiNumberInput values={[]} onChange={onChange} />,
            );

            const input = screen.getByRole('textbox');
            await user.type(input, 'abc{Enter}');

            // onChange should NOT be called with invalid values
            expect(onChange).not.toHaveBeenCalled();
        });
    });

    describe('truncation behavior', () => {
        it('shows "+N more" pill when values exceed inline limit', () => {
            const values = createNumericValues(100);

            renderWithProviders(
                <FilterMultiNumberInput values={values} onChange={vi.fn()} />,
            );

            expect(screen.getByText('+50 more')).toBeInTheDocument();
        });

        it('does not show "+N more" pill when below inline limit', () => {
            const values = createNumericValues(30);

            renderWithProviders(
                <FilterMultiNumberInput values={values} onChange={vi.fn()} />,
            );

            expect(screen.queryByText(/more$/)).not.toBeInTheDocument();
        });
    });

    describe('summary mode', () => {
        it('shows summary text input when values exceed summary threshold', () => {
            const values = createNumericValues(600);

            renderWithProviders(
                <FilterMultiNumberInput values={values} onChange={vi.fn()} />,
            );

            expect(
                screen.getByDisplayValue('600 values selected'),
            ).toBeInTheDocument();

            // Should not render individual value pills
            expect(screen.queryByText('0')).not.toBeInTheDocument();
        });

        it('opens modal when clicking the summary input', async () => {
            const user = userEvent.setup({ pointerEventsCheck: 0 });
            const values = createNumericValues(600);

            renderWithProviders(
                <FilterMultiNumberInput values={values} onChange={vi.fn()} />,
            );

            const summaryInput = screen.getByDisplayValue(
                '600 values selected',
            );
            await user.click(summaryInput);

            await waitFor(() => {
                expect(
                    screen.getByText('Manage filter values'),
                ).toBeInTheDocument();
            });
        });
    });

    describe('manage values modal', () => {
        it('opens modal when clicking "+N more" pill', async () => {
            const values = createNumericValues(100);

            renderWithProviders(
                <FilterMultiNumberInput values={values} onChange={vi.fn()} />,
            );

            const morePill = screen.getByText('+50 more');
            fireEvent.mouseDown(morePill);

            await waitFor(() => {
                expect(
                    screen.getByText('Manage filter values'),
                ).toBeInTheDocument();
            });
        });
    });

    describe('disabled state', () => {
        it('does not open modal when clicking summary input while disabled', async () => {
            const user = userEvent.setup({ pointerEventsCheck: 0 });
            const values = createNumericValues(600);

            renderWithProviders(
                <FilterMultiNumberInput
                    values={values}
                    onChange={vi.fn()}
                    disabled
                />,
            );

            const summaryInput = screen.getByDisplayValue(
                '600 values selected',
            );
            await user.click(summaryInput);

            // Modal should NOT open
            expect(
                screen.queryByText('Manage filter values'),
            ).not.toBeInTheDocument();
        });
    });
});
