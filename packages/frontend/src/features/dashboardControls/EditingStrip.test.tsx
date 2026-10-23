import { FilterOperator, type DashboardFilterRule } from '@lightdash/common';
import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { EditingStrip } from './EditingStrip';

const mockSidebar = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
vi.mock('./useControlsSidebar', () => ({
    useControlsSidebarSelector: (
        selector: (value: Record<string, unknown>) => unknown,
    ) => selector(mockSidebar.current),
}));
// The rail's own count, by filter
const mockCounts = vi.hoisted((): Record<string, number> => ({}));
vi.mock('./useAppliedTileCount', () => ({
    useAppliedTileCount: (rule: { id: string }) => mockCounts[rule.id] ?? 0,
}));
vi.mock('./useFilterRuleField', () => ({
    useFilterRuleField: (rule: { target: { fieldId: string } } | null) =>
        rule?.target.fieldId === 'orders_status'
            ? {
                  fieldType: 'dimension',
                  type: 'string',
                  name: 'status',
                  label: 'Status',
                  table: 'orders',
                  tableLabel: 'Orders',
                  sql: 'x',
                  hidden: false,
              }
            : null,
}));

const rule = (
    overrides: Partial<DashboardFilterRule>,
): DashboardFilterRule => ({
    id: 'a',
    operator: FilterOperator.EQUALS,
    target: { fieldId: 'orders_status', tableName: 'orders' },
    values: [],
    label: undefined,
    ...overrides,
});

const setSidebar = (overrides: Record<string, unknown>) => {
    mockSidebar.current = {
        editingRule: rule({}),
        isNew: false,
        isPlaceholder: false,
        emptiedFieldLabel: null,
        ...overrides,
    };
};

describe('EditingStrip', () => {
    beforeEach(() => {
        mockCounts.a = 3;
        mockCounts.b = 1;
    });

    it('names the edited filter and the tiles it is on, in a status', () => {
        setSidebar({});
        renderWithProviders(<EditingStrip />);

        expect(screen.getByRole('status')).toHaveTextContent(
            'Editing filtersStatus · 3 tiles',
        );
        expect(screen.getByText('Status')).toBeInTheDocument();
        expect(
            within(screen.getByRole('status')).queryByRole('button'),
        ).not.toBeInTheDocument();
    });

    it('follows a switch to another filter', () => {
        setSidebar({});
        const { rerender } = renderWithProviders(<EditingStrip />);
        setSidebar({ editingRule: rule({ id: 'b', label: 'Region' }) });
        rerender(<EditingStrip />);

        expect(screen.getByRole('status')).toHaveTextContent(
            'Editing filtersRegion · 1 tile',
        );
    });

    it('says "New filter" with no count while a new filter has no field', () => {
        setSidebar({
            isNew: true,
            isPlaceholder: true,
            editingRule: rule({ target: { fieldId: '', tableName: '' } }),
        });
        renderWithProviders(<EditingStrip />);

        expect(screen.getByRole('status')).toHaveTextContent(
            /^Editing filtersNew filter$/,
        );
    });

    it('says only "Editing filters" with nothing expanded', () => {
        setSidebar({ editingRule: null });
        renderWithProviders(<EditingStrip />);

        expect(screen.getByRole('status')).toHaveTextContent(
            /^Editing filters$/,
        );
    });
});
