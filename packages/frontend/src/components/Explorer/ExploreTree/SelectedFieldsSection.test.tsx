import {
    DimensionType,
    FieldType,
    MetricType,
    type Dimension,
    type Metric,
} from '@lightdash/common';
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

const metric = {
    table: 'payments',
    tableLabel: 'Payments',
    name: 'unique_payment_count',
    label: 'Unique payment count',
    description: 'Count of all payments',
    fieldType: FieldType.METRIC,
    type: MetricType.COUNT_DISTINCT,
    hidden: false,
    sql: '${TABLE}.payment_id',
    compiledSql: 'payments.payment_id',
    filters: [],
} as Metric;

describe('SelectedFieldsSection source-aware actions', () => {
    it('shows field details for a selected metric on hover', async () => {
        const user = userEvent.setup();

        renderWithProviders(
            <Provider store={createExplorerStore()}>
                <SelectedFieldsSection
                    fields={[
                        {
                            fieldId: 'payments_unique_payment_count',
                            item: metric,
                            tableLabel: 'Payments',
                            isDimension: false,
                        },
                    ]}
                    onDeselect={vi.fn()}
                />
            </Provider>,
        );

        await user.hover(screen.getByTitle('Unique payment count'));

        expect(await screen.findByText('Count of all payments')).toBeVisible();
        expect(screen.getByText('${TABLE}.payment_id')).toBeVisible();

        await user.click(screen.getByRole('button', { name: 'Compiled SQL' }));

        expect(screen.getByText('payments.payment_id')).toBeVisible();
        expect(
            screen.getByTestId('selected-field-payments_unique_payment_count'),
        ).toBeInTheDocument();
    });

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
        await user.hover(screen.getByTitle('Customer id'));

        expect(
            await screen.findByText('The customer identifier'),
        ).toBeVisible();

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
