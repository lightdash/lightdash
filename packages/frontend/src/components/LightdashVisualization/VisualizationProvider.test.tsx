import {
    ChartType,
    DimensionType,
    FieldType,
    MERGE_TABLE_NAME,
    MetricType,
    QueryHistoryStatus,
    type Dimension,
    type ItemsMap,
    type Metric,
    type MetricQuery,
} from '@lightdash/common';
import { cleanup, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ChartColorMappingContextProvider from '../../hooks/useChartColorConfig/ChartColorMappingContextProvider';
import { type InfiniteQueryResults } from '../../hooks/useQueryResults';
import { renderWithProviders } from '../../testing/testUtils';
import { isTableVisualizationConfig } from './types';
import { useVisualizationContext } from './useVisualizationContext';
import VisualizationProvider from './VisualizationProvider';

vi.mock('@shopify/react-web-worker', () => ({
    createWorkerFactory: () => () => ({}),
    useWorker: () => ({}),
}));

vi.mock('../../hooks/useServerOrClientFeatureFlag', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    useServerFeatureFlag: () => ({ data: undefined }),
}));

const dimension = (table: string, name: string, label: string): Dimension => ({
    fieldType: FieldType.DIMENSION,
    type: DimensionType.DATE,
    name,
    label,
    table,
    tableLabel: table,
    sql: '',
    hidden: false,
});

const metric = (table: string, name: string, label: string): Metric => ({
    fieldType: FieldType.METRIC,
    type: MetricType.SUM,
    name,
    label,
    table,
    tableLabel: table,
    sql: '',
    hidden: false,
});

const JOIN_KEY = 'merge_order_month';
const SOURCE_A_METRIC = 'a_orders_total_order_amount';
const SOURCE_B_METRIC = 'b_payments_unique_payment_count';

const mergedFields: ItemsMap = {
    [JOIN_KEY]: dimension(MERGE_TABLE_NAME, 'order_month', 'Order month'),
    [SOURCE_A_METRIC]: metric('a', 'orders_total_order_amount', 'Total'),
    [SOURCE_B_METRIC]: metric('b', 'payments_unique_payment_count', 'Count'),
};

const mergedMetricQuery: MetricQuery = {
    exploreName: MERGE_TABLE_NAME,
    dimensions: [JOIN_KEY],
    metrics: [SOURCE_A_METRIC, SOURCE_B_METRIC],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
};

const ordersFields: ItemsMap = {
    orders_order_date_month: dimension(
        'orders',
        'order_date_month',
        'Order month',
    ),
    orders_total_order_amount: metric('orders', 'total_order_amount', 'Total'),
};

const ordersMetricQuery: MetricQuery = {
    exploreName: 'orders',
    dimensions: ['orders_order_date_month'],
    metrics: ['orders_total_order_amount'],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
};

const resultsFor = (
    metricQuery: MetricQuery,
    fields: ItemsMap,
): InfiniteQueryResults & { metricQuery: MetricQuery; fields: ItemsMap } => ({
    queryUuid: 'query-uuid',
    queryStatus: QueryHistoryStatus.READY,
    rows: [
        Object.fromEntries(
            Object.keys(fields).map((fieldId) => [
                fieldId,
                { value: { raw: 1, formatted: '1' } },
            ]),
        ),
    ],
    totalResults: 1,
    isInitialLoading: false,
    isFetchingFirstPage: false,
    isFetchingRows: false,
    isFetchingAllPages: false,
    fetchMoreRows: () => {},
    refetchRows: async () => {},
    setFetchAll: () => {},
    fetchAll: false,
    hasFetchedAllRows: true,
    totalClientFetchTimeMs: undefined,
    error: null,
    metricQuery,
    fields,
});

const Probe = () => {
    const { columnOrder, visualizationConfig } = useVisualizationContext();
    const columnIds = isTableVisualizationConfig(visualizationConfig)
        ? visualizationConfig.chartConfig.columns.map((column) => column.id)
        : [];
    return (
        <div
            data-testid="probe"
            data-column-order={columnOrder.join(',')}
            data-columns={columnIds.join(',')}
        />
    );
};

const renderTable = (
    resultsData: ReturnType<typeof resultsFor>,
    columnOrder: string[],
) => {
    renderWithProviders(
        <MemoryRouter>
            <ChartColorMappingContextProvider>
                <VisualizationProvider
                    chartConfig={{ type: ChartType.TABLE, config: undefined }}
                    initialPivotDimensions={undefined}
                    resultsData={resultsData}
                    isLoading={false}
                    columnOrder={columnOrder}
                    colorPalette={[]}
                    isDashboard
                >
                    <Probe />
                </VisualizationProvider>
            </ChartColorMappingContextProvider>
        </MemoryRouter>,
    );
    const probe = screen.getByTestId('probe');
    return {
        columnOrder: probe.getAttribute('data-column-order'),
        columns: probe.getAttribute('data-columns'),
    };
};

describe('VisualizationProvider column order', () => {
    afterEach(() => {
        cleanup();
    });

    it('renders merged columns when the saved order names the source query fields', () => {
        const { columnOrder, columns } = renderTable(
            resultsFor(mergedMetricQuery, mergedFields),
            ['orders_order_date_month', 'orders_total_order_amount'],
        );

        const merged = [JOIN_KEY, SOURCE_A_METRIC, SOURCE_B_METRIC].join(',');
        expect(columnOrder).toBe(merged);
        expect(columns).toBe(merged);
    });

    it('keeps a saved order expressed in merged field ids', () => {
        const saved = [SOURCE_B_METRIC, JOIN_KEY, SOURCE_A_METRIC];
        const { columnOrder, columns } = renderTable(
            resultsFor(mergedMetricQuery, mergedFields),
            saved,
        );

        expect(columnOrder).toBe(saved.join(','));
        expect(columns).toBe(saved.join(','));
    });

    it('falls back to the merged query order when nothing was saved', () => {
        const { columns } = renderTable(
            resultsFor(mergedMetricQuery, mergedFields),
            [],
        );

        expect(columns).toBe(
            [JOIN_KEY, SOURCE_A_METRIC, SOURCE_B_METRIC].join(','),
        );
    });

    it('leaves an ordinary chart order untouched', () => {
        const saved = ['orders_total_order_amount', 'orders_order_date_month'];
        const { columnOrder, columns } = renderTable(
            resultsFor(ordersMetricQuery, ordersFields),
            saved,
        );

        expect(columnOrder).toBe(saved.join(','));
        expect(columns).toBe(saved.join(','));
    });
});
