import {
    buildPopAdditionalMetric,
    DimensionType,
    FieldType,
    MetricType,
    TimeFrames,
    type AdditionalMetric,
    type Dimension,
    type Metric,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import {
    createExplorerStore,
    explorerActions,
    selectAdditionalMetrics,
} from '../../../features/explorer/store';
import { renderWithProviders } from '../../../testing/testUtils';
import { PeriodOverPeriodComparisonModal } from './PeriodOverPeriodComparisonModal';

const orderWeek: Dimension = {
    fieldType: FieldType.DIMENSION,
    type: DimensionType.DATE,
    table: 'orders',
    tableLabel: 'Orders',
    name: 'order_date_week',
    label: 'Order date week',
    sql: '${TABLE}.order_date',
    hidden: false,
    timeInterval: TimeFrames.WEEK,
};

const orderMonth: Dimension = {
    ...orderWeek,
    name: 'order_date_month',
    label: 'Order date month',
    timeInterval: TimeFrames.MONTH,
};

const metric: Metric = {
    fieldType: FieldType.METRIC,
    type: MetricType.COUNT,
    table: 'orders',
    tableLabel: 'Orders',
    name: 'order_count',
    label: 'Order count',
    sql: '${TABLE}.order_id',
    hidden: false,
};

const renderModal = (
    dimensions: Dimension[],
    additionalMetrics: AdditionalMetric[] = [],
) => {
    const store = createExplorerStore();
    const itemsMap = Object.fromEntries(
        dimensions.map((dimension) => [
            `${dimension.table}_${dimension.name}`,
            dimension,
        ]),
    );
    store.dispatch(explorerActions.setDimensions(Object.keys(itemsMap)));
    additionalMetrics.forEach((additionalMetric) =>
        store.dispatch(explorerActions.addAdditionalMetric(additionalMetric)),
    );
    store.dispatch(
        explorerActions.togglePeriodOverPeriodComparisonModal({
            metric,
            itemsMap,
        }),
    );
    renderWithProviders(
        <Provider store={store}>
            <PeriodOverPeriodComparisonModal />
        </Provider>,
    );
    return store;
};

describe('PeriodOverPeriodComparisonModal', () => {
    it.each([
        { name: 'one time dimension', dimensions: [orderWeek] },
        { name: 'mixed grains', dimensions: [orderMonth, orderWeek] },
    ])(
        'automatically uses the only eligible dimension without a dropdown: $name',
        async ({ dimensions }) => {
            const user = userEvent.setup();
            const store = renderModal(dimensions);

            expect(
                screen.queryByRole('textbox', { name: 'Time dimension' }),
            ).not.toBeInTheDocument();
            expect(screen.getByText('Order date week')).toBeVisible();
            expect(screen.getByText('Week granularity')).toBeVisible();
            await user.click(
                screen.getByRole('button', { name: 'Add comparison' }),
            );

            expect(selectAdditionalMetrics(store.getState())).toEqual([
                expect.objectContaining({
                    timeDimensionId: 'orders_order_date_week',
                    granularity: TimeFrames.WEEK,
                    periodOffset: 1,
                    baseMetricId: 'orders_order_count',
                }),
            ]);
        },
    );

    it('keeps the dropdown for multiple eligible dimensions and disables coarser grains', async () => {
        const user = userEvent.setup();
        const store = renderModal([
            orderMonth,
            orderWeek,
            { ...orderWeek, name: 'ship_date_week', label: 'Ship date week' },
        ]);
        const confirmButton = screen.getByRole('button', {
            name: 'Add comparison',
        });
        expect(confirmButton).toBeDisabled();

        await user.click(
            screen.getByRole('textbox', { name: 'Time dimension' }),
        );
        await user.click(
            screen.getByRole('option', { name: 'Order date month' }),
        );
        expect(confirmButton).toBeDisabled();
        await user.click(
            screen.getByRole('option', { name: 'Ship date week' }),
        );
        await user.click(confirmButton);

        expect(selectAdditionalMetrics(store.getState())).toEqual([
            expect.objectContaining({
                timeDimensionId: 'orders_ship_date_week',
                granularity: TimeFrames.WEEK,
            }),
        ]);
    });

    it('keeps comparison unavailable without an eligible time dimension', () => {
        renderModal([]);

        expect(
            screen.getByPlaceholderText(
                'Add a time dimension to enable comparison',
            ),
        ).toBeDisabled();
        expect(
            screen.getByRole('button', { name: 'Add comparison' }),
        ).toBeDisabled();
    });

    it('checks duplicates for the automatic dimension and allows a different offset', async () => {
        const user = userEvent.setup();
        const { additionalMetric } = buildPopAdditionalMetric({
            metric,
            timeDimensionId: 'orders_order_date_week',
            granularity: TimeFrames.WEEK,
            periodOffset: 1,
        });
        const store = renderModal([orderWeek], [additionalMetric]);
        const confirmButton = screen.getByRole('button', {
            name: 'Add comparison',
        });

        expect(
            screen.getByText('This comparison already exists'),
        ).toBeVisible();
        expect(confirmButton).toBeDisabled();
        const offset = screen.getByRole('textbox', { name: 'Offset' });
        await user.clear(offset);
        await user.type(offset, '2');
        await user.click(confirmButton);

        expect(selectAdditionalMetrics(store.getState())).toEqual([
            additionalMetric,
            expect.objectContaining({
                timeDimensionId: 'orders_order_date_week',
                periodOffset: 2,
            }),
        ]);
    });
});
