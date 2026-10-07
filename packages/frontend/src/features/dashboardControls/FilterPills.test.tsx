import { FilterOperator, type DashboardFilterRule } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { FilterPills } from './FilterPills';

const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
const mockSidebar = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));

vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector) => selector(mockDashboardContext.current)),
}));

vi.mock('./useControlsSidebar', () => ({
    useControlsSidebar: () => mockSidebar.current,
}));

const savedRule: DashboardFilterRule = {
    id: 'saved',
    label: 'Status',
    operator: FilterOperator.EQUALS,
    target: { fieldId: 'orders_status', tableName: 'orders' },
    values: ['done'],
};

const noDefaultRule: DashboardFilterRule = {
    id: 'no-default',
    label: 'Region',
    operator: FilterOperator.EQUALS,
    target: { fieldId: 'orders_region', tableName: 'orders' },
    values: [],
    disabled: true,
};

describe('FilterPills', () => {
    const open = vi.fn();
    const removeFilterById = vi.fn();
    const setDashboardFilters = vi.fn();
    const setHaveFiltersChanged = vi.fn();
    const filters = {
        dimensions: [savedRule, noDefaultRule],
        metrics: [],
        tableCalculations: [],
    };

    beforeEach(() => {
        open.mockClear();
        removeFilterById.mockClear();
        setDashboardFilters.mockClear();
        setHaveFiltersChanged.mockClear();
        mockDashboardContext.current = {
            dashboard: { uuid: 'dashboard-1' },
            setDashboardFilters,
            setHaveFiltersChanged,
            dashboardFilters: filters,
            dashboardTiles: [],
            dashboardTabs: [],
            filterableFieldsByTileUuid: {},
            allFilterableFieldsMap: {},
        };
        mockSidebar.current = {
            editing: null,
            isSidebarOpen: false,
            isNew: false,
            open,
            removeFilterById,
        };
    });

    it('renders one pill per saved filter, marking a rule with no default', () => {
        renderWithProviders(<FilterPills activeTabUuid={undefined} />);

        expect(
            screen.getByRole('button', { name: /^Status/ }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Region \u00b7 no default' }),
        ).toBeInTheDocument();
    });

    it('opens the sidebar on the clicked pill', async () => {
        const user = userEvent.setup();
        renderWithProviders(<FilterPills activeTabUuid={undefined} />);

        await user.click(screen.getByRole('button', { name: /^Status/ }));

        expect(open).toHaveBeenCalledWith('saved');
        expect(removeFilterById).not.toHaveBeenCalled();
    });

    it('removes the filter from the X without opening it', async () => {
        const user = userEvent.setup();
        renderWithProviders(<FilterPills activeTabUuid={undefined} />);

        await user.click(
            screen.getAllByRole('button', { name: 'Remove filter' })[0],
        );

        expect(removeFilterById).toHaveBeenCalledWith('saved');
        expect(open).not.toHaveBeenCalled();
    });

    it('marks the pill being edited as selected', () => {
        mockSidebar.current = {
            ...mockSidebar.current,
            editing: { filterId: 'saved' },
            isSidebarOpen: true,
        };
        renderWithProviders(<FilterPills activeTabUuid={undefined} />);

        expect(
            screen.getByRole('button', { name: /^Status/, pressed: true }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: /^Region/, pressed: false }),
        ).toBeInTheDocument();
    });

    it('hides the remove and lock actions while the sidebar is open', () => {
        mockSidebar.current = { ...mockSidebar.current, isSidebarOpen: true };
        renderWithProviders(<FilterPills activeTabUuid={undefined} />);

        expect(
            screen.queryByRole('button', { name: 'Remove filter' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: /ock filter/ }),
        ).not.toBeInTheDocument();
    });

    it('locks the filter on the active tab without opening it', async () => {
        const user = userEvent.setup();
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            dashboardTabs: [
                { uuid: 't1', name: 'One', order: 0 },
                { uuid: 't2', name: 'Two', order: 1 },
            ],
        };
        renderWithProviders(<FilterPills activeTabUuid="t1" />);

        await user.click(
            screen.getAllByRole('button', {
                name: 'Lock filter on this tab',
            })[0],
        );

        expect(setHaveFiltersChanged).toHaveBeenCalledWith(true);
        expect(open).not.toHaveBeenCalled();
        const update = setDashboardFilters.mock.calls[0][0];
        expect(update(filters).dimensions).toEqual([
            { ...savedRule, lockedTabUuids: ['t1'] },
            noDefaultRule,
        ]);
    });

    it('pins the lock only for a filter locked on the active tab', () => {
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            dashboardFilters: {
                ...filters,
                dimensions: [
                    { ...savedRule, lockedTabUuids: ['t1'] },
                    { ...noDefaultRule, lockedTabUuids: ['t2'] },
                ],
            },
            dashboardTabs: [
                { uuid: 't1', name: 'One', order: 0 },
                { uuid: 't2', name: 'Two', order: 1 },
            ],
        };
        renderWithProviders(<FilterPills activeTabUuid="t1" />);

        const unlock = screen.getByRole('button', {
            name: 'Unlock filter on this tab',
        });
        expect(unlock).toHaveAttribute('aria-pressed', 'true');
        expect(unlock.parentElement?.className).toContain('lockSlotActive');
        const lock = screen.getByRole('button', {
            name: 'Lock filter on this tab',
        });
        expect(lock.parentElement?.className).not.toContain('lockSlotActive');
    });

    it('locks on the dashboard uuid when the dashboard has no tabs', async () => {
        const user = userEvent.setup();
        renderWithProviders(<FilterPills activeTabUuid={undefined} />);

        await user.click(
            screen.getAllByRole('button', { name: 'Lock filter' })[0],
        );

        const update = setDashboardFilters.mock.calls[0][0];
        expect(update(filters).dimensions[0]).toEqual({
            ...savedRule,
            lockedTabUuids: ['dashboard-1'],
        });
    });
});
