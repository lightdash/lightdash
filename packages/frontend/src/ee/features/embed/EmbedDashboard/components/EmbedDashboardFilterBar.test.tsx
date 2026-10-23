import {
    DEFAULT_UI_STRINGS,
    FilterInteractivityValues,
    FilterOperator,
    type Dashboard,
    type InteractivityOptions,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDashboardTestStore } from '../../../../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../../../../testing/DashboardStoreTestProvider';
import { renderWithProviders } from '../../../../../testing/testUtils';
import EmbedDashboardFilterBar from './EmbedDashboardFilterBar';

vi.mock('../../../../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector: (context: Record<string, unknown>) => unknown) =>
        selector({}),
    ),
}));

const mockSidebar = vi.hoisted(() => ({ current: { isRailOpen: false } }));

vi.mock('../../../../../features/dashboardControls/useControlsSidebar', () => ({
    useControlsSidebarSelector: (
        selector: (value: { isRailOpen: boolean }) => unknown,
    ) => selector(mockSidebar.current),
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
vi.mock('../../../../../features/dashboardControls/FilterPills', () => ({
    FilterPills: ({
        triggerClassName,
        dropdownClassName,
    }: {
        triggerClassName?: string;
        dropdownClassName?: string;
    }) => (
        <div
            data-testid="rail-pills"
            className={triggerClassName}
            data-dropdown-class={dropdownClassName}
        />
    ),
}));
vi.mock('../../../../../features/dashboardControls/EditingStrip', () => ({
    EditingStrip: () => <div data-testid="editing-strip" />,
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

const renderBar = (canAddFilters: boolean, isControlsEnabled: boolean) =>
    renderWithProviders(
        // One saved filter, so the bar has something to show
        <DashboardStoreTestProvider
            store={createDashboardTestStore({
                dashboardFilters: {
                    dimensions: [
                        {
                            id: 'saved',
                            label: undefined,
                            operator: FilterOperator.EQUALS,
                            target: {
                                fieldId: 'orders_status',
                                tableName: 'orders',
                            },
                            values: ['done'],
                        },
                    ],
                    metrics: [],
                    tableCalculations: [],
                },
            })}
        >
            <EmbedDashboardFilterBar
                dashboard={dashboard(canAddFilters)}
                shouldShowFilters
                activeTiles={[]}
                isControlsEnabled={isControlsEnabled}
            />
        </DashboardStoreTestProvider>,
    );

describe('EmbedDashboardFilterBar', () => {
    beforeEach(() => {
        mockSidebar.current = { isRailOpen: false };
    });

    it('keeps the shipped filters while the rail is off', () => {
        renderBar(true, false);
        expect(screen.getByTestId('shipped-filters')).toBeInTheDocument();
        expect(screen.queryByTestId('rail-pills')).not.toBeInTheDocument();
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
        // A saved pill's shipped popover carries the dropdown class
        expect(screen.getByTestId('rail-pills')).toHaveAttribute(
            'data-dropdown-class',
            'ld-dashboard-filter-dropdown',
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

    it('says what is being edited while the rail is open', () => {
        mockSidebar.current = { isRailOpen: true };
        renderBar(true, true);
        expect(screen.getByTestId('editing-strip')).toBeInTheDocument();
        expect(screen.queryByTestId('rail-pills')).not.toBeInTheDocument();
    });
});
