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
import { useState, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type SqlChartTileMetadata } from '../../providers/Dashboard/types';
import { createDashboardTestStore } from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import { renderWithProviders as renderWithAppProviders } from '../../testing/testUtils';
import { FilterBarPopoversProvider } from '../dashboardFilters/FilterRequirements/FilterBarPopoversProvider';
import { useFilterBarPopovers } from '../dashboardFilters/FilterRequirements/useFilterBarPopovers';
import { FilterSettings, type EditorView } from './FilterSettings';

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
    }: {
        filterType: FilterType;
        field: DashboardFilterableField | null;
    }) => (
        <div data-testid="value-settings">
            {`${filterType} for ${field?.label ?? 'no field'}`}
            <input aria-label="Operator" />
            <input aria-label="Value" />
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
const mockViewer = vi.hoisted(() => ({
    current: { isViewer: false },
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
            nameInput={<input aria-label="Name" />}
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
        mockEmbedded.current = false;
        close.mockClear();
        updateOtherFilters.mockClear();
        mockViewer.current = { isViewer: false };
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
        // Mapping comes with the tiles themselves, not yet
        expect(
            screen.getByRole('button', { name: 'Choose tiles' }),
        ).toBeDisabled();
        expect(
            screen.getByRole('button', { name: 'Settings' }),
        ).toBeInTheDocument();
        expect(screen.queryByTestId('viewer-controls')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
    });

    it('focuses the value input after the operator when the value shows', () => {
        renderSettings(
            rule({ fieldId: 'orders_amount', tableName: 'orders' }),
            amount,
        );
        expect(screen.getByLabelText('Value')).toHaveFocus();
    });

    it('switches to Settings in place, and its back arrow returns to the value', () => {
        renderSettings(
            rule({ fieldId: 'orders_amount', tableName: 'orders' }),
            amount,
        );
        openSettings();

        expect(screen.getByText('Settings')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Back' })).toHaveFocus();
        expect(screen.getByLabelText('Name')).toBeInTheDocument();
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

    it('gives a viewer the value alone: no rows, no Settings', () => {
        mockViewer.current = { isViewer: true };
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
});
