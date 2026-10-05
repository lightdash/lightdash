import {
    DashboardTileTypes,
    FieldType,
    FilterOperator,
    MetricType,
    type DashboardFilterRule,
    type DashboardFilterableField,
    type DashboardTile,
} from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { type FC, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import {
    DashboardControlsContext,
    useDashboardControls,
    type ControlModel,
    type DashboardControlsContextType,
} from '../../dashboardControls/context';
import ControlsBarEnd, {
    ControlsBarStart,
} from '../../dashboardControls/ControlsBarEnd';
import { createFilterDraft } from '../../dashboardControls/filterDraft';
import DashboardFilters from '../index';
import ActiveFilters from './index';

const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));

vi.mock('../../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector: (context: Record<string, unknown>) => unknown) =>
        selector(mockDashboardContext.current),
    ),
}));

vi.mock('../../../providers/Dashboard/useDashboardTileStatusContext', () => ({
    default: vi.fn((selector) => selector({ sqlChartTilesMetadata: {} })),
}));

vi.mock('../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: vi.fn(() => ({ data: undefined })),
}));

vi.mock('../../../hooks/useProjectUuid', () => ({
    useProjectUuid: vi.fn(() => 'project-uuid'),
}));

vi.mock('../../../hooks/useProject', () => ({
    useProject: vi.fn(() => ({ data: undefined })),
}));

vi.mock('../FilterConfiguration', () => ({
    default: () => <div data-testid="filter-configuration" />,
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

describe('view-mode filter bar and the dashboard controls flag', () => {
    const setViewBarContext = (isAddFilterDisabled: boolean) => {
        setMetricFilterLocation('temporary');
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            allFilters: {
                dimensions: [],
                metrics: [metricFilter],
                tableCalculations: [],
            },
            allFilterableFields: [],
            allFilterableMetrics: [metricField],
            parameterValues: {},
            parameterDefinitions: {},
            tileParameterReferences: {},
            isAddFilterDisabled,
            setIsAddFilterDisabled: vi.fn(),
            haveFiltersChanged: false,
            resetDashboardFilters: vi.fn(),
            addDimensionDashboardFilter: vi.fn(),
            addMetricDashboardFilter: vi.fn(),
        };
    };

    // The controls surface as view mode has it with the flag on
    const WithControlsOn: FC<{
        overrides: Partial<DashboardControlsContextType>;
        children: ReactNode;
    }> = ({ overrides, children }) => {
        const off = useDashboardControls();
        return (
            <DashboardControlsContext.Provider
                value={{
                    ...off,
                    isEnabled: true,
                    draftsTemporaryFilters: true,
                    ...overrides,
                }}
            >
                {children}
            </DashboardControlsContext.Provider>
        );
    };

    const bar = <DashboardFilters isEditMode={false} activeTabUuid="tab-1" />;
    // The view-mode bar with the flag on: "Add control", the pills, then what
    // follows them
    const controlsBar = (
        <>
            <ControlsBarStart isEditMode={false} />
            {bar}
            <ControlsBarEnd isEditMode={false} />
        </>
    );

    // A new control's model before anything is chosen
    const emptyModel: ControlModel = {
        noun: 'field',
        isLoading: false,
        overview: {
            rows: [],
            suggestions: [],
            others: [],
            switchedOnTileUuids: [],
            mappedCount: 0,
            mappableCount: 2,
        },
        overviewTiles: [],
        items: {},
        rowLabels: {},
        tileStates: {},
        field: undefined,
        addItem: vi.fn(),
        removeItem: vi.fn(),
        setTileItem: vi.fn(),
        setTileOn: vi.fn(),
        getField: () => undefined,
        isSqlColumn: () => false,
        getTileRunValue: () => null,
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('mounts the old "Add filter" popover with the flag off', async () => {
        setViewBarContext(false);
        renderWithProviders(bar);

        fireEvent.click(screen.getByRole('button', { name: 'Add filter' }));

        expect(
            await screen.findByTestId('filter-configuration'),
        ).toBeInTheDocument();
        expect(screen.queryByText('Control type')).not.toBeInTheDocument();
        expect(screen.queryByText(/^New .* control$/)).not.toBeInTheDocument();
        expect(screen.getByTestId('filter-metric-filter')).toBeVisible();
    });

    it('offers the control types from "Add control" with the flag on', async () => {
        setViewBarContext(false);
        const openNew = vi.fn();
        renderWithProviders(
            <WithControlsOn overrides={{ openNew }}>
                {controlsBar}
            </WithControlsOn>,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Add control' }));

        expect(await screen.findByText('Control type')).toBeInTheDocument();
        expect(
            screen.queryByTestId('filter-configuration'),
        ).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('menuitem', { name: 'Number' }));
        expect(openNew).toHaveBeenCalledWith('number');
    });

    it('shows the placeholder pill of a control drafted while viewing', () => {
        setViewBarContext(false);
        renderWithProviders(
            <WithControlsOn
                overrides={{
                    draft: createFilterDraft('text'),
                    model: emptyModel,
                    // Nothing chosen yet: the pill has no kind to name
                    isChoosing: true,
                }}
            >
                {controlsBar}
            </WithControlsOn>,
        );

        expect(
            screen.getByRole('button', { name: 'New text control' }),
        ).toBeInTheDocument();
    });

    it('keeps the old "Add filter" in edit mode with the flag off', () => {
        setViewBarContext(false);
        renderWithProviders(
            <DashboardFilters isEditMode activeTabUuid="tab-1" />,
        );

        expect(
            screen.getByRole('button', { name: 'Add filter' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', {
                name: 'Toggle filter visibility for viewers',
            }),
        ).toBeInTheDocument();
    });

    it('leaves adding to the bar in edit mode with the flag on', () => {
        setViewBarContext(false);
        renderWithProviders(
            <WithControlsOn overrides={{ draftsTemporaryFilters: false }}>
                <DashboardFilters isEditMode activeTabUuid="tab-1" />
            </WithControlsOn>,
        );

        expect(
            screen.queryByRole('button', { name: 'Add filter' }),
        ).not.toBeInTheDocument();
    });

    it('puts "Add control" before the pills and the reset after them while viewing with the flag on', () => {
        setViewBarContext(false);
        renderWithProviders(
            <WithControlsOn overrides={{}}>{controlsBar}</WithControlsOn>,
        );

        const pill = screen.getByTestId('filter-metric-filter');
        const add = screen.getByRole('button', { name: 'Add control' });
        const reset = screen.getByRole('button', { name: 'Reset all filters' });
        expect(
            add.compareDocumentPosition(pill) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(
            pill.compareDocumentPosition(reset) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(
            screen.queryByRole('button', { name: 'Add filter' }),
        ).not.toBeInTheDocument();

        reset.click();
        expect(
            mockDashboardContext.current.resetDashboardFilters,
        ).toHaveBeenCalled();
    });

    it.each([
        ['off', false],
        ['on', true],
    ])('keeps "Add filter" hidden from viewers with the flag %s', (_, isOn) => {
        setViewBarContext(true);
        renderWithProviders(
            isOn ? (
                <WithControlsOn overrides={{}}>{controlsBar}</WithControlsOn>
            ) : (
                bar
            ),
        );

        expect(
            screen.queryByRole('button', {
                name: isOn ? 'Add control' : 'Add filter',
            }),
        ).not.toBeInTheDocument();
    });
});
