import { DatePicker } from '@mantine-8/dates';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import FiltersContext from '../context';
import FilterDateTimeRangePicker from './FilterDateTimeRangePicker';

const mocks = vi.hoisted(() => ({
    project: {
        queryTimezone: 'America/New_York',
        useProjectTimezoneInFilters: false,
    },
    timezoneSupportEnabled: false,
}));

vi.mock('../../../../hooks/useProject', () => ({
    useProject: () => ({
        data: mocks.project,
    }),
}));

vi.mock('../../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({
        data: { enabled: mocks.timezoneSupportEnabled },
    }),
}));

const renderDateTimeRange = (element: ReactNode) =>
    renderWithProviders(
        <FiltersContext.Provider
            value={{
                itemsMap: {},
                getField: () => undefined,
                getAutocompleteFilterGroup: () => undefined,
            }}
        >
            {element}
        </FiltersContext.Provider>,
    );

describe('Mantine Dates v8 runtime', () => {
    it('renders with the application v8 provider and emits date strings', () => {
        const onChange = vi.fn();
        const { container, getAllByRole } = renderWithProviders(
            <DatePicker
                date="2025-05-01"
                value="2025-05-14"
                onChange={onChange}
            />,
        );

        expect(container.querySelector('[data-selected]')).toHaveTextContent(
            '14',
        );
        const day15 = getAllByRole('button').find(
            (button) => button.textContent === '15',
        );
        expect(day15).toBeDefined();
        if (!day15) throw new Error('Expected May 15 day control');

        fireEvent.click(day15);
        expect(onChange).toHaveBeenCalledWith('2025-05-15');
    });

    it.each([false, true])(
        'does not clamp a same-day datetime range when project timezone is %s',
        async (useProjectTimezone) => {
            mocks.project.useProjectTimezoneInFilters = useProjectTimezone;
            mocks.timezoneSupportEnabled = useProjectTimezone;
            const startValue = useProjectTimezone
                ? new Date('2025-05-14T14:00:00.000Z')
                : new Date(2025, 4, 14, 10);
            const endValue = useProjectTimezone
                ? new Date('2025-05-14T15:00:00.000Z')
                : new Date(2025, 4, 14, 11);
            const onChange = vi.fn();
            renderDateTimeRange(
                <FilterDateTimeRangePicker
                    startValue={startValue}
                    endValue={endValue}
                    firstDayOfWeek={1}
                    onChange={onChange}
                />,
            );

            const startInput = screen.getByRole('button', {
                name: '2025-05-14 10:00:00',
            });
            fireEvent.click(startInput);
            let submitButton: HTMLButtonElement | null = null;
            await waitFor(() => {
                submitButton = document.querySelector<HTMLButtonElement>(
                    '.mantine-8-DateTimePicker-submitButton',
                );
                expect(submitButton).not.toBeNull();
            });
            if (!submitButton)
                throw new Error('Expected datetime submit button');
            fireEvent.click(submitButton);

            await waitFor(() => expect(onChange).not.toHaveBeenCalled());
            expect(startInput).toHaveTextContent('2025-05-14 10:00:00');
        },
    );
});
