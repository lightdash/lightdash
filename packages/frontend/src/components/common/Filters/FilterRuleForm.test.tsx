import {
    createFilterRuleFromField,
    DimensionType,
    FieldType,
    FilterOperator,
    type FilterableDimension,
    type FilterRule,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../testing/testUtils';
import FilterRuleForm from './FilterRuleForm';
import FiltersProvider from './FiltersProvider';

const hiddenDimension: FilterableDimension = {
    fieldType: FieldType.DIMENSION,
    type: DimensionType.NUMBER,
    name: 'credit_card_amount',
    label: 'Credit card amount',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '${TABLE}.credit_card_amount',
    hidden: true,
};

const visibleDimension: FilterableDimension = {
    ...hiddenDimension,
    name: 'amount',
    label: 'Amount',
    sql: '${TABLE}.amount',
    hidden: false,
};

const timestampDimension: FilterableDimension = {
    ...visibleDimension,
    type: DimensionType.TIMESTAMP,
    name: 'created_at',
    label: 'Created at',
    sql: '${TABLE}.created_at',
};

const renderFilterRuleForm = (
    dimension: FilterableDimension,
    filterRule: FilterRule = createFilterRuleFromField(dimension),
    onChange = vi.fn(),
) => {
    renderWithProviders(
        <FiltersProvider itemsMap={{}}>
            <FilterRuleForm
                fields={[visibleDimension, hiddenDimension, timestampDimension]}
                filterRule={filterRule}
                isEditMode
                onChange={onChange}
                onDelete={vi.fn()}
            />
        </FiltersProvider>,
    );

    return { onChange };
};

describe('FilterRuleForm', () => {
    beforeAll(() => {
        Object.defineProperty(Element.prototype, 'scrollIntoView', {
            configurable: true,
            writable: true,
            value: vi.fn(),
        });
    });

    afterAll(() => {
        delete (Element.prototype as Partial<Element>).scrollIntoView;
    });

    it('locks a hidden field and explains why in a tooltip', async () => {
        const user = userEvent.setup();
        renderFilterRuleForm(hiddenDimension);

        const fieldSelect = screen.getByDisplayValue(hiddenDimension.label);
        expect(fieldSelect).toBeDisabled();
        expect(screen.getByDisplayValue('is')).toBeEnabled();
        expect(screen.getByTestId('delete-filter-rule-button')).toBeEnabled();

        await user.hover(fieldSelect);
        expect(
            await screen.findByText('Hidden fields cannot be changed.'),
        ).toBeTruthy();
    });

    it('does not offer hidden fields when changing a visible filter', async () => {
        const user = userEvent.setup();
        renderFilterRuleForm(visibleDimension);

        await user.click(screen.getByDisplayValue(visibleDimension.label));

        expect(
            await screen.findByRole('option', { name: visibleDimension.label }),
        ).toBeTruthy();
        expect(
            screen.queryByRole('option', { name: hiddenDimension.label }),
        ).toBeNull();
    });

    it('preserves a timestamp value when changing to is between', async () => {
        const user = userEvent.setup();
        const timestampValue = '2024-11-01T10:00:00-05:00';
        const filterRule = {
            ...createFilterRuleFromField(timestampDimension),
            values: [timestampValue],
        };
        const { onChange } = renderFilterRuleForm(
            timestampDimension,
            filterRule,
        );

        await user.click(screen.getByDisplayValue('is'));
        await user.click(
            await screen.findByRole('option', { name: 'is between' }),
        );

        expect(onChange).toHaveBeenCalledWith({
            ...filterRule,
            operator: FilterOperator.IN_BETWEEN,
            values: [timestampValue],
            settings: undefined,
        });
    });
});
