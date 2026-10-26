import { FilterOperator, type DashboardFilters } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type SqlChartTileMetadata } from '../../providers/Dashboard/types';
import {
    createDashboardTestStore,
    type DashboardEditTestValues,
    seedDashboardEditState,
} from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import { renderWithProviders as renderWithAppProviders } from '../../testing/testUtils';
import { AddControl } from './AddControl';

const mockSidebar = vi.hoisted(() => ({
    current: {
        isSidebarOpen: false,
        isViewer: false,
        canAddFilters: true,
        isNew: false,
        isPlaceholder: false,
        openNew: vi.fn(),
    },
}));
const mockFilters = vi.hoisted(() => ({
    current: undefined as DashboardFilters | undefined,
}));
const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
const mockTileStatus = vi.hoisted(() => ({
    current: { sqlChartTilesMetadata: {} } as Record<string, unknown>,
}));
const renderWithProviders = (ui: ReactElement) =>
    renderWithAppProviders(
        <DashboardStoreTestProvider
            store={seedDashboardEditState(
                createDashboardTestStore({
                    haveFiltersChanged: false,
                    dashboardFilters: mockFilters.current,
                    sqlChartTilesMetadata: mockTileStatus.current
                        .sqlChartTilesMetadata as Record<
                        string,
                        SqlChartTileMetadata
                    >,
                }),
                mockDashboardContext.current as DashboardEditTestValues,
            )}
        >
            {ui}
        </DashboardStoreTestProvider>,
    );

vi.mock('./useControlsSidebar', () => ({
    useControlsSidebarSelector: (
        selector: (value: typeof mockSidebar.current) => unknown,
    ) => selector(mockSidebar.current),
}));
vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector) => selector(mockDashboardContext.current)),
}));

describe('AddControl', () => {
    const add = () => screen.getByRole('button', { name: 'Add filter' });
    const setIsAddFilterDisabled = vi.fn();

    beforeEach(() => {
        setIsAddFilterDisabled.mockClear();
        mockSidebar.current = {
            isSidebarOpen: false,
            isViewer: false,
            canAddFilters: true,
            isNew: false,
            isPlaceholder: false,
            openNew: vi.fn(),
        };
        mockFilters.current = undefined;
        mockTileStatus.current = { sqlChartTilesMetadata: {} };
        mockDashboardContext.current = {
            allFilterableFields: [],
            isLoadingDashboardFilters: false,
            isFetchingDashboardFilters: false,
            isAddFilterDisabled: false,
            setIsAddFilterDisabled,
        };
    });

    it('is the shipped button, found by the attributes focus returns to', () => {
        const { container } = renderWithProviders(<AddControl />);

        expect(
            container.querySelector(
                '[data-filter-actions] > button[data-dashboard-filter-control]',
            ),
        ).toBe(add());
    });

    it('opens no popover of its own', () => {
        renderWithProviders(<AddControl />);

        fireEvent.click(add());

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('is "Add filter" with the shipped eye, which hides it from viewers, and opens a new one', () => {
        mockFilters.current = {
            dimensions: [
                {
                    id: 'saved',
                    label: undefined,
                    operator: FilterOperator.EQUALS,
                    target: { fieldId: 'orders_status', tableName: 'orders' },
                    values: ['done'],
                },
            ],
            metrics: [],
            tableCalculations: [],
        };
        renderWithProviders(<AddControl />);
        expect(add().querySelector('svg')).toBeNull();
        fireEvent.click(
            screen.getByRole('button', {
                name: 'Toggle filter visibility for viewers',
            }),
        );
        expect(setIsAddFilterDisabled).toHaveBeenCalledWith(true);
        fireEvent.click(add());
        expect(mockSidebar.current.openNew).toHaveBeenCalledTimes(1);
    });

    describe('for a viewer', () => {
        beforeEach(() => {
            mockSidebar.current.isViewer = true;
        });

        it('is the shipped view mode button on the bar: no eye, opens the rail', () => {
            renderWithProviders(<AddControl />);
            expect(
                screen.queryByRole('button', {
                    name: 'Toggle filter visibility for viewers',
                }),
            ).not.toBeInTheDocument();
            fireEvent.click(add());
            expect(mockSidebar.current.openNew).toHaveBeenCalledTimes(1);
        });

        it('shows the tooltip it is given, as an embed passes it', async () => {
            renderWithProviders(
                <AddControl unsavedFiltersTooltip="Filters you add reset on reload" />,
            );
            fireEvent.mouseEnter(add());
            expect(
                await screen.findByText('Filters you add reset on reload'),
            ).toBeInTheDocument();
        });

        it('is gone while the editor hides it from viewers', () => {
            mockDashboardContext.current.isAddFilterDisabled = true;
            renderWithProviders(<AddControl />);
            expect(
                screen.queryByRole('button', { name: 'Add filter' }),
            ).not.toBeInTheDocument();
        });
    });

    it.each([false, true])(
        'is inert while a filter is edited, for a viewer too (%s)',
        (isViewer) => {
            mockSidebar.current.isViewer = isViewer;
            const { rerender } = renderWithProviders(<AddControl />);
            expect(add().closest('[inert]')).toBeNull();

            mockSidebar.current.isSidebarOpen = true;
            rerender(
                <DashboardStoreTestProvider store={createDashboardTestStore()}>
                    <AddControl />
                </DashboardStoreTestProvider>,
            );
            expect(add().closest('[inert]')).not.toBeNull();
        },
    );

    it('is disabled until the filterable fields are available', () => {
        mockDashboardContext.current.allFilterableFields = undefined;
        renderWithProviders(<AddControl />);

        expect(add()).toBeDisabled();
        fireEvent.click(add());
        expect(mockSidebar.current.openNew).not.toHaveBeenCalled();
    });

    it('stays enabled without fields when a SQL chart tile reported columns', () => {
        mockDashboardContext.current.allFilterableFields = undefined;
        mockTileStatus.current = {
            sqlChartTilesMetadata: { 'tile-1': { columns: [] } },
        };
        renderWithProviders(<AddControl />);

        expect(add()).toBeEnabled();
    });

    it.each(['isLoadingDashboardFilters', 'isFetchingDashboardFilters'])(
        'shows a loader and opens nothing while %s',
        (flag) => {
            mockDashboardContext.current[flag] = true;
            renderWithProviders(<AddControl />);

            expect(add()).toHaveAttribute('data-loading', 'true');
            fireEvent.click(add());
            expect(mockSidebar.current.openNew).not.toHaveBeenCalled();
        },
    );
});
