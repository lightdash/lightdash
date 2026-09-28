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

describe('ActiveFilters saved filter on a hidden field', () => {
    const hiddenFieldFilter: DashboardFilterRule = {
        id: 'hidden-filter',
        target: { fieldId: 'orders_status', tableName: 'orders' },
        operator: FilterOperator.EQUALS,
        values: ['completed'],
        label: undefined,
    };

    const setHiddenFieldContext = (hiddenFieldIds: string[]) => {
        setMetricFilterLocation('saved');
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            dashboardFilters: {
                dimensions: [hiddenFieldFilter],
                metrics: [],
                tableCalculations: [],
            },
            dashboardTabs: [],
            filterableFieldsByTileUuid: { 'tile-1': [metricField] },
            hiddenFilterableFieldIds: new Set(hiddenFieldIds),
        };
    };

    const renderFilters = (isEditMode: boolean) =>
        renderWithProviders(
            <ActiveFilters
                isEditMode={isEditMode}
                activeTabUuid={undefined}
                openPopoverId={undefined}
                onPopoverOpen={vi.fn()}
                onPopoverClose={vi.fn()}
            />,
        );

    it('shows a locked chip with the rule and no editor for viewers', () => {
        setHiddenFieldContext(['orders_status']);
        renderFilters(false);

        const chip = screen.getByTestId('locked-dashboard-filter');
        expect(chip).toHaveTextContent(/^Orders status\s*is completed$/);
        expect(
            screen.queryByRole('button', { name: 'Remove filter' }),
        ).not.toBeInTheDocument();
        expect(screen.queryByText('Invalid filter')).not.toBeInTheDocument();
    });

    it('shows a valueless locked filter as any value', () => {
        setHiddenFieldContext(['orders_status']);
        mockDashboardContext.current.dashboardFilters = {
            dimensions: [{ ...hiddenFieldFilter, values: [], disabled: true }],
            metrics: [],
            tableCalculations: [],
        };
        renderFilters(false);

        expect(screen.getByTestId('locked-dashboard-filter')).toHaveTextContent(
            /^Orders status\s*is any value$/,
        );
    });

    it('keeps a filter on a deleted field invalid', () => {
        setHiddenFieldContext([]);
        renderFilters(false);

        expect(screen.getByText('Invalid filter')).toBeInTheDocument();
        expect(
            screen.queryByTestId('locked-dashboard-filter'),
        ).not.toBeInTheDocument();
    });

    it('lets editors remove the locked filter', () => {
        setHiddenFieldContext(['orders_status']);
        renderFilters(true);

        screen.getByRole('button', { name: 'Remove filter' }).click();

        expect(
            mockDashboardContext.current.removeDimensionDashboardFilter,
        ).toHaveBeenCalledWith(0, false);
    });
});
