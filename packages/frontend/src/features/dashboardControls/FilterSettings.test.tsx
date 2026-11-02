import {
    DimensionType,
    FieldType,
    FilterOperator,
    FilterType,
    MetricType,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { useState, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type SqlChartTileMetadata } from '../../providers/Dashboard/types';
import { createDashboardTestStore } from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import { renderWithProviders as renderWithAppProviders } from '../../testing/testUtils';
import { FilterBarPopoversProvider } from '../dashboardFilters/FilterRequirements/FilterBarPopoversProvider';
import { useFilterBarPopovers } from '../dashboardFilters/FilterRequirements/useFilterBarPopovers';
import { FilterSettings, type EditorView } from './FilterSettings';

// No parameter values in the dashboard store, and no filters unless a test
// gives them
let storeFilters: DashboardFilters | undefined;
const renderWithProviders = (ui: ReactElement) =>
    renderWithAppProviders(
        <DashboardStoreTestProvider
            store={createDashboardTestStore({
                ...(storeFilters && { dashboardFilters: storeFilters }),
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
const useProject = vi.hoisted(() =>
    vi.fn((_id: string | undefined) => ({ data: undefined })),
);
vi.mock('../../hooks/useProject', () => ({ useProject }));
const mockEmbedded = vi.hoisted(() => ({ current: false }));
vi.mock('../../ee/providers/Embed/useIsEmbedded', () => ({
    default: () => mockEmbedded.current,
}));
vi.mock('./FilterValueSettings', () => ({
    FilterValueSettings: ({
        filterType,
        field,
        filterRule,
    }: {
        filterType: FilterType;
        field: DashboardFilterableField | null;
        filterRule: DashboardFilterRule;
    }) => (
        <div data-testid="value-settings">
            {`${filterType} for ${field?.label ?? 'no field'}`}
            <input aria-label="Operator" />
            {/* Stands in for a value input that cannot take focus */}
            {/* A list value input carries aria-haspopup and opens on focus */}
            <input
                aria-label="Value"
                disabled={!!filterRule.disabled}
                aria-haspopup={
                    filterRule.operator === 'include' ? 'listbox' : undefined
                }
                onFocus={() => mockListOpens()}
            />
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
const mockListOpens = vi.hoisted(() => vi.fn());
const startMapping = vi.hoisted(() => vi.fn());
const updateOtherFilters = vi.hoisted(() => vi.fn());
const moveFilter = vi.hoisted(() => vi.fn());
const mockViewer = vi.hoisted(() => ({
    current: { isViewer: false, canChooseTiles: true },
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
            startMapping,
            moveFilter,
            isNew: false,
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

// The editor holds the view; here, a stand-in that does the same
const Settings = ({
    rule: filterRule,
    field,
}: {
    rule: DashboardFilterRule;
    field: DashboardFilterableField | null;
}) => {
    const [view, setView] = useState<EditorView>('value');
    return (
        <FilterSettings
            rule={filterRule}
            field={field}
            onChange={vi.fn()}
            view={view}
            onViewChange={setView}
            appliedTileCount={3}
            title={<div data-testid="title" />}
            sectionSelect={<div data-testid="section-select" />}
        />
    );
};

const renderSettings = (
    filterRule: DashboardFilterRule,
    field: DashboardFilterableField | null,
) => renderWithProviders(<Settings rule={filterRule} field={field} />);

const openSettings = () =>
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

const RulesState = () => (
    <div data-testid="rules-state">
        {useFilterBarPopovers()?.isRulesPopoverOpen ? 'open' : 'closed'}
    </div>
);

describe('FilterSettings', () => {
    beforeEach(() => {
        useProject.mockClear();
        storeFilters = undefined;
        moveFilter.mockClear();
        mockEmbedded.current = false;
        close.mockClear();
        updateOtherFilters.mockClear();
        mockViewer.current = { isViewer: false, canChooseTiles: true };
        startMapping.mockClear();
        mockTileStatus.current = { sqlChartTilesMetadata: {} };
        mockDashboardContext.current = {
            allFilterableFieldsMap: {},
            dashboardTiles: [],
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

    it.each([
        [false, 'project-1'],
        [true, undefined],
    ])(
        'asks for the project only outside an embed (embedded: %s)',
        (isEmbedded, projectUuid) => {
            mockEmbedded.current = isEmbedded;
            renderSettings(
                rule({ fieldId: 'orders_amount', tableName: 'orders' }),
                amount,
            );
            expect(useProject).toHaveBeenCalled();
            expect(
                useProject.mock.calls.every(([id]) => id === projectUuid),
            ).toBe(true);
        },
    );

    it('falls back to text when a field is gone', () => {
        renderSettings(
            rule({ fieldId: 'orders_gone', tableName: 'orders' }),
            null,
        );

        expect(screen.getByTestId('value-settings')).toHaveTextContent(
            `${FilterType.STRING} for no field`,
        );
        openSettings();
        expect(screen.getByTestId('viewer-controls')).toBeInTheDocument();
    });

    it('shows the value, then where it applies and Settings as quiet rows', () => {
        renderSettings(
            rule({ fieldId: 'orders_amount', tableName: 'orders' }),
            amount,
        );

        expect(screen.getByTestId('value-settings')).toBeVisible();
        expect(screen.getByText('Applies to 3 tiles')).toBeInTheDocument();
        // Mapping is entered on purpose, from this row only
        const chooseTiles = screen.getByRole('button', {
            name: 'Choose tiles',
        });
        expect(chooseTiles).toBeEnabled();
        expect(startMapping).not.toHaveBeenCalled();
        fireEvent.click(chooseTiles);
        expect(startMapping).toHaveBeenCalledTimes(1);
        expect(
            screen.getByRole('button', { name: 'Settings' }),
        ).toBeInTheDocument();
        expect(screen.queryByTestId('viewer-controls')).not.toBeInTheDocument();
        // The name is the value view's title
        expect(screen.getByTestId('title')).toBeInTheDocument();
    });

    it('focuses the value input after the operator when the value shows', () => {
        renderSettings(
            rule({ fieldId: 'orders_amount', tableName: 'orders' }),
            amount,
        );
        expect(screen.getByLabelText('Value')).toHaveFocus();
    });

    it('never focuses a value input that opens its list on focus, so the list cannot cover the footer', () => {
        mockListOpens.mockClear();
        renderSettings(
            {
                ...rule({ fieldId: 'orders_amount', tableName: 'orders' }),
                operator: FilterOperator.INCLUDE,
            },
            amount,
        );
        expect(screen.getByLabelText('Value')).not.toHaveFocus();
        expect(mockListOpens).not.toHaveBeenCalled();
        expect(screen.getByLabelText('Operator')).toHaveFocus();
    });

    it('falls back to the first enabled input when the value input cannot take focus', () => {
        renderSettings(
            {
                ...rule({ fieldId: 'orders_amount', tableName: 'orders' }),
                disabled: true,
            },
            amount,
        );
        expect(screen.getByLabelText('Operator')).toHaveFocus();
    });

    it('switches to Settings in place, and its back arrow returns to the value', () => {
        renderSettings(
            rule({ fieldId: 'orders_amount', tableName: 'orders' }),
            amount,
        );
        openSettings();

        expect(screen.getByText('Settings')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Back' })).toHaveFocus();
        expect(screen.queryByTestId('title')).not.toBeInTheDocument();
        expect(screen.getByTestId('section-select')).toBeInTheDocument();
        expect(screen.getByTestId('viewer-controls')).toBeInTheDocument();
        expect(screen.queryByTestId('value-settings')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Back' }));
        expect(screen.getByTestId('value-settings')).toBeVisible();
        expect(screen.getByLabelText('Value')).toHaveFocus();
    });

    it('gives the viewer controls the type and field the value settings get', () => {
        renderSettings(
            rule({ fieldId: 'orders_amount', tableName: 'orders' }),
            amount,
        );
        openSettings();
        expect(screen.getByTestId('viewer-controls')).toHaveTextContent(
            `${FilterType.NUMBER} for Amount`,
        );
    });

    it('closes the editor, then opens the filter rules of the bar', () => {
        renderWithProviders(
            <FilterBarPopoversProvider>
                <Settings
                    rule={rule({
                        fieldId: 'orders_amount',
                        tableName: 'orders',
                    })}
                    field={amount}
                />
                <RulesState />
            </FilterBarPopoversProvider>,
        );
        expect(screen.getByTestId('rules-state')).toHaveTextContent('closed');
        openSettings();

        fireEvent.click(screen.getByRole('button', { name: 'edit rules' }));

        expect(close).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId('rules-state')).toHaveTextContent('open');
    });

    it('writes the other filters the viewer controls change through the sidebar', () => {
        renderSettings(
            rule({ fieldId: 'orders_amount', tableName: 'orders' }),
            amount,
        );
        openSettings();

        fireEvent.click(screen.getByRole('button', { name: 'change others' }));

        expect(updateOtherFilters).toHaveBeenCalledWith(otherRules);
    });

    it('offers no way to the filter rules where the bar cannot be reached', () => {
        renderSettings(
            rule({ fieldId: 'orders_amount', tableName: 'orders' }),
            amount,
        );
        openSettings();
        expect(
            screen.queryByRole('button', { name: 'edit rules' }),
        ).not.toBeInTheDocument();
    });

    it("gives a viewer's own filter the tiles row, as the shipped Tiles tab, and no Settings", () => {
        mockViewer.current = { isViewer: true, canChooseTiles: true };
        renderSettings(
            rule({ fieldId: 'orders_amount', tableName: 'orders' }),
            amount,
        );
        expect(screen.getByText('Applies to 3 tiles')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Choose tiles' }));
        expect(startMapping).toHaveBeenCalledTimes(1);
        expect(
            screen.queryByRole('button', { name: 'Settings' }),
        ).not.toBeInTheDocument();
    });

    it("gives a viewer's saved filter the value alone: no rows, no Settings", () => {
        mockViewer.current = { isViewer: true, canChooseTiles: false };
        renderSettings(
            rule({ fieldId: 'orders_amount', tableName: 'orders' }),
            amount,
        );
        expect(screen.getByTestId('value-settings')).toBeVisible();
        expect(screen.queryByText(/Applies to/)).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Settings' }),
        ).not.toBeInTheDocument();
    });

    it('moves the pill left or right on the bar, an end staying focusable', () => {
        const first = rule({ fieldId: 'orders_amount', tableName: 'orders' });
        storeFilters = {
            dimensions: [first, { ...first, id: 'filter-2' }],
            metrics: [],
            tableCalculations: [],
        };
        renderSettings(first, amount);
        openSettings();

        const left = screen.getByRole('button', { name: 'Move left' });
        expect(left).toHaveAttribute('aria-disabled', 'true');
        expect(left).toBeEnabled();
        fireEvent.click(left);
        expect(moveFilter).not.toHaveBeenCalled();

        const right = screen.getByRole('button', { name: 'Move right' });
        expect(right).not.toHaveAttribute('aria-disabled');
        fireEvent.click(right);
        expect(moveFilter).toHaveBeenCalledWith('filter-1', 'right');
    });
});
