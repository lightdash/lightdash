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
import { type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type SqlChartTileMetadata } from '../../providers/Dashboard/types';
import { createDashboardTestStore } from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import { renderWithProviders as renderWithAppProviders } from '../../testing/testUtils';
import { FilterBarPopoversProvider } from '../dashboardFilters/FilterRequirements/FilterBarPopoversProvider';
import { useFilterBarPopovers } from '../dashboardFilters/FilterRequirements/useFilterBarPopovers';
import { FilterSettings } from './FilterSettings';

// No filters and no parameter values in the dashboard store
const renderWithProviders = (ui: ReactElement) =>
    renderWithAppProviders(
        <DashboardStoreTestProvider
            store={createDashboardTestStore({
                parameterValues: {},
                sqlChartTilesMetadata: mockTileStatus.current
                    .sqlChartTilesMetadata as Record<
                    string,
                    SqlChartTileMetadata
                >,
            })}
        >
            {ui}
        </DashboardStoreTestProvider>,
    );

const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
const mockTileStatus = vi.hoisted(() => ({
    current: { sqlChartTilesMetadata: {} } as Record<string, unknown>,
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
        onChangeOthers,
        onEditRules,
    }: {
        filterType: FilterType;
        field: DashboardFilterableField | null;
        onChangeOthers: (rules: DashboardFilterRule[]) => void;
        onEditRules: (() => void) | null;
    }) => (
        <div data-testid="viewer-controls">
            {`${filterType} for ${field?.label ?? 'no field'}`}
            <button type="button" onClick={() => onChangeOthers(otherRules)}>
                change others
            </button>
            {onEditRules !== null && (
                <button type="button" onClick={onEditRules}>
                    edit rules
                </button>
            )}
        </div>
    ),
}));
const close = vi.hoisted(() => vi.fn());
const updateOtherFilters = vi.hoisted(() => vi.fn());
const setActiveSection = vi.hoisted(() => vi.fn());
const mockSection = vi.hoisted(() => ({
    current: null as 'tiles' | 'rules' | null,
}));
const mockViewer = vi.hoisted(() => ({
    current: { isViewer: false, isSavedValue: false },
}));
const otherRules = vi.hoisted(
    () => [{ id: 'filter-2' }] as DashboardFilterRule[],
);
vi.mock('./useControlsSidebar', () => ({
    useControlsSidebarSelector: (
        selector: (value: Record<string, unknown>) => unknown,
    ) =>
        selector({
            close,
            updateOtherFilters,
            activeSection: mockSection.current,
            setActiveSection,
            ...mockViewer.current,
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
        <FilterSettings
            rule={filterRule}
            field={field}
            onChange={vi.fn()}
            tiles={<div data-testid="tiles-panel" />}
            tilesSummary="3 tiles · 1 field"
        />,
    );

const RulesState = () => (
    <div data-testid="rules-state">
        {useFilterBarPopovers()?.isRulesPopoverOpen ? 'open' : 'closed'}
    </div>
);

describe('FilterSettings', () => {
    beforeEach(() => {
        close.mockClear();
        updateOtherFilters.mockClear();
        setActiveSection.mockClear();
        mockSection.current = 'rules';
        mockViewer.current = { isViewer: false, isSavedValue: false };
        mockTileStatus.current = { sqlChartTilesMetadata: {} };
        mockDashboardContext.current = {
            allFilterableFieldsMap: {},
            dashboardTiles: [],
            filterableFieldsByTileUuid: {},
            activeTab: undefined,
        };
    });

    const disclosure = (name: string) =>
        screen.getByRole('button', { name: new RegExp(`^${name}`) });

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

    it('shows the value first, then Tiles and Rules as one-line summaries', () => {
        mockSection.current = null;
        renderSettings(
            rule({ fieldId: 'orders_amount', tableName: 'orders' }),
            amount,
        );

        expect(screen.getByTestId('value-settings')).toBeVisible();
        expect(disclosure('Tiles')).toHaveTextContent('Tiles3 tiles · 1 field');
        expect(disclosure('Tiles')).toHaveAttribute('aria-expanded', 'false');
        expect(disclosure('Rules')).toHaveTextContent('RulesNone');
        expect(disclosure('Rules')).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByTestId('tiles-panel')).not.toBeInTheDocument();
        expect(screen.queryByTestId('viewer-controls')).not.toBeInTheDocument();
    });

    it('opens one section at a time, and closes the open one on a second click', () => {
        mockSection.current = 'tiles';
        renderSettings(
            rule({ fieldId: 'orders_amount', tableName: 'orders' }),
            amount,
        );

        expect(screen.getByTestId('tiles-panel')).toBeVisible();
        expect(screen.queryByTestId('viewer-controls')).not.toBeInTheDocument();
        fireEvent.click(disclosure('Rules'));
        expect(setActiveSection).toHaveBeenLastCalledWith('rules');
        fireEvent.click(disclosure('Tiles'));
        expect(setActiveSection).toHaveBeenLastCalledWith(null);
    });

    it('summarises the lock and the requirement under Rules', () => {
        mockSection.current = null;
        const { unmount } = renderSettings(
            {
                ...rule({ fieldId: 'orders_amount', tableName: 'orders' }),
                lockedTabUuids: ['dashboard-1'],
                required: true,
            },
            amount,
        );
        expect(disclosure('Rules')).toHaveTextContent('RulesLocked · Required');
        expect(screen.getByText('Required')).toHaveClass(/required/);
        unmount();

        renderSettings(
            {
                ...rule({ fieldId: 'orders_amount', tableName: 'orders' }),
                required: true,
            },
            amount,
        );
        expect(disclosure('Rules')).toHaveTextContent('RulesRequired');
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
                    tiles={null}
                    tilesSummary=""
                />
                <RulesState />
            </FilterBarPopoversProvider>,
        );
        expect(screen.getByTestId('rules-state')).toHaveTextContent('closed');

        fireEvent.click(screen.getByRole('button', { name: 'edit rules' }));

        expect(close).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId('rules-state')).toHaveTextContent('open');
    });

    it('writes the other filters the viewer controls change through the sidebar', () => {
        renderSettings(
            rule({ fieldId: 'orders_amount', tableName: 'orders' }),
            amount,
        );

        fireEvent.click(screen.getByRole('button', { name: 'change others' }));

        expect(updateOtherFilters).toHaveBeenCalledWith(otherRules);
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

    it("gives a viewer's own filter the value and Tiles, never Rules", () => {
        mockSection.current = null;
        mockViewer.current = { isViewer: true, isSavedValue: false };
        renderSettings(
            rule({ fieldId: 'orders_amount', tableName: 'orders' }),
            amount,
        );
        expect(screen.getByTestId('value-settings')).toBeVisible();
        expect(
            screen.getByText('Added by you · only in this view and its link'),
        ).toBeInTheDocument();
        expect(disclosure('Tiles')).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: /^Rules/ }),
        ).not.toBeInTheDocument();
    });

    it('gives a saved filter a viewer changes only its value', () => {
        mockSection.current = null;
        mockViewer.current = { isViewer: true, isSavedValue: true };
        renderSettings(
            rule({ fieldId: 'orders_amount', tableName: 'orders' }),
            amount,
        );
        expect(screen.getByTestId('value-settings')).toBeVisible();
        expect(
            screen.queryByRole('button', { name: /^Tiles/ }),
        ).not.toBeInTheDocument();
        expect(screen.queryByText(/Added by you/)).not.toBeInTheDocument();
    });
});
