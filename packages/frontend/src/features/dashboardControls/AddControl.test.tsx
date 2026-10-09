import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { AddControl } from './AddControl';

const mockSidebar = vi.hoisted(() => ({
    current: { isSidebarOpen: false, openNew: vi.fn() },
}));
const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
const mockTileStatus = vi.hoisted(() => ({
    current: { sqlChartTilesMetadata: {} } as Record<string, unknown>,
}));
const mockTrack = vi.hoisted(() => vi.fn());
const noFilters = { dimensions: [], metrics: [], tableCalculations: [] };

vi.mock('./useControlsSidebar', () => ({
    useControlsSidebarSelector: (
        selector: (value: typeof mockSidebar.current) => unknown,
    ) => selector(mockSidebar.current),
}));
vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector) => selector(mockDashboardContext.current)),
}));
vi.mock('../../providers/Dashboard/useDashboardTileStatusContext', () => ({
    default: vi.fn((selector) => selector(mockTileStatus.current)),
}));
vi.mock('../../providers/Tracking/useTracking', () => ({
    default: () => ({ track: mockTrack }),
}));

describe('AddControl', () => {
    const add = () => screen.getByRole('button', { name: 'Add filter' });
    const setIsAddFilterDisabled = vi.fn();
    const visibilityToggle = () =>
        screen.getByRole('button', {
            name: 'Toggle filter visibility for viewers',
        });

    beforeEach(() => {
        mockTrack.mockClear();
        setIsAddFilterDisabled.mockClear();
        mockSidebar.current = { isSidebarOpen: false, openNew: vi.fn() };
        mockTileStatus.current = { sqlChartTilesMetadata: {} };
        mockDashboardContext.current = {
            allFilterableFields: [],
            isLoadingDashboardFilters: false,
            isFetchingDashboardFilters: false,
            isAddFilterDisabled: false,
            setIsAddFilterDisabled,
            haveFiltersChanged: false,
            dashboardTemporaryFilters: noFilters,
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

    it('hides "Add filter" from viewers with the eye next to it', async () => {
        renderWithProviders(<AddControl />);

        expect(
            visibilityToggle().querySelector('.tabler-icon-eye'),
        ).not.toBeNull();
        fireEvent.mouseEnter(visibilityToggle());
        expect(
            await screen.findByText('Visible to viewers. Click to hide.'),
        ).toBeInTheDocument();

        fireEvent.click(visibilityToggle());
        expect(setIsAddFilterDisabled).toHaveBeenCalledWith(true);
    });

    it('shows "Add filter" to viewers again, also while the sidebar is open', async () => {
        mockSidebar.current.isSidebarOpen = true;
        mockDashboardContext.current.isAddFilterDisabled = true;
        renderWithProviders(<AddControl />);

        expect(
            visibilityToggle().querySelector('.tabler-icon-eye-off'),
        ).not.toBeNull();
        fireEvent.mouseEnter(visibilityToggle());
        expect(
            await screen.findByText('Hidden from viewers. Click to show.'),
        ).toBeInTheDocument();

        fireEvent.click(visibilityToggle());
        expect(setIsAddFilterDisabled).toHaveBeenCalledWith(false);
    });

    it.each([false, true])(
        'is enabled and opens a new control when the sidebar open state is %s',
        (isSidebarOpen) => {
            mockSidebar.current.isSidebarOpen = isSidebarOpen;
            renderWithProviders(<AddControl />);
            expect(add()).toBeEnabled();
            fireEvent.click(add());
            expect(mockSidebar.current.openNew).toHaveBeenCalledTimes(1);
        },
    );

    it('opens a new control on click and leaves tracking to the provider', () => {
        renderWithProviders(<AddControl />);

        fireEvent.click(add());

        expect(mockTrack).not.toHaveBeenCalled();
    });

    it('is disabled until the filterable fields are available', () => {
        mockDashboardContext.current.allFilterableFields = undefined;
        renderWithProviders(<AddControl />);

        expect(add()).toBeDisabled();
        fireEvent.click(add());
        expect(mockSidebar.current.openNew).not.toHaveBeenCalled();
        expect(mockTrack).not.toHaveBeenCalled();
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
