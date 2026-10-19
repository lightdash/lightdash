import {
    FieldType,
    MetricType,
    SupportedDbtAdapter,
    WarehouseTypes,
    type CompiledMetric,
    type Explore,
    type MetricQuery,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';
import { store as aiAgentStore } from '../../../ee/features/aiCopilot/store';
import { renderWithProviders } from '../../../testing/testUtils';
import { type EchartsSeriesClickEvent } from '../../SimpleChart';
import { SeriesContextMenu } from './SeriesContextMenu';

vi.mock('../../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project',
}));
vi.mock('../../../hooks/useExplore', () => ({
    useExplore: () => ({ data: undefined }),
    useExploreQueries: (names: unknown[]) => names.map(() => undefined),
}));
vi.mock('../../../hooks/user/useAccount', () => ({
    useAccount: () => ({ data: undefined }),
}));
vi.mock('../../../providers/Ability', () => ({
    Can: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../../LightdashVisualization/useVisualizationContext', () => ({
    useVisualizationContext: () => ({
        resultsData: { metricQuery },
        itemsMap: { orders_revenue: revenue },
    }),
}));
vi.mock('../../MetricQueryData/useMetricQueryDataContext', () => ({
    useMetricQueryDataContext: () => ({
        tableName: 'orders',
        explore,
        metricQuery,
        openUnderlyingDataModal: vi.fn(),
        openDrillDownModal: vi.fn(),
    }),
}));
vi.mock('../../MetricQueryData/utils', () => ({
    getDataFromChartClick: () => ({
        item: revenue,
        value: { raw: 3, formatted: '3' },
        fieldValues: { orders_revenue: { raw: 3, formatted: '3' } },
    }),
}));

const revenue: CompiledMetric = {
    fieldType: FieldType.METRIC,
    type: MetricType.SUM,
    table: 'orders',
    tableLabel: 'Orders',
    tablesReferences: ['orders'],
    name: 'revenue',
    label: 'Revenue',
    sql: '',
    compiledSql: '',
    hidden: false,
};
const metricQuery: MetricQuery = {
    exploreName: 'orders',
    dimensions: [],
    metrics: ['orders_revenue'],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
};
const explore: Explore = {
    name: 'orders',
    label: 'Orders',
    tags: [],
    baseTable: 'orders',
    joinedTables: [],
    tables: {},
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    spotlight: { visibility: 'show', categories: [] },
};
const click: EchartsSeriesClickEvent = {
    componentType: 'series',
    seriesType: 'bar',
    seriesIndex: 0,
    seriesName: 'Revenue',
    name: '',
    dataIndex: 0,
    data: {},
    dataType: '',
    value: 3,
    color: '',
    dimensionNames: ['orders_revenue'],
    event: { event: new MouseEvent('click') },
};

describe('series context menu outside the explorer', () => {
    it('renders in an AI chat preview, whose store has no explorer state', async () => {
        renderWithProviders(
            <Provider store={aiAgentStore}>
                <SeriesContextMenu
                    echartsSeriesClickEvent={click}
                    dimensions={[]}
                    series={[]}
                    explore={{
                        ...explore,
                        warehouseConnectionUuid: null,
                        warehouseConnection: {
                            warehouseConnectionUuid: null,
                            warehouseType: WarehouseTypes.POSTGRES,
                            startOfWeek: null,
                        },
                    }}
                />
            </Provider>,
        );

        expect(
            await screen.findByText('View underlying data'),
        ).toBeInTheDocument();
    });
});
