import {
    DashboardTileTypes,
    DimensionType,
    FieldType,
    FilterOperator,
    UnitOfTime,
    type DashboardFilterRule,
    type DashboardFilterableField,
    type DashboardTile,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import ActiveFilters from './index';

vi.mock('../../../providers/Dashboard/useDashboardTileStatusContext', () => ({
    default: vi.fn((selector: (context: Record<string, unknown>) => unknown) =>
        selector({ sqlChartTilesMetadata: {} }),
    ),
}));

const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));

vi.mock('../../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector: (context: Record<string, unknown>) => unknown) =>
        selector(mockDashboardContext.current),
    ),
}));

vi.mock('../../../components/common/Filters/useFiltersContext', () => ({
    default: vi.fn(() => ({
        projectUuid: 'project-uuid',
        getAutocompleteFilterGroup: vi.fn(() => undefined),
        getField: vi.fn(() => undefined),
        parameterValues: {},
    })),
}));

vi.mock('../../../hooks/useFieldValues', () => ({
    MAX_AUTOCOMPLETE_RESULTS: 100,
    useFieldValues: vi.fn(() => ({
        isInitialLoading: false,
        results: [],
        refreshedAt: new Date(),
        refetch: vi.fn(),
        reset: vi.fn(),
        error: null,
        isError: false,
    })),
}));

vi.mock('../../../hooks/health/useHealth', () => ({
    default: vi.fn(() => ({ data: { hasCacheAutocompleResults: false } })),
}));

const visibleField = {
    name: 'status',
    table: 'orders',
    tableLabel: 'Orders',
    label: 'Status',
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    sql: 'status',
    hidden: false,
} as unknown as DashboardFilterableField;

const tile: DashboardTile = {
    uuid: 'tile-1',
    type: DashboardTileTypes.SAVED_CHART,
    x: 0,
    y: 0,
    h: 1,
    w: 1,
    tabUuid: undefined,
    properties: { savedChartUuid: 'chart-1', title: 'Orders over time' },
} as DashboardTile;

const hiddenDateRule: DashboardFilterRule = {
    id: 'hidden-date',
    target: { fieldId: 'orders_signup_date', tableName: 'orders' },
    operator: FilterOperator.IN_THE_PAST,
    values: [7],
    settings: { unitOfTime: UnitOfTime.days, completed: false },
    label: 'Signup date',
    disabled: false,
};

const deletedRule: DashboardFilterRule = {
    id: 'deleted',
    target: { fieldId: 'orders_removed_column', tableName: 'orders' },
    operator: FilterOperator.EQUALS,
    values: ['eu'],
    label: 'Removed column',
    disabled: false,
};

const visibleRule: DashboardFilterRule = {
    id: 'visible',
    target: { fieldId: 'orders_status', tableName: 'orders' },
    operator: FilterOperator.EQUALS,
    values: ['completed'],
    label: 'Status',
    disabled: false,
};

const setContext = (
    dimensions: DashboardFilterRule[],
    savedFilterFieldsByTileUuid: Record<
        string,
        { fieldId: string; fallbackType: DimensionType }[]
    >,
) => {
    mockDashboardContext.current = {
        dashboard: { uuid: 'dashboard-uuid', filters: { dimensions } },
        dashboardTiles: [tile],
        dashboardFilters: { dimensions, metrics: [], tableCalculations: [] },
        dashboardTemporaryFilters: { dimensions: [], metrics: [] },
        dashboardTabs: [],
        activeTab: undefined,
        allFilterableFields: [visibleField],
        allFilterableFieldsMap: { orders_status: visibleField },
        allFilterableMetricsMap: {},
        filterableFieldsByTileUuid: { 'tile-1': [visibleField] },
        savedFilterFieldsByTileUuid,
        unmetFilterRequirements: [],
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

const renderActiveFilters = (isEditMode = false, onPopoverOpen = vi.fn()) =>
    renderWithProviders(
        <ActiveFilters
            isEditMode={isEditMode}
            activeTabUuid={undefined}
            openPopoverId={undefined}
            onPopoverOpen={onPopoverOpen}
            onPopoverClose={vi.fn()}
        />,
    );

const clickChip = async (container: HTMLElement) => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await user.click(
        container.querySelector(
            '[data-dashboard-filter-control]',
        ) as HTMLElement,
    );
};

const hiddenDateStatus = {
    'tile-1': [
        {
            fieldId: 'orders_signup_date',
            fallbackType: DimensionType.DATE,
        },
    ],
};

describe('ActiveFilters with a dimension the model hides', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders a real chip, not the invalid-filter fallback', () => {
        setContext([hiddenDateRule], hiddenDateStatus);
        renderActiveFilters();

        expect(screen.getByText('Signup date')).toBeVisible();
        expect(screen.queryByText('Invalid filter')).not.toBeInTheDocument();
    });

    it('keeps the date unit, which a string fallback would drop', () => {
        setContext([hiddenDateRule], hiddenDateStatus);
        const { container } = renderActiveFilters();

        expect(container.textContent).toContain('in the last');
        expect(container.textContent).toContain('7 days');
    });

    it('does not grey the chip out as applying to nothing', () => {
        setContext([hiddenDateRule], hiddenDateStatus);
        const { container } = renderActiveFilters();

        expect(
            container.querySelector('[data-dashboard-filter-control]')
                ?.className,
        ).not.toMatch(/inactiveFilter/);
    });

    it('still greys out a hidden field every tile excludes', () => {
        setContext(
            [{ ...hiddenDateRule, tileTargets: { 'tile-1': false } }],
            hiddenDateStatus,
        );
        const { container } = renderActiveFilters();

        expect(
            container.querySelector('[data-dashboard-filter-control]')
                ?.className,
        ).toMatch(/inactiveFilter/);
    });

    it('explains the greyed-out state on hover', async () => {
        const user = userEvent.setup({ pointerEventsCheck: 0 });
        setContext(
            [{ ...hiddenDateRule, tileTargets: { 'tile-1': false } }],
            hiddenDateStatus,
        );
        const { container } = renderActiveFilters();

        await user.hover(
            container.querySelector(
                '[data-dashboard-filter-control]',
            ) as HTMLElement,
        );

        expect(await screen.findByRole('tooltip')).toHaveTextContent(
            'This filter is not applied to any tiles',
        );
    });

    it('still shows a genuinely deleted field as invalid', () => {
        setContext([deletedRule], hiddenDateStatus);
        renderActiveFilters();

        expect(screen.getByText('Invalid filter')).toBeVisible();
    });

    it('falls back to invalid when the server sends no status at all', () => {
        setContext([hiddenDateRule], {});
        renderActiveFilters();

        expect(screen.getByText('Invalid filter')).toBeVisible();
    });

    it('leaves a visible dimension rendering exactly as before', () => {
        setContext([visibleRule], hiddenDateStatus);
        const { container } = renderActiveFilters();

        expect(screen.getByText(/Status/)).toBeVisible();
        expect(container.textContent).toContain('completed');
        expect(screen.queryByText('Invalid filter')).not.toBeInTheDocument();
    });

    it('lets the reader open configuration for it', async () => {
        const onPopoverOpen = vi.fn();
        setContext([hiddenDateRule], hiddenDateStatus);
        const { container } = renderActiveFilters(true, onPopoverOpen);

        await clickChip(container);

        expect(onPopoverOpen).toHaveBeenCalledTimes(1);
    });

    it('will not open configuration when two explores disagree on the type', async () => {
        const onPopoverOpen = vi.fn();
        setContext([hiddenDateRule], {
            'tile-1': [
                {
                    fieldId: 'orders_signup_date',
                    fallbackType: DimensionType.DATE,
                },
            ],
            'tile-2': [
                {
                    fieldId: 'orders_signup_date',
                    fallbackType: DimensionType.STRING,
                },
            ],
        });
        const { container } = renderActiveFilters(true, onPopoverOpen);

        expect(screen.getByText('Signup date')).toBeVisible();

        await clickChip(container);

        expect(onPopoverOpen).not.toHaveBeenCalled();
    });

    it('offers no configuration at all for a deleted field', async () => {
        const onPopoverOpen = vi.fn();
        setContext([deletedRule], hiddenDateStatus);
        const { container } = renderActiveFilters(true, onPopoverOpen);

        await clickChip(container);

        expect(onPopoverOpen).not.toHaveBeenCalled();
    });
});
