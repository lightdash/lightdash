import {
    DimensionType,
    FieldType,
    FilterOperator,
    FilterType,
    TimeFrames,
    WarehouseTypes,
    WeekDay,
    type DateFilterRule,
    type FilterableDimension,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import dayjs from 'dayjs';
import 'dayjs/locale/en-gb';
import { renderWithProviders } from '../../../testing/testUtils';
import DateFilterInputs from './FilterInputs/DateFilterInputs';
import FiltersProvider from './FiltersProvider';

const field: FilterableDimension = {
    fieldType: FieldType.DIMENSION,
    type: DimensionType.DATE,
    name: 'order_date_week',
    label: 'Order date week',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '${TABLE}.order_date',
    hidden: false,
    timeInterval: TimeFrames.WEEK,
};

const rule: DateFilterRule = {
    id: 'week',
    target: { fieldId: 'orders_order_date_week' },
    operator: FilterOperator.EQUALS,
    values: [],
};

describe('warehouse week boundaries in filter inputs', () => {
    const initialLocale = dayjs.locale();
    afterEach(() => dayjs.locale(initialLocale));

    it.each([
        {
            warehouseType: WarehouseTypes.DUCKDB,
            locale: 'en',
            expected: '2026-10-26',
        },
        {
            warehouseType: WarehouseTypes.POSTGRES,
            locale: 'en',
            expected: '2026-10-26',
        },
        {
            warehouseType: WarehouseTypes.BIGQUERY,
            locale: 'en-gb',
            expected: '2026-10-25',
        },
        {
            warehouseType: WarehouseTypes.CLICKHOUSE,
            locale: 'en-gb',
            expected: '2026-10-25',
        },
    ])(
        'uses $warehouseType week start despite $locale locale',
        async ({ warehouseType, locale, expected }) => {
            dayjs.locale(locale);
            const onChange = vi.fn();
            renderWithProviders(
                <FiltersProvider warehouseType={warehouseType}>
                    <DateFilterInputs
                        field={field}
                        rule={rule}
                        filterType={FilterType.DATE}
                        onChange={onChange}
                    />
                </FiltersProvider>,
            );

            await userEvent.type(
                screen.getByRole('textbox'),
                '2026-10-28{Enter}',
            );

            expect(onChange).toHaveBeenLastCalledWith({
                ...rule,
                values: [expected],
            });
        },
    );

    it('uses the selected field boundary when its warehouse differs from the project', async () => {
        const onChange = vi.fn();
        renderWithProviders(
            <FiltersProvider
                warehouseType={WarehouseTypes.BIGQUERY}
                startOfWeek={WeekDay.SUNDAY}
            >
                <DateFilterInputs
                    field={{ ...field, filterStartOfWeek: WeekDay.MONDAY }}
                    rule={rule}
                    filterType={FilterType.DATE}
                    onChange={onChange}
                />
            </FiltersProvider>,
        );

        await userEvent.type(screen.getByRole('textbox'), '2026-10-28{Enter}');

        expect(onChange).toHaveBeenLastCalledWith({
            ...rule,
            values: ['2026-10-26'],
        });
    });

    it('preserves the locale fallback when warehouse metadata is unavailable', async () => {
        dayjs.locale('en');
        const onChange = vi.fn();
        renderWithProviders(
            <FiltersProvider>
                <DateFilterInputs
                    field={field}
                    rule={rule}
                    filterType={FilterType.DATE}
                    onChange={onChange}
                />
            </FiltersProvider>,
        );

        await userEvent.type(screen.getByRole('textbox'), '2026-10-28{Enter}');

        expect(onChange).toHaveBeenLastCalledWith({
            ...rule,
            values: ['2026-10-25'],
        });
    });

    it.each([
        { startOfWeek: WeekDay.MONDAY, expected: '2026-10-26' },
        { startOfWeek: WeekDay.WEDNESDAY, expected: '2026-10-28' },
        { startOfWeek: WeekDay.SUNDAY, expected: '2026-10-25' },
    ])(
        'honors configured week start $startOfWeek',
        async ({ startOfWeek, expected }) => {
            const onChange = vi.fn();
            renderWithProviders(
                <FiltersProvider
                    warehouseType={WarehouseTypes.BIGQUERY}
                    startOfWeek={startOfWeek}
                >
                    <DateFilterInputs
                        field={field}
                        rule={rule}
                        filterType={FilterType.DATE}
                        onChange={onChange}
                    />
                </FiltersProvider>,
            );

            await userEvent.type(
                screen.getByRole('textbox'),
                '2026-10-28{Enter}',
            );

            expect(onChange).toHaveBeenLastCalledWith({
                ...rule,
                values: [expected],
            });
        },
    );
});
