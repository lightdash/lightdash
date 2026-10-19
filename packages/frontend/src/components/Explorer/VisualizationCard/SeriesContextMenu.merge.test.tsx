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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { type EchartsSeriesClickEvent } from '../../SimpleChart';
import { SeriesContextMenu } from './SeriesContextMenu';

const { resolve } = vi.hoisted(() => ({ resolve: vi.fn() }));

vi.mock('../../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project',
}));
vi.mock('../../../hooks/user/useAccount', () => ({
    useAccount: () => ({ data: undefined }),
}));
vi.mock('../../../providers/Ability', () => ({
    Can: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../../../features/mergeQuery/context/useMerge', () => ({
    useMergeSafe: () => ({ mergeResults: { fieldOrigins: {} } }),
}));
vi.mock('../../../features/mergeQuery/hooks/useMergeSourceCell', () => ({
    useMergeSourceCell: () => ({ resolve }),
}));
vi.mock('../../LightdashVisualization/useVisualizationContext', () => ({
    useVisualizationContext: () => ({
        resultsData: { metricQuery },
        itemsMap: { merge_merge_ratio: ratio },
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
        item: ratio,
        value: { raw: 3, formatted: '3' },
        fieldValues: { merge_merge_ratio: { raw: 3, formatted: '3' } },
    }),
}));

const ratio: CompiledMetric = {
    fieldType: FieldType.METRIC,
    type: MetricType.NUMBER,
    table: 'merge',
    tableLabel: 'Merged',
    tablesReferences: ['merge'],
    name: 'merge_ratio',
    label: 'Merge ratio',
    sql: '',
    compiledSql: '',
    hidden: false,
};
const metricQuery: MetricQuery = {
    exploreName: 'orders',
    dimensions: [],
    metrics: [],
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
    seriesName: 'Merge ratio',
    name: '',
    dataIndex: 0,
    data: {},
    dataType: '',
    value: 3,
    color: '',
    dimensionNames: ['merge_merge_ratio'],
    event: { event: new MouseEvent('click') },
};

const renderMenu = () =>
    renderWithProviders(
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
        />,
    );

describe('series context menu on a merged chart', () => {
    beforeEach(() => resolve.mockReset());

    it('hides source actions for a column no source owns', async () => {
        resolve.mockReturnValue(null);
        renderMenu();

        expect(await screen.findByText('Copy value')).toBeInTheDocument();
        expect(
            screen.queryByText('View underlying data'),
        ).not.toBeInTheDocument();
        expect(screen.queryByText(/Drill into/)).not.toBeInTheDocument();
    });

    it('keeps source actions for a column a source owns', async () => {
        resolve.mockReturnValue({ item: ratio, fieldValues: {} });
        renderMenu();

        expect(
            await screen.findByText('View underlying data'),
        ).toBeInTheDocument();
        expect(screen.getByText(/Drill into/)).toBeInTheDocument();
    });
});
