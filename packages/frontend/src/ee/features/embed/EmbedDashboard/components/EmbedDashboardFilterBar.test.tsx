import {
    DEFAULT_UI_STRINGS,
    FilterInteractivityValues,
    FilterOperator,
    type Dashboard,
    type InteractivityOptions,
} from '@lightdash/common';
import { screen, within } from '@testing-library/react';
import { type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardContext from '../../../../../providers/Dashboard/context';
import { type DashboardContextType } from '../../../../../providers/Dashboard/types';
import {
    createDashboardTestStore,
    seedDashboardEditState,
} from '../../../../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../../../../testing/DashboardStoreTestProvider';
import { renderWithProviders } from '../../../../../testing/testUtils';
import EmbedDashboardFilterBar from './EmbedDashboardFilterBar';

const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
vi.mock('../../../../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector: (context: Record<string, unknown>) => unknown) =>
        selector(mockDashboardContext.current),
    ),
}));

vi.mock('../../../../../features/dashboardControls/AddControl', () => ({
    AddControl: ({
        triggerClassName,
        unsavedFiltersTooltip,
    }: {
        triggerClassName?: string;
        unsavedFiltersTooltip?: string;
    }) => (
        <button
            type="button"
            className={triggerClassName}
            data-tooltip={unsavedFiltersTooltip}
        >
            Rail add
        </button>
    ),
}));
// Reads the context the bar provides, as the real pills do: skeletons on a first load
vi.mock('../../../../../features/dashboardControls/FilterPills', async () => {
    const { useContextSelector } = await import('use-context-selector');
    const { default: DashboardContext } =
        await import('../../../../../providers/Dashboard/context');
    return {
        FilterPills: ({ triggerClassName }: { triggerClassName?: string }) => {
            const isFirstLoad = useContextSelector(
                DashboardContext,
                (c) => c?.isLoadingDashboardFilters === true,
            );
            return (
                <div
                    data-testid="rail-pills"
                    className={triggerClassName}
                    data-skeletons={isFirstLoad || undefined}
                />
            );
        },
    };
});
vi.mock('../../../../../features/dashboardControls/SectionedFilters', () => ({
    SectionedFilters: ({
        viewerActions,
        triggerClassName,
    }: {
        viewerActions: ReactNode;
        triggerClassName?: string;
    }) => (
        <div data-testid="sectioned-filters" className={triggerClassName}>
            {viewerActions}
        </div>
    ),
}));
// Reads the rail's provider, which the page puts around the bar
vi.mock('../../../../../features/dashboardControls/ControlsBar', () => ({
    MappingSwap: ({ children }: { children: ReactNode }) => (
        <div data-testid="mapping-swap">{children}</div>
    ),
}));
vi.mock('./EmbedDashboardFilters', () => ({
    default: () => <div data-testid="shipped-filters" />,
    EmbedResetFiltersButton: () => <button type="button">Reset</button>,
}));
vi.mock('../../../../../features/dateZoom', () => ({
    DateZoom: () => null,
}));

const dashboard = (canAddFilters: boolean) =>
    ({
        uuid: 'dashboard-1',
        canDateZoom: false,
        dashboardFiltersInteractivity: {
            enabled: FilterInteractivityValues.all,
            canAddFilters,
        },
        parameterInteractivity: { enabled: false },
    }) as unknown as Dashboard & InteractivityOptions;

const savedRule = {
    id: 'saved',
    label: undefined,
    operator: FilterOperator.EQUALS,
    target: { fieldId: 'orders_status', tableName: 'orders' },
    values: ['done'],
};

const sectionedStore = () => {
    const store = createDashboardTestStore({
        dashboardFilters: {
            dimensions: [{ ...savedRule, sectionId: 'a' }],
            metrics: [],
            tableCalculations: [],
        },
    });
    seedDashboardEditState(store, {
        dashboard: {
            config: {
                isDateZoomDisabled: false,
                controlSections: [{ id: 'a', name: 'Dates' }],
            },
        },
    });
    return store;
};

const barElement = (
    canAddFilters: boolean,
    isControlsEnabled: boolean,
    store = createDashboardTestStore({
        dashboardFilters: {
            dimensions: [savedRule],
            metrics: [],
            tableCalculations: [],
        },
    }),
): ReactElement => (
    // The page's provider, which the bar's filter area reads below it
    <DashboardContext.Provider
        value={mockDashboardContext.current as unknown as DashboardContextType}
    >
        {/* One saved filter, so the bar has something to show */}
        <DashboardStoreTestProvider store={store}>
            <EmbedDashboardFilterBar
                dashboard={dashboard(canAddFilters)}
                shouldShowFilters
                activeTiles={[]}
                isControlsEnabled={isControlsEnabled}
            />
        </DashboardStoreTestProvider>
    </DashboardContext.Provider>
);

const renderBar = (canAddFilters: boolean, isControlsEnabled: boolean) =>
    renderWithProviders(barElement(canAddFilters, isControlsEnabled));

describe('EmbedDashboardFilterBar', () => {
    beforeEach(() => {
        mockDashboardContext.current = {};
    });

    it('keeps the shipped filters while the rail is off', () => {
        renderBar(true, false);
        expect(screen.getByTestId('shipped-filters')).toBeInTheDocument();
        expect(screen.queryByTestId('rail-pills')).not.toBeInTheDocument();
        expect(screen.queryByTestId('mapping-swap')).not.toBeInTheDocument();
    });

    it("gives the rail's bar the mapping row's place, so a viewer can choose tiles", () => {
        renderBar(true, true);
        expect(
            within(screen.getByTestId('mapping-swap')).getByTestId(
                'rail-pills',
            ),
        ).toBeInTheDocument();
    });

    it('opens the rail from "Add filter" and the pills, with the class contract', () => {
        renderBar(true, true);
        expect(screen.queryByTestId('shipped-filters')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Rail add' })).toHaveClass(
            'ld-dashboard-add-filter',
        );
        expect(
            screen.getByRole('button', { name: 'Rail add' }),
        ).toHaveAttribute(
            'data-tooltip',
            DEFAULT_UI_STRINGS['filters.unsavedFiltersTooltip'],
        );
        expect(screen.getByTestId('rail-pills')).toHaveClass(
            'ld-dashboard-filter',
        );
        expect(
            screen.queryByRole('button', { name: 'Reset' }),
        ).not.toBeInTheDocument();
    });

    it('offers only the reset where viewers may not add filters', () => {
        renderBar(false, true);
        expect(
            screen.getByRole('button', { name: 'Reset' }),
        ).toBeInTheDocument();
    });

    it("shows a dashboard's sections as the app's viewer bar, with the class contract", () => {
        renderWithProviders(barElement(false, true, sectionedStore()));
        const sectioned = screen.getByTestId('sectioned-filters');
        expect(sectioned).toHaveClass('ld-dashboard-filter');
        // "Add filter" and the reset lead the sectioned bar
        expect(
            within(sectioned).getByRole('button', { name: 'Rail add' }),
        ).toHaveClass('ld-dashboard-add-filter');
        expect(
            within(sectioned).getByRole('button', { name: 'Reset' }),
        ).toBeInTheDocument();
        expect(screen.queryByTestId('rail-pills')).not.toBeInTheDocument();
        // A size container, for the bar's narrow layouts
        expect(sectioned.closest('[class*="filterArea"]')).not.toBeNull();
    });

    it('keeps the shipped filters for a dashboard with sections while the flag is off', () => {
        renderWithProviders(barElement(true, false, sectionedStore()));
        expect(screen.getByTestId('shipped-filters')).toBeInTheDocument();
        expect(
            screen
                .getByTestId('shipped-filters')
                .closest('[class*="filterArea"]'),
        ).toBeNull();
        expect(
            screen.queryByTestId('sectioned-filters'),
        ).not.toBeInTheDocument();
    });

    it('keeps the pills while a tile change reloads the filter fields', () => {
        const loaded = {
            isLoadingDashboardFilters: false,
            isFetchingDashboardFilters: false,
            filterableFieldsByTileUuid: { 'tile-1': [] },
            allFilterableFields: [],
        };
        mockDashboardContext.current = loaded;
        const { rerender } = renderBar(true, true);
        expect(screen.getByTestId('rail-pills')).not.toHaveAttribute(
            'data-skeletons',
        );

        // A tile added or removed is a new query key: a first load again
        mockDashboardContext.current = {
            ...loaded,
            isLoadingDashboardFilters: true,
            isFetchingDashboardFilters: true,
            filterableFieldsByTileUuid: undefined,
            allFilterableFields: undefined,
        };
        rerender(barElement(true, true));
        expect(screen.getByTestId('rail-pills')).not.toHaveAttribute(
            'data-skeletons',
        );
    });
});
