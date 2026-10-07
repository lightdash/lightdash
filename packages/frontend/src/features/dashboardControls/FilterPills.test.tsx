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

    beforeEach(() => {
        open.mockClear();
        removeFilterById.mockClear();
        mockDashboardContext.current = {
            dashboardFilters: {
                dimensions: [savedRule, noDefaultRule],
                metrics: [],
                tableCalculations: [],
            },
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

    it('hides the remove action while the sidebar is open', () => {
        mockSidebar.current = { ...mockSidebar.current, isSidebarOpen: true };
        renderWithProviders(<FilterPills activeTabUuid={undefined} />);

        expect(
            screen.queryByRole('button', { name: 'Remove filter' }),
        ).not.toBeInTheDocument();
    });
});
