import {
    DimensionType,
    FieldType,
    FilterOperator,
    FilterType,
    UnitOfTime,
    WeekDay,
    type DashboardFilterRule,
    type FilterableItem,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
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
