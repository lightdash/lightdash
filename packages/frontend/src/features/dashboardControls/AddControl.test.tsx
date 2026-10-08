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
    const add = () =>
        screen.getByRole('button', { name: 'Add filter or parameter' });

    beforeEach(() => {
        mockTrack.mockClear();
        mockSidebar.current = { isSidebarOpen: false, openNew: vi.fn() };
        mockTileStatus.current = { sqlChartTilesMetadata: {} };
        mockDashboardContext.current = {
            allFilterableFields: [],
            isLoadingDashboardFilters: false,
            isFetchingDashboardFilters: false,
        };
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
