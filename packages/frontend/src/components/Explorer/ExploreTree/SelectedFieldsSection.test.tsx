import { DimensionType, FieldType, type Dimension } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { createExplorerStore } from '../../../features/explorer/store';
import { renderWithProviders } from '../../../testing/testUtils';
import SelectedFieldsSection from './SelectedFieldsSection';

const item = {
    table: 'subscriptions',
    tableLabel: 'Subscriptions',
    name: 'customer_id',
    label: 'Customer id',
    description: 'The customer identifier',
    fieldType: FieldType.DIMENSION,
    type: DimensionType.NUMBER,
    hidden: false,
} as Dimension;

describe('SelectedFieldsSection source-aware actions', () => {
    it('shows filter and basic overflow actions for a merged source field', async () => {
        const user = userEvent.setup();
        const onAddFilter = vi.fn();

        renderWithProviders(
            <Provider store={createExplorerStore()}>
                <SelectedFieldsSection
                    fields={[
                        {
                            fieldId: 'subscriptions_customer_id',
                            selectionKey: 'b:subscriptions_customer_id',
                            item,
                            tableLabel: 'Subscriptions',
                            isDimension: true,
                            onAddFilter,
                            basicActionsOnly: true,
                        },
                    ]}
                    onDeselect={vi.fn()}
                />
            </Provider>,
        );

        await user.hover(
            screen.getByTestId('selected-field-b:subscriptions_customer_id'),
        );
        await user.click(screen.getByRole('button', { name: 'Add filter' }));

        expect(onAddFilter).toHaveBeenCalledWith(item);

        await user.click(screen.getByRole('button', { name: 'View options' }));

        expect(
            screen.getByRole('menuitem', { name: 'Add filter' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('menuitem', { name: 'View description' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('menuitem', { name: 'Create custom metric' }),
        ).not.toBeInTheDocument();
    });
});
