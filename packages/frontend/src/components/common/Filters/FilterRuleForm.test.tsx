import {
    createFilterRuleFromField,
    DimensionType,
    FieldType,
    type FilterableDimension,
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

const renderFilterRuleForm = (dimension: FilterableDimension) =>
    renderWithProviders(
        <FiltersProvider itemsMap={{}}>
            <FilterRuleForm
                fields={[visibleDimension, hiddenDimension]}
                filterRule={createFilterRuleFromField(dimension)}
                isEditMode
                onChange={vi.fn()}
                onDelete={vi.fn()}
            />
        </FiltersProvider>,
    );

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
});
