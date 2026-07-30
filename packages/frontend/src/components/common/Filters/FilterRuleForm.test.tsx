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

const dimension = (name: string, hidden: boolean): FilterableDimension => ({
    fieldType: FieldType.DIMENSION,
    type: DimensionType.NUMBER,
    name,
    label: name,
    table: 'orders',
    tableLabel: 'Orders',
    sql: `\${TABLE}.${name}`,
    hidden,
});

const visibleDimension = dimension('amount', false);
const hiddenDimension = dimension('credit_card_amount', true);
const fields = [visibleDimension, hiddenDimension];

const renderFilterRuleForm = (field: FilterableDimension) =>
    renderWithProviders(
        <FiltersProvider itemsMap={{}}>
            <FilterRuleForm
                fields={fields}
                filterRule={createFilterRuleFromField(field)}
                isEditMode
                onChange={vi.fn()}
                onDelete={vi.fn()}
            />
        </FiltersProvider>,
    );

describe('FilterRuleForm', () => {
    // jsdom does not implement scrollIntoView, which Mantine's combobox calls
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

    it('renders a rule that targets a hidden field', () => {
        renderFilterRuleForm(hiddenDimension);

        expect(screen.getByTestId('FilterRuleForm/filter-rule')).toBeTruthy();
        expect(screen.getByDisplayValue(hiddenDimension.label)).toBeTruthy();
    });

    it('excludes hidden fields from the field options', async () => {
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
