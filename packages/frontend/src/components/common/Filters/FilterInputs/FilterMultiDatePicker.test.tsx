import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import FilterMultiDatePicker from './FilterMultiDatePicker';

const PLACEHOLDER = 'Select dates';

const ControlledPicker = ({
    initialValues = [],
}: {
    initialValues?: Date[];
}) => {
    const [values, setValues] = useState<Date[]>(initialValues);
    return (
        <FilterMultiDatePicker
            placeholder={PLACEHOLDER}
            firstDayOfWeek={1}
            values={values}
            onChange={setValues}
        />
    );
};

const getSelectedDates = () =>
    screen
        .queryAllByRole('button', { name: /^Remove/ })
        .map((button) =>
            button.getAttribute('aria-label')?.replace('Remove ', ''),
        );

describe('FilterMultiDatePicker', () => {
    it('renders a pill per selected date, sorted ascending', () => {
        renderWithProviders(
            <ControlledPicker
                initialValues={[
                    new Date(2024, 11, 24),
                    new Date(2024, 10, 1),
                    new Date(2024, 10, 7),
                ]}
            />,
        );

        expect(getSelectedDates()).toEqual([
            '2024-12-24',
            '2024-11-01',
            '2024-11-07',
        ]);
    });

    it('adds a typed date on Enter and keeps existing values', async () => {
        renderWithProviders(
            <ControlledPicker initialValues={[new Date(2024, 10, 1)]} />,
        );

        await userEvent.type(screen.getByRole('textbox'), '2024-11-07{Enter}');

        expect(getSelectedDates()).toEqual(['2024-11-01', '2024-11-07']);
    });

    it('ignores an unparseable typed value', async () => {
        renderWithProviders(<ControlledPicker />);

        await userEvent.type(
            screen.getByPlaceholderText(PLACEHOLDER),
            'not a date{Enter}',
        );

        expect(getSelectedDates()).toEqual([]);
    });

    it('toggles dates in the calendar popover', async () => {
        renderWithProviders(
            <ControlledPicker initialValues={[new Date(2024, 10, 1)]} />,
        );

        await userEvent.click(screen.getByRole('textbox'));

        // the calendar opens on the month of the selected date, not today
        const getDayCell = () =>
            screen.findByRole('button', { name: '7 November 2024' });

        await userEvent.click(await getDayCell());
        expect(getSelectedDates()).toEqual(['2024-11-01', '2024-11-07']);

        await userEvent.click(await getDayCell());
        expect(getSelectedDates()).toEqual(['2024-11-01']);
    });

    it('removes a single date without dropping the others', async () => {
        renderWithProviders(
            <ControlledPicker
                initialValues={[new Date(2024, 10, 1), new Date(2024, 10, 7)]}
            />,
        );

        await userEvent.click(
            screen.getByRole('button', { name: 'Remove 2024-11-01' }),
        );

        expect(getSelectedDates()).toEqual(['2024-11-07']);
    });
});
