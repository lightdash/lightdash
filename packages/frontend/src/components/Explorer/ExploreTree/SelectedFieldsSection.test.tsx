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

const renderSelectedDimension = () => {
    const user = userEvent.setup({ skipHover: true });
    const store = createExplorerStore();
    const onDeselect = vi.fn();

    renderWithProviders(
        <Provider store={store}>
            <SelectedFieldsSection
                fields={[
                    {
                        fieldId: 'subscriptions_customer_id',
                        item,
                        tableLabel: 'Subscriptions',
                        isDimension: true,
                    },
                ]}
                onDeselect={onDeselect}
            />
        </Provider>,
    );
    return { user, store, onDeselect };
};

describe('SelectedFieldsSection source-aware actions', () => {
    it('quick-creates a metric from a selected dimension without opening the modal or deselecting it', async () => {
        const { user, store, onDeselect } = renderSelectedDimension();

        await user.hover(
            screen.getByTestId('selected-field-subscriptions_customer_id'),
        );
        await user.click(screen.getByRole('button', { name: 'View options' }));
        await user.click(screen.getByRole('menuitem', { name: 'Sum' }));

        expect(store.getState().explorer.modals.additionalMetric.isOpen).toBe(
            false,
        );
        expect(await screen.findByLabelText('Label')).toHaveValue(
            'Sum of Customer id',
        );

        await user.clear(screen.getByLabelText('Label'));
        await user.type(screen.getByLabelText('Label'), 'Customer total');
        await user.click(screen.getByRole('button', { name: 'Create' }));

        const { metricQuery } = store.getState().explorer.unsavedChartVersion;
        expect(metricQuery.additionalMetrics).toEqual([
            expect.objectContaining({
                label: 'Customer total',
                type: MetricType.SUM,
                baseDimensionName: 'customer_id',
            }),
        ]);
        expect(metricQuery.metrics).toEqual([
            'subscriptions_customer_id_customer_total',
        ]);
        expect(screen.queryByLabelText('Label')).not.toBeInTheDocument();
        expect(onDeselect).not.toHaveBeenCalled();
    });

    it('dismisses quick-create and passes the label to More options after reopening', async () => {
        const { user, store, onDeselect } = renderSelectedDimension();
        const openQuickCreate = async () => {
            await user.hover(
                screen.getByTestId('selected-field-subscriptions_customer_id'),
            );
            await user.click(
                screen.getByRole('button', { name: 'View options' }),
            );
            await user.click(screen.getByRole('menuitem', { name: 'Sum' }));
            await screen.findByLabelText('Label');
        };

        await openQuickCreate();
        await user.keyboard('{Escape}');

        expect(screen.queryByLabelText('Label')).not.toBeInTheDocument();
        expect(store.getState().explorer.modals.additionalMetric.isOpen).toBe(
            false,
        );

        await openQuickCreate();
        await user.clear(screen.getByLabelText('Label'));
        await user.type(screen.getByLabelText('Label'), 'Customer total');
        await user.click(screen.getByRole('button', { name: 'More options' }));

        expect(store.getState().explorer.modals.additionalMetric).toEqual({
            isOpen: true,
            isEditing: false,
            type: MetricType.SUM,
            item,
            label: 'Customer total',
        });
        expect(screen.queryByLabelText('Label')).not.toBeInTheDocument();
        expect(onDeselect).not.toHaveBeenCalled();
    });

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
        // user-event's mouseout has no relatedTarget, so a moving click hides the row actions
        const user = userEvent.setup({ skipHover: true });
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
