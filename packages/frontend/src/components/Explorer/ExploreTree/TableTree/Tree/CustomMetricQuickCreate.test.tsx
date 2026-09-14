import {
    CustomFormatType,
    DimensionType,
    FieldType,
    MetricType,
    type Dimension,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import {
    createExplorerStore,
    explorerActions,
} from '../../../../../features/explorer/store';
import { renderWithProviders } from '../../../../../testing/testUtils';
import CustomMetricQuickCreate from './CustomMetricQuickCreate';

vi.mock('../../../../../hooks/useExplore', () => ({
    useExplore: () => ({ data: undefined }),
}));
vi.mock('../../../../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastSuccess: vi.fn() }),
}));
vi.mock('../../../../../providers/Tracking/useTracking', () => ({
    default: () => ({ track: vi.fn() }),
}));

const amount: Dimension = {
    fieldType: FieldType.DIMENSION,
    type: DimensionType.NUMBER,
    name: 'amount',
    label: 'Amount',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '${TABLE}.amount',
    hidden: false,
    format: 'usd',
    round: 2,
};

const renderQuickCreate = (type: MetricType, item: Dimension = amount) => {
    const store = createExplorerStore();
    const onClose = vi.fn();
    renderWithProviders(
        <Provider store={store}>
            <CustomMetricQuickCreate
                item={item}
                type={type}
                onClose={onClose}
            />
        </Provider>,
    );
    return { store, onClose };
};

describe('CustomMetricQuickCreate', () => {
    it('prefills the label and shows the inherited format with a sample', () => {
        renderQuickCreate(MetricType.SUM);

        expect(screen.getByLabelText('Label')).toHaveValue('Sum of Amount');
        expect(screen.getByTestId('quick-create-format')).toHaveTextContent(
            /^FormatCurrency \(USD\), 2 decimalsUS?\$1,234\.57$/,
        );
    });

    it('hides the format row when nothing is inherited', () => {
        renderQuickCreate(MetricType.COUNT_DISTINCT);

        expect(screen.getByLabelText('Label')).toHaveValue(
            'Count distinct of Amount',
        );
        expect(
            screen.queryByTestId('quick-create-format'),
        ).not.toBeInTheDocument();
    });

    it('creates the metric with the dimension formatting and selects it', async () => {
        const user = userEvent.setup();
        const { store, onClose } = renderQuickCreate(MetricType.SUM);

        await user.clear(screen.getByLabelText('Label'));
        await user.type(screen.getByLabelText('Label'), 'Revenue{Enter}');

        const { metricQuery } = store.getState().explorer.unsavedChartVersion;
        expect(metricQuery.additionalMetrics).toHaveLength(1);
        expect(metricQuery.additionalMetrics?.[0]).toMatchObject({
            label: 'Revenue',
            name: 'amount_revenue',
            type: MetricType.SUM,
            baseDimensionName: 'amount',
            formatOptions: {
                type: CustomFormatType.CURRENCY,
                currency: 'USD',
                round: 2,
            },
        });
        expect(metricQuery.metrics).toEqual(['orders_amount_revenue']);
        expect(onClose).toHaveBeenCalled();
    });

    it('rejects a label that collides with an existing custom metric', async () => {
        const user = userEvent.setup();
        const { store } = renderQuickCreate(MetricType.SUM);
        store.dispatch(
            explorerActions.addAdditionalMetric({
                name: 'amount_sum_of_amount',
                label: 'Sum of Amount',
                table: 'orders',
                sql: '${TABLE}.amount',
                type: MetricType.SUM,
            }),
        );

        await user.type(screen.getByLabelText('Label'), ' ');
        await user.type(screen.getByLabelText('Label'), '{Backspace}');

        expect(
            await screen.findByText('Metric with this label already exists'),
        ).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
    });

    it('hands the typed label over to the full modal', async () => {
        const user = userEvent.setup();
        const { store, onClose } = renderQuickCreate(MetricType.AVERAGE);

        await user.clear(screen.getByLabelText('Label'));
        await user.type(screen.getByLabelText('Label'), 'Avg ticket');
        await user.click(screen.getByRole('button', { name: 'More options' }));

        expect(store.getState().explorer.modals.additionalMetric).toEqual({
            isOpen: true,
            isEditing: false,
            type: MetricType.AVERAGE,
            item: amount,
            label: 'Avg ticket',
        });
        expect(onClose).toHaveBeenCalled();
    });
});
