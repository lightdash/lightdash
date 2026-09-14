import {
    DimensionType,
    FieldType,
    type FilterableDimension,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../testing/testUtils';
import FiltersProvider from '../../common/Filters/FiltersProvider';
import { FilterForm } from './FilterForm';

vi.mock('../../../features/explorer/store', () => ({
    selectIsEditMode: vi.fn(),
    useExplorerSelector: () => true,
}));

const dimension = (name: string, hidden: boolean): FilterableDimension => ({
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name,
    label: name,
    table: 'orders',
    tableLabel: 'Orders',
    sql: `\${TABLE}.${name}`,
    hidden,
});

const hiddenDimension = dimension('credit_card_amount', true);
const visibleDimension = dimension('status', false);

const renderFilterForm = (
    itemsMap: Record<string, FilterableDimension>,
    setFilters = vi.fn(),
) => {
    renderWithProviders(
        <FiltersProvider itemsMap={itemsMap}>
            <FilterForm
                defaultFilterRuleFieldId={undefined}
                customMetricFiltersWithIds={[]}
                setCustomMetricFiltersWithIds={setFilters}
            />
        </FiltersProvider>,
    );

    return setFilters;
};

describe('FilterForm', () => {
    it('uses a visible dimension when adding a filter', async () => {
        const user = userEvent.setup();
        const setFilters = renderFilterForm({
            orders_credit_card_amount: hiddenDimension,
            orders_status: visibleDimension,
        });

        await user.click(screen.getByRole('button', { name: 'Add filter' }));

        expect(setFilters).toHaveBeenCalledWith([
            expect.objectContaining({
                target: expect.objectContaining({
                    fieldId: 'orders_status',
                }),
            }),
        ]);
    });

    it('disables Add filter when only hidden dimensions are available', () => {
        renderFilterForm({
            orders_credit_card_amount: hiddenDimension,
        });

        expect(
            screen.getByRole('button', { name: 'Add filter' }),
        ).toBeDisabled();
    });
});
