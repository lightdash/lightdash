import { TimeFrames } from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import FilterMultiDatePicker from './FilterMultiDatePicker';
import { type MultiDateTimeFrame } from './FilterMultiDatePicker.utils';

const PLACEHOLDER = 'Select dates';

const ControlledPicker = ({
    initialValues = [],
    timeFrame = TimeFrames.DAY,
}: {
    initialValues?: Date[];
    timeFrame?: MultiDateTimeFrame;
}) => {
    const [values, setValues] = useState<Date[]>(initialValues);
    return (
        <FilterMultiDatePicker
            timeFrame={timeFrame}
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
            'November 1, 2024',
            'November 7, 2024',
            'December 24, 2024',
        ]);
    });

    it('adds a typed date on Enter and keeps existing values', async () => {
        renderWithProviders(
            <ControlledPicker initialValues={[new Date(2024, 10, 1)]} />,
        );

        await userEvent.type(screen.getByRole('textbox'), '2024-11-07{Enter}');

        expect(getSelectedDates()).toEqual([
            'November 1, 2024',
            'November 7, 2024',
        ]);
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
        expect(getSelectedDates()).toEqual([
            'November 1, 2024',
            'November 7, 2024',
        ]);

        await userEvent.click(await getDayCell());
        expect(getSelectedDates()).toEqual(['November 1, 2024']);
    });

    it('closes the calendar when clicking outside', async () => {
        const onClose = vi.fn();
        renderWithProviders(
            <FilterMultiDatePicker
                timeFrame={TimeFrames.DAY}
                placeholder={PLACEHOLDER}
                firstDayOfWeek={1}
                values={[]}
                onChange={vi.fn()}
                popoverProps={{ onClose }}
            />,
        );

        await userEvent.click(screen.getByRole('textbox'));
        expect(screen.getByRole('dialog')).toBeVisible();

        await userEvent.click(document.body);

        await waitFor(() =>
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        );
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('removes a single date without dropping the others', async () => {
        renderWithProviders(
            <ControlledPicker
                initialValues={[new Date(2024, 10, 1), new Date(2024, 10, 7)]}
            />,
        );

        await userEvent.click(
            screen.getByRole('button', { name: 'Remove November 1, 2024' }),
        );

        expect(getSelectedDates()).toEqual(['November 7, 2024']);
    });

    describe('week grain', () => {
        it('snaps selected days to the start of their week', async () => {
            renderWithProviders(
                <ControlledPicker
                    timeFrame={TimeFrames.WEEK}
                    initialValues={[new Date(2024, 10, 18)]}
                />,
            );

            await userEvent.click(screen.getByRole('textbox'));
            await userEvent.click(
                await screen.findByRole('button', { name: '7 November 2024' }),
            );

            // firstDayOfWeek is Monday, so Thursday 7 Nov snaps to Monday 4 Nov
            expect(getSelectedDates()).toEqual([
                'November 4, 2024',
                'November 18, 2024',
            ]);
        });

        it('deselects a week when any of its days is clicked again', async () => {
            renderWithProviders(
                <ControlledPicker
                    timeFrame={TimeFrames.WEEK}
                    initialValues={[new Date(2024, 10, 4)]}
                />,
            );

            await userEvent.click(screen.getByRole('textbox'));
            await userEvent.click(
                await screen.findByRole('button', { name: '6 November 2024' }),
            );

            expect(getSelectedDates()).toEqual([]);
        });
    });

    describe('month grain', () => {
        it('labels values as month and year', () => {
            renderWithProviders(
                <ControlledPicker
                    timeFrame={TimeFrames.MONTH}
                    initialValues={[
                        new Date(2024, 10, 12),
                        new Date(2024, 0, 1),
                    ]}
                />,
            );

            expect(getSelectedDates()).toEqual([
                'January 2024',
                'November 2024',
            ]);
        });

        it('toggles months in the calendar popover', async () => {
            renderWithProviders(
                <ControlledPicker
                    timeFrame={TimeFrames.MONTH}
                    initialValues={[new Date(2024, 0, 1)]}
                />,
            );

            await userEvent.click(screen.getByRole('textbox'));
            await userEvent.click(
                await screen.findByRole('button', { name: 'Mar' }),
            );

            expect(getSelectedDates()).toEqual(['January 2024', 'March 2024']);
        });

        it('adds a typed month on Enter', async () => {
            renderWithProviders(
                <ControlledPicker timeFrame={TimeFrames.MONTH} />,
            );

            await userEvent.type(
                screen.getByPlaceholderText(PLACEHOLDER),
                '2024-11{Enter}',
            );

            expect(getSelectedDates()).toEqual(['November 2024']);
        });
    });

    describe('quarter grain', () => {
        it('snaps values to the start of their quarter', () => {
            renderWithProviders(
                <ControlledPicker
                    timeFrame={TimeFrames.QUARTER}
                    initialValues={[
                        new Date(2024, 10, 12),
                        new Date(2024, 1, 3),
                    ]}
                />,
            );

            expect(getSelectedDates()).toEqual(['2024-Q1', '2024-Q4']);
        });

        it('toggles a whole quarter from any of its months', async () => {
            renderWithProviders(
                <ControlledPicker
                    timeFrame={TimeFrames.QUARTER}
                    initialValues={[new Date(2024, 0, 1)]}
                />,
            );

            await userEvent.click(screen.getByRole('textbox'));
            await userEvent.click(
                await screen.findByRole('button', { name: 'Aug' }),
            );
            expect(getSelectedDates()).toEqual(['2024-Q1', '2024-Q3']);

            // a different month of the same quarter removes it again
            await userEvent.click(screen.getByRole('button', { name: 'Sep' }));
            expect(getSelectedDates()).toEqual(['2024-Q1']);
        });

        it('dedupes values that fall in the same quarter', () => {
            renderWithProviders(
                <ControlledPicker
                    timeFrame={TimeFrames.QUARTER}
                    initialValues={[
                        new Date(2024, 9, 1),
                        new Date(2024, 11, 31),
                    ]}
                />,
            );

            expect(getSelectedDates()).toEqual(['2024-Q4']);
        });
    });

    describe('year grain', () => {
        it('labels values as the year alone', () => {
            renderWithProviders(
                <ControlledPicker
                    timeFrame={TimeFrames.YEAR}
                    initialValues={[
                        new Date(2025, 5, 2),
                        new Date(2024, 10, 12),
                    ]}
                />,
            );

            expect(getSelectedDates()).toEqual(['2024', '2025']);
        });

        it('toggles years in the calendar popover', async () => {
            renderWithProviders(
                <ControlledPicker
                    timeFrame={TimeFrames.YEAR}
                    initialValues={[new Date(2024, 0, 1)]}
                />,
            );

            await userEvent.click(screen.getByRole('textbox'));
            await userEvent.click(
                await screen.findByRole('button', { name: '2026' }),
            );

            expect(getSelectedDates()).toEqual(['2024', '2026']);
        });
    });
});
