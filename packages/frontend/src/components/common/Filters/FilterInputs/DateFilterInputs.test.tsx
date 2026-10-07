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
    const onChange = vi.fn();
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
    return { onChange };
};

describe('DateFilterInputs in the current period bounds', () => {
    it('shows "To date" but not "Include today" when toDate is off', () => {
        renderInputs(buildRule({ unitOfTime: UnitOfTime.months }));

        expect(screen.getByLabelText('To date')).not.toBeChecked();
        expect(screen.queryByLabelText('Include today')).toBeNull();
    });

    it('hides both toggles for units of a day or finer', () => {
        renderInputs(buildRule({ unitOfTime: UnitOfTime.days }));

        expect(screen.queryByLabelText('To date')).toBeNull();
        expect(screen.queryByLabelText('Include today')).toBeNull();
    });

    it('turning "To date" on sets toDate', async () => {
        const user = userEvent.setup();
        const { onChange } = renderInputs(
            buildRule({ unitOfTime: UnitOfTime.months }),
        );

        await user.click(screen.getByLabelText('To date'));

        expect(onChange).toHaveBeenCalledWith(
            expect.objectContaining({
                settings: {
                    unitOfTime: UnitOfTime.months,
                    toDate: true,
                    completed: false,
                },
            }),
        );
    });

    it('shows "Include today" checked by default when toDate is on', async () => {
        const user = userEvent.setup();
        const { onChange } = renderInputs(
            buildRule({ unitOfTime: UnitOfTime.months, toDate: true }),
        );

        expect(screen.getByLabelText('To date')).toBeChecked();
        const includeToday = screen.getByLabelText('Include today');
        expect(includeToday).toBeChecked();

        await user.click(includeToday);

        expect(onChange).toHaveBeenCalledWith(
            expect.objectContaining({
                settings: {
                    unitOfTime: UnitOfTime.months,
                    toDate: true,
                    excludeToday: true,
                    completed: false,
                },
            }),
        );
    });

    it('re-checking "Include today" clears excludeToday', async () => {
        const user = userEvent.setup();
        const { onChange } = renderInputs(
            buildRule({
                unitOfTime: UnitOfTime.months,
                toDate: true,
                excludeToday: true,
            }),
        );

        const includeToday = screen.getByLabelText('Include today');
        expect(includeToday).not.toBeChecked();

        await user.click(includeToday);

        expect(onChange).toHaveBeenCalledWith(
            expect.objectContaining({
                settings: {
                    unitOfTime: UnitOfTime.months,
                    toDate: true,
                    excludeToday: false,
                    completed: false,
                },
            }),
        );
    });

    it('turning "To date" off clears both bounds', async () => {
        const user = userEvent.setup();
        const { onChange } = renderInputs(
            buildRule({
                unitOfTime: UnitOfTime.months,
                toDate: true,
                excludeToday: true,
            }),
        );

        await user.click(screen.getByLabelText('To date'));

        expect(onChange).toHaveBeenCalledWith(
            expect.objectContaining({
                settings: { unitOfTime: UnitOfTime.months, completed: false },
            }),
        );
    });
});
