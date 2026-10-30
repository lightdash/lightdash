import {
    DimensionType,
    FieldType,
    FilterOperator,
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDashboardTestStore } from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import { renderWithProviders } from '../../testing/testUtils';
import { FilterSettings } from './FilterSettings';

// The value settings are not mocked: this is about the headings they render
const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector) => selector(mockDashboardContext.current)),
}));
vi.mock('../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project-1',
}));
vi.mock('../../hooks/useProject', () => ({
    useProject: () => ({ data: undefined }),
}));
vi.mock('./useControlsSidebar', () => ({
    useControlsSidebarSelector: (
        selector: (value: Record<string, unknown>) => unknown,
    ) =>
        selector({
            close: vi.fn(),
            updateOtherFilters: vi.fn(),
            activeSection: null,
            setActiveSection: vi.fn(),
        }),
}));

const amount: DashboardFilterableField = {
    fieldType: FieldType.DIMENSION,
    type: DimensionType.NUMBER,
    name: 'amount',
    label: 'Amount',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '${TABLE}.amount',
    hidden: false,
};

const rule = (
    overrides: Partial<DashboardFilterRule>,
): DashboardFilterRule => ({
    id: 'filter-1',
    label: undefined,
    operator: FilterOperator.EQUALS,
    target: { fieldId: 'orders_amount', tableName: 'orders' },
    values: [5],
    ...overrides,
});

const renderSettings = (filterRule: DashboardFilterRule) =>
    renderWithProviders(
        <DashboardStoreTestProvider
            store={createDashboardTestStore({ parameterValues: {} })}
        >
            <FilterSettings
                rule={filterRule}
                field={amount}
                onChange={vi.fn()}
                view="value"
                onViewChange={vi.fn()}
                appliedTileCount={1}
                title={null}
                sectionSelect={null}
            />
        </DashboardStoreTestProvider>,
    );

describe('FilterSettings headings', () => {
    beforeEach(() => {
        mockDashboardContext.current = {
            allFilterableFieldsMap: {},
            dashboardTiles: [],
            filterableFieldsByTileUuid: {},
        };
    });

    it('shows no default switch and no heading: edit mode edits the default', () => {
        renderSettings(rule({}));

        expect(
            screen.queryByText('Provide default value'),
        ).not.toBeInTheDocument();
        expect(screen.queryByText('Default value')).not.toBeInTheDocument();
        expect(screen.queryByText('Preview value')).not.toBeInTheDocument();
    });

    it("focuses an editor's enabled value input on a filter that is any value, as a new one is", () => {
        renderSettings(rule({ values: [], disabled: true }));

        const active = document.activeElement;
        expect(active?.tagName).toBe('INPUT');
        expect(active).toBeEnabled();
        // The value, not the operator select before it
        expect(active).not.toHaveValue('is');
    });

    it('shows no default switch on a required filter, as the shipped form', () => {
        renderSettings(rule({ required: true }));

        expect(
            screen.queryByText('Provide default value'),
        ).not.toBeInTheDocument();
        expect(screen.queryByText('Preview value')).not.toBeInTheDocument();
    });
});
