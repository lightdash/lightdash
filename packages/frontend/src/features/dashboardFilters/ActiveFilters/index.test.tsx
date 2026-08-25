import {
    DashboardTileTypes,
    FieldType,
    FilterOperator,
    MetricType,
    type DashboardFilterRule,
    type DashboardFilterableField,
    type DashboardTile,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import ActiveFilters from './index';

const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));

vi.mock('../../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector: (context: Record<string, unknown>) => unknown) =>
        selector(mockDashboardContext.current),
    ),
}));

vi.mock('./Filter', () => ({
    default: ({ filterRule }: { filterRule: DashboardFilterRule }) => (
        <div data-testid={`filter-${filterRule.id}`}>{filterRule.label}</div>
    ),
}));

const metricField = {
    name: 'total_revenue',
    table: 'orders',
    tableLabel: 'Orders',
    label: 'Total revenue',
    fieldType: FieldType.METRIC,
    type: MetricType.SUM,
    sql: '${TABLE}.revenue',
    hidden: false,
} as DashboardFilterableField;

const metricFilter: DashboardFilterRule = {
    id: 'metric-filter',
    target: {
        fieldId: 'orders_total_revenue',
        tableName: 'orders',
    },
    operator: FilterOperator.GREATER_THAN,
    values: [0],
    label: 'Total revenue',
    tileTargets: {
        'tile-1': {
            fieldId: 'orders_total_revenue',
            tableName: 'orders',
        },
        'tile-2': false,
    },
};

const dashboardTiles = [
    {
        uuid: 'tile-1',
        type: DashboardTileTypes.SAVED_CHART,
        x: 0,
        y: 0,
        h: 1,
        w: 1,
        tabUuid: 'tab-1',
        properties: {
            savedChartUuid: 'chart-1',
            title: 'Chart 1',
        },
    },
    {
        uuid: 'tile-2',
        type: DashboardTileTypes.SAVED_CHART,
        x: 0,
        y: 0,
        h: 1,
        w: 1,
        tabUuid: 'tab-2',
        properties: {
            savedChartUuid: 'chart-2',
            title: 'Chart 2',
        },
    },
] satisfies DashboardTile[];

const setMetricFilterLocation = (location: 'saved' | 'temporary') => {
    mockDashboardContext.current = {
        dashboardTiles,
        dashboardFilters: {
            dimensions: [],
            metrics: location === 'saved' ? [metricFilter] : [],
            tableCalculations: [],
        },
        dashboardTemporaryFilters: {
            dimensions: [],
            metrics: location === 'temporary' ? [metricFilter] : [],
        },
        dashboardTabs: [
            { uuid: 'tab-1', name: 'Tab 1', order: 0 },
            { uuid: 'tab-2', name: 'Tab 2', order: 1 },
        ],
        allFilterableFieldsMap: {},
        allFilterableMetricsMap: {
            orders_total_revenue: metricField,
        },
        filterableFieldsByTileUuid: {
            'tile-1': [metricField],
            'tile-2': [metricField],
        },
        isLoadingDashboardFilters: false,
        isFetchingDashboardFilters: false,
        removeDimensionDashboardFilter: vi.fn(),
        updateDimensionDashboardFilter: vi.fn(),
        removeMetricDashboardFilter: vi.fn(),
        updateMetricDashboardFilter: vi.fn(),
        setDashboardFilters: vi.fn(),
        setHaveFiltersChanged: vi.fn(),
    };
};

const renderActiveFilters = (activeTabUuid: string) =>
    renderWithProviders(
        <ActiveFilters
            isEditMode={false}
            activeTabUuid={activeTabUuid}
            openPopoverId={undefined}
            onPopoverOpen={vi.fn()}
            onPopoverClose={vi.fn()}
        />,
    );

describe('ActiveFilters metric tab visibility', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it.each(['saved', 'temporary'] as const)(
        'shows a %s metric filter only on a targeted tab',
        (location) => {
            setMetricFilterLocation(location);
            const { rerender } = renderActiveFilters('tab-1');

            expect(screen.getByTestId('filter-metric-filter')).toBeVisible();

            rerender(
                <ActiveFilters
                    isEditMode={false}
                    activeTabUuid="tab-2"
                    openPopoverId={undefined}
                    onPopoverOpen={vi.fn()}
                    onPopoverClose={vi.fn()}
                />,
            );

            expect(
                screen.queryByTestId('filter-metric-filter'),
            ).not.toBeInTheDocument();
        },
    );
});
