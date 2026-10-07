import {
    DimensionType,
    FieldType,
    FilterOperator,
    FilterType,
    UnitOfTime,
    type DateFilterRule,
    type FilterableDimension,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../../testing/testUtils';
import FiltersProvider from '../FiltersProvider';
import DateFilterInputs from './DateFilterInputs';

const dateDimension: FilterableDimension = {
    fieldType: FieldType.DIMENSION,
    type: DimensionType.DATE,
    name: 'order_date',
    label: 'Order date',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '${TABLE}.order_date',
    hidden: false,
};

const buildRule = (settings: DateFilterRule['settings']): DateFilterRule => ({
    id: 'rule-1',
    target: { fieldId: 'orders_order_date' },
    operator: FilterOperator.IN_THE_CURRENT,
    values: [1],
    settings,
});

const renderInputs = (rule: DateFilterRule) => {
    const onChange = vi.fn<(rule: DateFilterRule) => void>();
    renderWithProviders(
        <FiltersProvider itemsMap={{}}>
            <DateFilterInputs
                filterType={FilterType.DATE}
                field={dateDimension}
                rule={rule}
                onChange={onChange}
            />
        </FiltersProvider>,
    );
    return {
        onChange,
        lastSettings: () => onChange.mock.calls.at(-1)?.[0].settings,
    };
};

const selectUnit = async (
    user: ReturnType<typeof userEvent.setup>,
    label: string,
) => {
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: label, hidden: true }));
};

describe('DateFilterInputs in the current period bounds', () => {
    it('shows "To date" but not "Include today" when toDate is off', () => {
        renderInputs(buildRule({ unitOfTime: UnitOfTime.months }));

        expect(screen.getByLabelText('To date')).not.toBeChecked();
        expect(screen.queryByLabelText('Include today')).toBeNull();
    });

    it('hides both toggles when no unit is selected yet', () => {
        renderInputs(buildRule({}));

        expect(screen.queryByLabelText('To date')).toBeNull();
        expect(screen.queryByLabelText('Include today')).toBeNull();
    });

    it('hides both toggles for units of a day or finer', () => {
        renderInputs(buildRule({ unitOfTime: UnitOfTime.days }));

        expect(screen.queryByLabelText('To date')).toBeNull();
        expect(screen.queryByLabelText('Include today')).toBeNull();
    });

    it('turning "To date" on sets toDate', async () => {
        const user = userEvent.setup();
        const { lastSettings } = renderInputs(
            buildRule({ unitOfTime: UnitOfTime.months }),
        );

        await user.click(screen.getByLabelText('To date'));

        expect(lastSettings()).toStrictEqual({
            unitOfTime: UnitOfTime.months,
            toDate: true,
            completed: false,
        });
    });

    it('shows "Include today" checked by default when toDate is on', async () => {
        const user = userEvent.setup();
        const { lastSettings } = renderInputs(
            buildRule({ unitOfTime: UnitOfTime.months, toDate: true }),
        );

        expect(screen.getByLabelText('To date')).toBeChecked();
        const includeToday = screen.getByLabelText('Include today');
        expect(includeToday).toBeChecked();

        await user.click(includeToday);

        expect(lastSettings()).toStrictEqual({
            unitOfTime: UnitOfTime.months,
            toDate: true,
            excludeToday: true,
            completed: false,
        });
    });

    it('re-checking "Include today" clears excludeToday', async () => {
        const user = userEvent.setup();
        const { lastSettings } = renderInputs(
            buildRule({
                unitOfTime: UnitOfTime.months,
                toDate: true,
                excludeToday: true,
            }),
        );

        const includeToday = screen.getByLabelText('Include today');
        expect(includeToday).not.toBeChecked();

        await user.click(includeToday);

        expect(lastSettings()).toStrictEqual({
            unitOfTime: UnitOfTime.months,
            toDate: true,
            completed: false,
        });
    });

    it('turning "To date" off clears both bounds', async () => {
        const user = userEvent.setup();
        const { lastSettings } = renderInputs(
            buildRule({
                unitOfTime: UnitOfTime.months,
                toDate: true,
                excludeToday: true,
            }),
        );

        await user.click(screen.getByLabelText('To date'));

        expect(lastSettings()).toStrictEqual({
            unitOfTime: UnitOfTime.months,
            completed: false,
        });
    });

    it('keeps the bounds when switching to another unit that supports them', async () => {
        const user = userEvent.setup();
        const { lastSettings } = renderInputs(
            buildRule({
                unitOfTime: UnitOfTime.months,
                toDate: true,
                excludeToday: true,
            }),
        );

        await selectUnit(user, 'year');

        expect(lastSettings()).toStrictEqual({
            unitOfTime: UnitOfTime.years,
            toDate: true,
            excludeToday: true,
            completed: false,
        });
    });

    it('clears the bounds when switching to a unit of a day or finer', async () => {
        const user = userEvent.setup();
        const { lastSettings } = renderInputs(
            buildRule({
                unitOfTime: UnitOfTime.months,
                toDate: true,
                excludeToday: true,
            }),
        );

        await selectUnit(user, 'day');

        expect(lastSettings()).toStrictEqual({
            unitOfTime: UnitOfTime.days,
            completed: false,
        });
    });

    it('does not write undefined bound keys on a unit change', async () => {
        const user = userEvent.setup();
        const { lastSettings } = renderInputs(
            buildRule({ unitOfTime: UnitOfTime.months }),
        );

        await selectUnit(user, 'year');

        expect(lastSettings()).toStrictEqual({
            unitOfTime: UnitOfTime.years,
            completed: false,
        });
    });
});
