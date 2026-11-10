import {
    DimensionType,
    FieldType,
    FilterOperator,
    FilterType,
    TimeFrames,
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

const buildRule = (
    settings: DateFilterRule['settings'],
    operator: FilterOperator = FilterOperator.IN_THE_CURRENT,
): DateFilterRule => ({
    id: 'rule-1',
    target: { fieldId: 'orders_order_date' },
    operator,
    values: [1],
    settings,
});

const renderInputs = (
    rule: DateFilterRule,
    field: FilterableDimension = dateDimension,
) => {
    const onChange = vi.fn<(rule: DateFilterRule) => void>();
    renderWithProviders(
        <FiltersProvider itemsMap={{}}>
            <DateFilterInputs
                filterType={FilterType.DATE}
                field={field}
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

const optionLabels = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('combobox'));
    return screen
        .getAllByRole('option', { hidden: true })
        .map((option) => option.textContent);
};

describe('DateFilterInputs in the current period bounds', () => {
    it('offers a "to date" entry for each unit coarser than a day', async () => {
        const user = userEvent.setup();
        renderInputs(buildRule({ unitOfTime: UnitOfTime.months }));

        expect(await optionLabels(user)).toStrictEqual([
            'year',
            'year to date',
            'quarter',
            'quarter to date',
            'month',
            'month to date',
            'week',
            'week to date',
            'day',
        ]);
    });

    it('shows the whole-period unit and no "Include today" when toDate is off', () => {
        renderInputs(buildRule({ unitOfTime: UnitOfTime.months }));

        expect(screen.getByRole('combobox')).toHaveValue('month');
        expect(screen.queryByLabelText('Include today')).toBeNull();
    });

    it('hides "Include today" when no unit is selected yet', () => {
        renderInputs(buildRule({}));

        expect(screen.queryByLabelText('Include today')).toBeNull();
    });

    it('selecting "month to date" sets toDate', async () => {
        const user = userEvent.setup();
        const { lastSettings } = renderInputs(
            buildRule({ unitOfTime: UnitOfTime.months }),
        );

        await selectUnit(user, 'month to date');

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

        expect(screen.getByRole('combobox')).toHaveValue('month to date');
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

    it('selecting the whole-period unit clears both bounds', async () => {
        const user = userEvent.setup();
        const { lastSettings } = renderInputs(
            buildRule({
                unitOfTime: UnitOfTime.months,
                toDate: true,
                excludeToday: true,
            }),
        );

        await selectUnit(user, 'month');

        expect(lastSettings()).toStrictEqual({
            unitOfTime: UnitOfTime.months,
            completed: false,
        });
    });

    it('keeps excludeToday when switching to another "to date" unit', async () => {
        const user = userEvent.setup();
        const { lastSettings } = renderInputs(
            buildRule({
                unitOfTime: UnitOfTime.months,
                toDate: true,
                excludeToday: true,
            }),
        );

        await selectUnit(user, 'year to date');

        expect(lastSettings()).toStrictEqual({
            unitOfTime: UnitOfTime.years,
            toDate: true,
            excludeToday: true,
            completed: false,
        });
    });

    it('selecting a day clears the bounds', async () => {
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

    it('shows a saved "to date" unit the field granularity would hide', () => {
        renderInputs(
            buildRule({ unitOfTime: UnitOfTime.months, toDate: true }),
            { ...dateDimension, timeInterval: TimeFrames.YEAR },
        );

        expect(screen.getByRole('combobox')).toHaveValue('month to date');
        expect(screen.getByLabelText('Include today')).toBeChecked();
    });

    it('treats toDate on a day unit as the whole day', () => {
        renderInputs(buildRule({ unitOfTime: UnitOfTime.days, toDate: true }));

        expect(screen.getByRole('combobox')).toHaveValue('day');
        expect(screen.queryByLabelText('Include today')).toBeNull();
    });

    it('does not offer "to date" units or write bounds for "in the last"', async () => {
        const user = userEvent.setup();
        const { lastSettings } = renderInputs(
            buildRule(
                { unitOfTime: UnitOfTime.months, completed: false },
                FilterOperator.IN_THE_PAST,
            ),
        );

        const labels = await optionLabels(user);
        expect(labels.some((label) => label?.includes('to date'))).toBe(false);

        await user.click(
            screen.getByRole('option', { name: 'years', hidden: true }),
        );

        expect(lastSettings()).toStrictEqual({
            unitOfTime: UnitOfTime.years,
            completed: false,
        });
    });
});
