import {
    DimensionType,
    FieldType,
    FilterOperator,
    FilterType,
    MetricType,
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { FilterBarPopoversProvider } from '../dashboardFilters/FilterRequirements/FilterBarPopoversProvider';
import { useFilterBarPopovers } from '../dashboardFilters/FilterRequirements/useFilterBarPopovers';
import { FilterSettings } from './FilterSettings';

const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
const mockTileStatus = vi.hoisted(() => ({
    current: { sqlChartTilesMetadata: {} } as Record<string, unknown>,
}));

vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector) => selector(mockDashboardContext.current)),
}));
vi.mock('../../providers/Dashboard/useDashboardTileStatusContext', () => ({
    default: vi.fn((selector) => selector(mockTileStatus.current)),
}));
vi.mock('../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project-1',
}));
vi.mock('../../hooks/useProject', () => ({
    useProject: () => ({ data: undefined }),
}));
vi.mock('./FilterValueSettings', () => ({
    FilterValueSettings: ({
        filterType,
        field,
    }: {
        filterType: FilterType;
        field: DashboardFilterableField | null;
    }) => (
        <div data-testid="value-settings">
            {`${filterType} for ${field?.label ?? 'no field'}`}
        </div>
    ),
}));
vi.mock('./ViewerControls', () => ({
    ViewerControls: ({
        filterType,
        field,
        onEditRules,
    }: {
        filterType: FilterType;
        field: DashboardFilterableField | null;
        onEditRules: (() => void) | null;
    }) => (
        <div data-testid="viewer-controls">
            {`${filterType} for ${field?.label ?? 'no field'}`}
            {onEditRules !== null && (
                <button type="button" onClick={onEditRules}>
                    edit rules
                </button>
            )}
        </div>
    ),
}));
const close = vi.hoisted(() => vi.fn());
vi.mock('./useControlsSidebar', () => ({
    useControlsSidebarSelector: (
        selector: (value: { close: () => void }) => unknown,
    ) => selector({ close }),
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
const revenue: DashboardFilterableField = {
    fieldType: FieldType.METRIC,
    type: MetricType.SUM,
    name: 'revenue',
    label: 'Revenue',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '${TABLE}.amount',
    hidden: false,
};

const rule = (target: DashboardFilterRule['target']): DashboardFilterRule => ({
    id: 'filter-1',
    label: undefined,
    operator: FilterOperator.EQUALS,
    target,
    values: [],
});

const sqlTarget = (fallbackType?: DimensionType) => ({
    fieldId: 'ordered_at',
    tableName: 'sql_chart',
    isSqlColumn: true,
    fallbackType,
});

const renderSettings = (
    filterRule: DashboardFilterRule,
    field: DashboardFilterableField | null,
) =>
    renderWithProviders(
        <FilterSettings rule={filterRule} field={field} onChange={vi.fn()} />,
    );

const RulesState = () => (
    <div data-testid="rules-state">
        {useFilterBarPopovers()?.isRulesPopoverOpen ? 'open' : 'closed'}
    </div>
);

describe('FilterSettings', () => {
    beforeEach(() => {
        close.mockClear();
        mockTileStatus.current = { sqlChartTilesMetadata: {} };
        mockDashboardContext.current = {
            allFilters: { dimensions: [], metrics: [], tableCalculations: [] },
            allFilterableFieldsMap: {},
            dashboardTiles: [],
            parameterValues: {},
            filterableFieldsByTileUuid: {},
            activeTab: undefined,
        };
    });

    it("uses the type of the filter's field, dimension or metric", () => {
        const { unmount } = renderSettings(
            rule({ fieldId: 'orders_amount', tableName: 'orders' }),
            amount,
        );
        expect(screen.getByTestId('value-settings')).toHaveTextContent(
            `${FilterType.NUMBER} for Amount`,
        );
        unmount();

        renderSettings(
            rule({ fieldId: 'orders_revenue', tableName: 'orders' }),
            revenue,
        );
        expect(screen.getByTestId('value-settings')).toHaveTextContent(
            `${FilterType.NUMBER} for Revenue`,
        );
    });

    it('uses the type a tile reports for a SQL column', () => {
        mockTileStatus.current = {
            sqlChartTilesMetadata: {
                'tile-1': {
                    columns: [
                        {
                            reference: 'ordered_at',
                            type: DimensionType.TIMESTAMP,
                        },
                    ],
                },
            },
        };
        renderSettings(rule(sqlTarget(DimensionType.STRING)), null);

        expect(screen.getByTestId('value-settings')).toHaveTextContent(
            `${FilterType.DATE} for no field`,
        );
    });

    it('falls back to the type a SQL column filter carries', () => {
        renderSettings(rule(sqlTarget(DimensionType.BOOLEAN)), null);

        expect(screen.getByTestId('value-settings')).toHaveTextContent(
            `${FilterType.BOOLEAN} for no field`,
        );
    });

    it('falls back to text when a field is gone', () => {
        renderSettings(
            rule({ fieldId: 'orders_gone', tableName: 'orders' }),
            null,
        );

        expect(screen.getByTestId('value-settings')).toHaveTextContent(
            `${FilterType.STRING} for no field`,
        );
        expect(screen.getByTestId('viewer-controls')).toBeInTheDocument();
    });

    it('gives the viewer controls the type and field the value settings get', () => {
        renderSettings(
            rule({ fieldId: 'orders_amount', tableName: 'orders' }),
            amount,
        );
        expect(screen.getByTestId('viewer-controls')).toHaveTextContent(
            `${FilterType.NUMBER} for Amount`,
        );
    });

    it('closes the editor, then opens the filter rules of the bar', () => {
        renderWithProviders(
            <FilterBarPopoversProvider>
                <FilterSettings
                    rule={rule({
                        fieldId: 'orders_amount',
                        tableName: 'orders',
                    })}
                    field={amount}
                    onChange={vi.fn()}
                />
                <RulesState />
            </FilterBarPopoversProvider>,
        );
        expect(screen.getByTestId('rules-state')).toHaveTextContent('closed');

        fireEvent.click(screen.getByRole('button', { name: 'edit rules' }));

        expect(close).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId('rules-state')).toHaveTextContent('open');
    });

    it('offers no way to the filter rules where the bar cannot be reached', () => {
        renderSettings(
            rule({ fieldId: 'orders_amount', tableName: 'orders' }),
            amount,
        );
        expect(
            screen.queryByRole('button', { name: 'edit rules' }),
        ).not.toBeInTheDocument();
    });
});
