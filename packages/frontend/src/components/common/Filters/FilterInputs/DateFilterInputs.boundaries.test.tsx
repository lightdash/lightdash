import {
    DimensionType,
    FieldType,
    FilterOperator,
    FilterType,
    UnitOfTime,
    TimeFrames,
    WeekDay,
    type DashboardFilterRule,
    type FilterableItem,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import FiltersProvider from '../FiltersProvider';
import DateFilterInputs from './DateFilterInputs';

vi.mock('./FilterDateTimePicker', () => ({
    default: ({ excludeDate }: { excludeDate?: (date: string) => boolean }) => (
        <input aria-label="Timestamp" disabled={excludeDate?.('2026-02-15')} />
    ),
}));

const field = {
    name: 'created_at',
    table: 'orders',
    type: DimensionType.TIMESTAMP,
    fieldType: FieldType.DIMENSION,
} as FilterableItem;
const rule: DashboardFilterRule = {
    id: 'date',
    label: undefined,
    target: { fieldId: 'orders_created_at', tableName: 'orders' },
    operator: FilterOperator.EQUALS,
    values: ['2026-02-15T12:00:00Z'],
    boundaries: {
        type: 'date',
        mode: 'relative',
        value: 1,
        unitOfTime: UnitOfTime.months,
        completed: true,
    },
};

afterEach(() => vi.useRealTimers());

describe('dashboard date calendar boundaries', () => {
    it('offers weeks for a monthly filter inside a rolling 12-month boundary', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-09-30T12:00:00Z'));
        const onChange = vi.fn();
        const selected: DashboardFilterRule = {
            ...rule,
            operator: FilterOperator.IN_THE_PAST,
            values: [12],
            settings: { unitOfTime: UnitOfTime.months, completed: false },
            boundaries: {
                type: 'date',
                mode: 'relative',
                value: 12,
                unitOfTime: UnitOfTime.months,
                completed: false,
            },
        };
        renderWithProviders(
            <FiltersProvider
                filterBoundaryContexts={{
                    chart: [
                        {
                            timezone: 'UTC',
                            projectTimezone: 'UTC',
                            startOfWeek: WeekDay.MONDAY,
                            useTimezoneAwareDateTrunc: false,
                            fields: {
                                orders_created_at: {
                                    fieldType: DimensionType.TIMESTAMP,
                                    fieldGranularity: UnitOfTime.months,
                                },
                            },
                        },
                    ],
                }}
            >
                <DateFilterInputs
                    rule={selected}
                    field={
                        {
                            ...field,
                            timeInterval: TimeFrames.MONTH,
                        } as FilterableItem
                    }
                    filterType={FilterType.DATE}
                    boundaries={selected.boundaries}
                    onChange={onChange}
                />
            </FiltersProvider>,
        );
        await userEvent.click(screen.getByRole('combobox'));
        await userEvent.click(screen.getByRole('option', { name: 'weeks' }));
        expect(onChange).toHaveBeenCalledWith(
            expect.objectContaining({
                values: [12],
                settings: { unitOfTime: UnitOfTime.weeks, completed: false },
            }),
        );
    });

    it.each([
        { timezones: ['UTC'], disabled: false },
        { timezones: ['UTC', 'America/New_York'], disabled: true },
    ])(
        'checks every affected chart before enabling a day ($timezones)',
        ({ timezones, disabled }) => {
            vi.useFakeTimers({ toFake: ['Date'] });
            vi.setSystemTime(new Date('2026-03-01T00:30:00Z'));
            renderWithProviders(
                <FiltersProvider
                    filterBoundaryContexts={{
                        chart: timezones.map((timezone) => ({
                            timezone,
                            projectTimezone: 'UTC',
                            startOfWeek: WeekDay.MONDAY,
                            useTimezoneAwareDateTrunc: false,
                            fields: {
                                orders_created_at: {
                                    fieldType: DimensionType.TIMESTAMP,
                                },
                            },
                        })),
                    }}
                >
                    <DateFilterInputs
                        rule={rule}
                        field={field}
                        filterType={FilterType.DATE}
                        boundaries={rule.boundaries}
                        onChange={vi.fn()}
                    />
                </FiltersProvider>,
            );
            const input = screen.getByRole('textbox', { name: 'Timestamp' });
            if (disabled) expect(input).toBeDisabled();
            else expect(input).toBeEnabled();
        },
    );
});
