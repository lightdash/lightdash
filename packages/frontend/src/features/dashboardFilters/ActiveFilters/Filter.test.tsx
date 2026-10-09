import {
    DimensionType,
    FieldType,
    FilterOperator,
    type DashboardFilterRule,
    type DashboardFilterableField,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import Filter from './Filter';

const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));

vi.mock('../../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector: (context: Record<string, unknown>) => unknown) =>
        selector(mockDashboardContext.current),
    ),
}));

vi.mock('../../../providers/Dashboard/useDashboardTileStatusContext', () => ({
    default: vi.fn((selector: (context: Record<string, unknown>) => unknown) =>
        selector({ sqlChartTilesMetadata: {} }),
    ),
}));

const statusField = {
    name: 'status',
    table: 'orders',
    tableLabel: 'Orders',
    label: 'Status',
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    sql: '${TABLE}.status',
    hidden: false,
} as DashboardFilterableField;

const buildRule = (
    overrides: Partial<DashboardFilterRule> = {},
): DashboardFilterRule => ({
    id: 'status-filter',
    target: { fieldId: 'orders_status', tableName: 'orders' },
    operator: FilterOperator.EQUALS,
    values: [],
    label: 'Status',
    ...overrides,
});

const renderFilter = (filterRule: DashboardFilterRule) =>
    renderWithProviders(
        <Filter
            isEditMode={false}
            isOrphaned={false}
            field={statusField}
            filterRule={filterRule}
            openPopoverId={undefined}
            onPopoverOpen={vi.fn()}
            onPopoverClose={vi.fn()}
            onUpdate={vi.fn()}
            onRemove={vi.fn()}
        />,
    );

const getPill = () => screen.getByRole('button', { name: /Status/ });

describe('Filter pill active state', () => {
    beforeEach(() => {
        mockDashboardContext.current = {
            dashboard: { uuid: 'dashboard-1', filters: { dimensions: [] } },
            dashboardTiles: [],
            dashboardTabs: [],
            activeTab: undefined,
            allFilterableFields: [statusField],
            filterableFieldsByTileUuid: {},
            unmetFilterRequirements: [],
        };
    });

    it('marks the pill active when a value is set', () => {
        renderFilter(buildRule({ values: ['completed'] }));

        expect(getPill()).toHaveAttribute('data-filter-active');
    });

    it('leaves the pill inactive when no value is set', () => {
        renderFilter(buildRule({ values: [] }));

        expect(getPill()).not.toHaveAttribute('data-filter-active');
    });

    it('treats a disabled rule as inactive even when it holds values', () => {
        renderFilter(buildRule({ values: ['completed'], disabled: true }));

        expect(getPill()).not.toHaveAttribute('data-filter-active');
    });
});

describe('Filter pill requirement state', () => {
    const setUnmet = (rule: DashboardFilterRule) => {
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            unmetFilterRequirements: [{ type: 'single', filter: rule }],
        };
    };

    beforeEach(() => {
        mockDashboardContext.current = {
            dashboard: { uuid: 'dashboard-1', filters: { dimensions: [] } },
            dashboardTiles: [],
            dashboardTabs: [],
            activeTab: undefined,
            allFilterableFields: [statusField],
            filterableFieldsByTileUuid: {},
            unmetFilterRequirements: [],
        };
    });

    it('shows an unmet required filter as unmet and never active', () => {
        const rule = buildRule({ required: true, disabled: true, values: [] });
        setUnmet(rule);
        renderFilter(rule);

        expect(getPill()).toHaveAttribute('data-requirement-unmet');
        expect(getPill()).not.toHaveAttribute('data-filter-active');
    });

    it('keeps an enabled required filter with no values out of the active state', () => {
        const rule = buildRule({ required: true, values: [] });
        setUnmet(rule);
        renderFilter(rule);

        expect(getPill()).toHaveAttribute('data-requirement-unmet');
        expect(getPill()).not.toHaveAttribute('data-filter-active');
    });

    it('shows a required filter with a value as active and met', () => {
        renderFilter(buildRule({ required: true, values: ['completed'] }));

        expect(getPill()).toHaveAttribute('data-filter-active');
        expect(getPill()).not.toHaveAttribute('data-requirement-unmet');
    });
});
