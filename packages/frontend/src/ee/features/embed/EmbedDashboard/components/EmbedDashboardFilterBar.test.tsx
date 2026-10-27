import {
    DEFAULT_UI_STRINGS,
    FilterInteractivityValues,
    FilterOperator,
    type Dashboard,
    type InteractivityOptions,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import { type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardContext from '../../../../../providers/Dashboard/context';
import { type DashboardContextType } from '../../../../../providers/Dashboard/types';
import { createDashboardTestStore } from '../../../../../testing/dashboardStore';
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
        FilterPills: ({
            triggerClassName,
            dropdownClassName,
        }: {
            triggerClassName?: string;
            dropdownClassName?: string;
        }) => {
            const isFirstLoad = useContextSelector(
                DashboardContext,
                (c) => c?.isLoadingDashboardFilters === true,
            );
            return (
                <div
                    data-testid="rail-pills"
                    className={triggerClassName}
                    data-dropdown-class={dropdownClassName}
                    data-skeletons={isFirstLoad || undefined}
                />
            );
        },
    };
});
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

const barElement = (
    canAddFilters: boolean,
    isControlsEnabled: boolean,
): ReactElement => (
    // The page's provider, which the bar's filter area reads below it
    <DashboardContext.Provider
        value={mockDashboardContext.current as unknown as DashboardContextType}
    >
        {/* One saved filter, so the bar has something to show */}
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
