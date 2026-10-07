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

vi.mock('./useFilterSidebar', () => ({
    useFilterSidebar: () => mockSidebar.current,
}));

const savedRule: DashboardFilterRule = {
    id: 'saved',
    label: 'Status',
    operator: FilterOperator.EQUALS,
    target: { fieldId: 'orders_status', tableName: 'orders' },
    values: ['done'],
};

const unplacedRule = (
    id: string,
    label: string | undefined,
): DashboardFilterRule => ({
    id,
    label,
    operator: FilterOperator.EQUALS,
    target: { fieldId: '', tableName: '' },
    values: [],
    tileTargets: {},
});

describe('FilterPills', () => {
    const open = vi.fn();
    const removeFilterById = vi.fn();

    beforeEach(() => {
        open.mockClear();
        removeFilterById.mockClear();
        mockDashboardContext.current = {
            dashboard: { uuid: 'dash' },
            setDashboardFilters: vi.fn(),
            setHaveFiltersChanged: vi.fn(),
            dashboardFilters: {
                dimensions: [savedRule],
                metrics: [],
                tableCalculations: [],
            },
            dashboardTiles: [],
            dashboardTabs: [],
            filterableFieldsByTileUuid: {},
            allFilterableFieldsMap: {},
        };
        mockSidebar.current = {
            editing: { filterId: 'two' },
            isSidebarOpen: false,
            isNew: false,
            unplacedFilters: [
                unplacedRule('one', 'Region'),
                unplacedRule('two', undefined),
            ],
            open,
            removeFilterById,
            getSessionSettings: () => ({ hiddenTabUuids: [] }),
            updateSessionSettings: vi.fn(),
        };
    });

    it('renders unplaced filters as dashed pills after the saved ones', async () => {
        renderWithProviders(<FilterPills activeTabUuid={undefined} />);

        const pills = screen.getAllByRole('button', { pressed: false });
        expect(pills[0]).toHaveTextContent('Status');
        expect(screen.getByText('Region')).toBeInTheDocument();
        expect(screen.getByText('New filter')).toBeInTheDocument();
        expect(screen.getAllByText('· no fields, not saved')).toHaveLength(2);

        const selected = screen.getByRole('button', { pressed: true });
        expect(selected).toHaveTextContent('New filter');
        expect(selected.className).toContain('hiddenPill');
        expect(selected.className).toContain('selectedPill');

        // Lock and eye belong to the saved pill only
        expect(
            screen.getAllByRole('button', { name: /lock filter/i }),
        ).toHaveLength(1);
        expect(
            screen.getAllByRole('button', { name: /visible to viewers/i }),
        ).toHaveLength(1);

        await userEvent.click(screen.getByText('Region'));
        expect(open).toHaveBeenCalledWith('one');

        const removeButtons = screen.getAllByRole('button', {
            name: 'Remove filter',
        });
        await userEvent.click(removeButtons[1]);
        expect(removeFilterById).toHaveBeenCalledWith('one');
        expect(open).toHaveBeenCalledTimes(1);
    });

    it('hides the remove action while the sidebar is open', () => {
        mockSidebar.current = { ...mockSidebar.current, isSidebarOpen: true };
        renderWithProviders(<FilterPills activeTabUuid={undefined} />);

        expect(
            screen.queryByRole('button', { name: 'Remove filter' }),
        ).not.toBeInTheDocument();
    });
});
