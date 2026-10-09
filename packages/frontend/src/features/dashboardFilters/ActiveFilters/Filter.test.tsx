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

    it('marks the pill active and colours the field icon when a value is set', () => {
        renderFilter(buildRule({ values: ['completed'] }));

        expect(getPill()).toHaveAttribute('data-filter-active');
        const icon = screen.getByTestId('filter-field-icon');
        expect(icon).not.toHaveStyle({
            color: 'var(--mantine-color-ldGray-4)',
        });
    });

    it('leaves the pill inactive with a dimmed field icon when no value is set', () => {
        renderFilter(buildRule({ values: [] }));

        expect(getPill()).not.toHaveAttribute('data-filter-active');
        expect(screen.getByTestId('filter-field-icon')).toHaveStyle({
            color: 'var(--mantine-color-ldGray-4)',
        });
    });

    it('treats a disabled rule as inactive even when it holds values', () => {
        renderFilter(buildRule({ values: ['completed'], disabled: true }));

        expect(getPill()).not.toHaveAttribute('data-filter-active');
    });
});
