import {
    DashboardTileTypes,
    DimensionType,
    FieldType,
    FilterOperator,
    TimeFrames,
    type DashboardFilterRule,
    type DashboardFilters,
    type DashboardTile,
    type FilterableDimension,
} from '@lightdash/common';
import { fireEvent, screen, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement } from 'react';
import { type ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type SqlChartTileMetadata } from '../../providers/Dashboard/types';
import {
    createDashboardTestStore,
    type DashboardEditTestValues,
    seedDashboardEditState,
} from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import { renderWithProviders as renderWithAppProviders } from '../../testing/testUtils';
import type * as LazySelectModule from './LazySelect';
import { TileOverlays } from './TileOverlay';

const mockSidebar = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
const mockTileStatusContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
const mockContainers = vi.hoisted(() => ({
    current: {} as Record<string, Element>,
}));

const wholeContextReads = vi.hoisted(() => ({ current: 0 }));
vi.mock('./useControlsSidebar', () => ({
    useControlsSidebar: () => {
        wholeContextReads.current += 1;
        return mockSidebar.current;
    },
    useControlsSidebarSelector: (
        selector: (value: Record<string, unknown>) => unknown,
    ) => selector(mockSidebar.current),
}));
vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector) => selector(mockDashboardContext.current)),
}));
vi.mock('./usePortalTargets', () => ({
    usePortalTargets: (keys: string[], _: unknown, enabled: boolean) =>
        enabled
            ? Object.fromEntries(
                  keys.map((key) => [key, mockContainers.current[key]]),
              )
            : {},
}));

const renderCounts = vi.hoisted(() => ({
    current: {} as Record<string, number>,
}));
// Passes through, counting how often each tile's card renders
vi.mock('./LazySelect', async (importOriginal) => {
    const actual = await importOriginal<typeof LazySelectModule>();
    return {
        LazySelect: (props: ComponentProps<typeof actual.LazySelect>) => {
            const label = props['aria-label'];
            renderCounts.current[label] =
                (renderCounts.current[label] ?? 0) + 1;
            return <actual.LazySelect {...props} />;
        },
    };
});

const dimension = (name: string, label: string): FilterableDimension => ({
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name,
    label,
    table: 'orders',
    tableLabel: 'Orders',
    sql: `\${TABLE}.${name}`,
    hidden: false,
});

const statusField = dimension('status', 'Status');
const regionField = dimension('region', 'Region');
const amountField: FilterableDimension = {
    ...dimension('amount', 'Amount'),
    type: DimensionType.NUMBER,
};
const customerStatusField: FilterableDimension = {
    ...dimension('status', 'Status'),
    table: 'customers',
    tableLabel: 'Customers',
};

const dateGrain = (
    interval: TimeFrames,
    label: string,
): FilterableDimension => ({
    ...dimension(`created_${interval.toLowerCase()}`, label),
    type: DimensionType.DATE,
    timeInterval: interval,
    timeIntervalBaseDimensionName: 'created',
});
const createdDay = dateGrain(TimeFrames.DAY, 'Created day');
const createdWeek = dateGrain(TimeFrames.WEEK, 'Created week');
const createdMonth = dateGrain(TimeFrames.MONTH, 'Created month');

const tile = (
    uuid: string,
    tabUuid: string,
    type: DashboardTileTypes = DashboardTileTypes.SAVED_CHART,
) =>
    ({
        uuid,
        tabUuid,
        type,
        properties: { title: `Title ${uuid}` },
    }) as DashboardTile;

const both = tile('tile-both', 'tab-1');
const statusOnly = tile('tile-status', 'tab-1');
const markdown = tile('tile-markdown', 'tab-1', DashboardTileTypes.MARKDOWN);
const otherTab = tile('tile-other-tab', 'tab-2');
const sql = tile('tile-sql', 'tab-1', DashboardTileTypes.SQL_CHART);
const allTiles = [both, statusOnly, markdown, otherTab, sql];

const rule = (
    overrides: Partial<DashboardFilterRule> = {},
): DashboardFilterRule => ({
    id: 'control',
    label: undefined,
    operator: FilterOperator.EQUALS,
    target: { fieldId: 'orders_status', tableName: 'orders' },
    values: [],
    ...overrides,
});

const updateFilter = vi.fn();
// The provider's undoable write ends in its updateFilter
const applyWithUndo = vi.fn((next: DashboardFilterRule, _apply: unknown) =>
    updateFilter(next),
);
const addFirstFieldOnTile = vi.fn();

const groupLabels = () =>
    screen
        .getAllByRole('group', { hidden: true })
        .map((group) => group.firstChild?.textContent);

const setSidebar = (overrides: Record<string, unknown> = {}) => {
    mockSidebar.current = {
        editingRule: rule(),
        isPlaceholder: false,
        activeFieldId: null,
        waitingFieldIds: [],
        highlightedFieldId: null,
        updateFilter,
        applyWithUndo,
        addFirstFieldOnTile,
        ...overrides,
    };
};

const card = (tileUuid: string) => within(container(tileUuid));
const container = (tileUuid: string) =>
    mockContainers.current[tileUuid] as HTMLElement;
// The trigger button, or the real select once it has been used
const select = (tileUuid: string) =>
    card(tileUuid).getByLabelText(/ on Title /, { selector: 'button, input' });
const renders = (tileUuid: string) =>
    renderCounts.current[`Status on Title ${tileUuid}`] ?? 0;
// The dimmed line above the select
const status = (tileUuid: string) =>
    container(tileUuid).querySelector('p')?.textContent;
const overlay = (tileUuid: string) =>
    container(tileUuid).firstElementChild as HTMLElement | null;
const clearButton = (tileUuid: string) =>
    card(tileUuid).queryByRole('button', { name: 'Stop filtering this tile' });

// Seeds the store's SQL chart metadata from `mockTileStatusContext` at render time
const renderWithProviders = (ui: ReactElement) => {
    const store = createDashboardTestStore({
        sqlChartTilesMetadata: mockTileStatusContext.current
            .sqlChartTilesMetadata as Record<string, SqlChartTileMetadata>,
        dashboardFilters: mockDashboardContext.current.dashboardFilters as
            | DashboardFilters
            | undefined,
    });
    seedDashboardEditState(
        store,
        mockDashboardContext.current as DashboardEditTestValues,
    );
    const wrap = (node: ReactElement) => (
        <DashboardStoreTestProvider store={store}>
            {node}
        </DashboardStoreTestProvider>
    );
    const result = renderWithAppProviders(wrap(ui));
    return {
        ...result,
        rerender: (node: ReactElement) => {
            act(() => {
                seedDashboardEditState(
                    store,
                    mockDashboardContext.current as DashboardEditTestValues,
                );
            });
            result.rerender(wrap(node));
        },
    };
};

describe('TileOverlays', () => {
    beforeEach(() => {
        updateFilter.mockClear();
        addFirstFieldOnTile.mockClear();
        renderCounts.current = {};
        document.body.innerHTML = '';
        mockContainers.current = Object.fromEntries(
            allTiles.map((t) => {
                const element = document.createElement('div');
                element.setAttribute('data-tile-uuid', t.uuid);
                document.body.appendChild(element);
                return [t.uuid, element];
            }),
        );
        mockDashboardContext.current = {
            dashboardTiles: [both, statusOnly, markdown, otherTab],
            dashboardTabs: [
                { uuid: 'tab-1', name: 'One', order: 0 },
                { uuid: 'tab-2', name: 'Two', order: 1 },
            ],
            activeTab: { uuid: 'tab-1', name: 'One', order: 0 },
            allFilterableMetricsMap: {},
            allFilterableFieldsMap: {
                orders_status: statusField,
                orders_region: regionField,
            },
            filterableFieldsByTileUuid: {
                [both.uuid]: [statusField, regionField],
                [statusOnly.uuid]: [statusField],
                [otherTab.uuid]: [statusField],
            },
        };
        mockTileStatusContext.current = { sqlChartTilesMetadata: {} };
        setSidebar();
    });

    describe('a hovered rail row', () => {
        // On "both" only: every other tile is left out
        const hovered = rule({
            id: 'hovered',
            tileTargets: {
                [statusOnly.uuid]: false,
                [otherTab.uuid]: false,
            },
        });
        beforeEach(() => {
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                dashboardFilters: {
                    dimensions: [rule(), hovered],
                    metrics: [],
                    tableCalculations: [],
                },
            };
        });

        it('rings the tiles its filter is on, over the edited filter', () => {
            setSidebar({
                editing: { filterId: 'control' },
                hoveredFilterId: 'hovered',
            });
            renderWithProviders(<TileOverlays />);

            expect(overlay(both.uuid)).toHaveAttribute(
                'data-highlighted',
                'mapped',
            );
            // On the edited filter, not on the hovered one
            expect(overlay(statusOnly.uuid)).not.toHaveAttribute(
                'data-highlighted',
            );
            expect(overlay(markdown.uuid)).not.toHaveAttribute(
                'data-highlighted',
            );
        });

        it('clears once the row is left', () => {
            setSidebar({
                editing: { filterId: 'control' },
                hoveredFilterId: 'hovered',
            });
            const { rerender } = renderWithProviders(<TileOverlays />);
            setSidebar({
                editing: { filterId: 'control' },
                hoveredFilterId: null,
            });
            rerender(<TileOverlays />);

            expect(overlay(statusOnly.uuid)).toHaveAttribute(
                'data-highlighted',
                'filtered',
            );
        });

        it('rings only its tiles on this tab, with no veil, while nothing is edited', () => {
            setSidebar({
                editing: null,
                editingRule: null,
                hoveredFilterId: 'hovered',
            });
            const { rerender } = renderWithProviders(<TileOverlays />);

            expect(
                container(both.uuid).querySelector('[class*="reach"]'),
            ).not.toBeNull();
            expect(
                container(both.uuid).querySelector('[data-controls-overlay]'),
            ).toBeNull();
            expect(container(statusOnly.uuid)).toBeEmptyDOMElement();
            expect(container(otherTab.uuid)).toBeEmptyDOMElement();

            setSidebar({
                editing: null,
                editingRule: null,
                hoveredFilterId: null,
            });
            rerender(<TileOverlays />);
            expect(container(both.uuid)).toBeEmptyDOMElement();
        });

        it('rings a tile on a field it no longer has, as the counts include it', () => {
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                dashboardFilters: {
                    dimensions: [
                        rule(),
                        {
                            ...hovered,
                            tileTargets: {
                                ...hovered.tileTargets,
                                [statusOnly.uuid]: {
                                    fieldId: 'orders_gone',
                                    tableName: 'orders',
                                },
                            },
                        },
                    ],
                    metrics: [],
                    tableCalculations: [],
                },
            };
            setSidebar({
                editing: null,
                editingRule: null,
                hoveredFilterId: 'hovered',
            });
            renderWithProviders(<TileOverlays />);

            expect(
                container(statusOnly.uuid).querySelector('[class*="reach"]'),
            ).not.toBeNull();
        });
    });

    it('shows the field a filterable tile is filtered by', () => {
        renderWithProviders(<TileOverlays />);

        expect(status(both.uuid)).toBe('This tile is filtered on');
        expect(select(both.uuid)).toHaveTextContent('Status');
        expect(select(both.uuid)).toHaveAccessibleName(
            'Status on Title tile-both',
        );
    });

    it('keeps the real select out of the DOM until the trigger is used', async () => {
        renderWithProviders(<TileOverlays />);

        const trigger = select(both.uuid);
        expect(trigger.tagName).toBe('BUTTON');
        expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
        expect(trigger).toHaveAttribute('aria-expanded', 'false');
        expect(
            screen.queryByRole('option', { hidden: true }),
        ).not.toBeInTheDocument();

        await userEvent.click(trigger);

        const opened = select(both.uuid);
        expect(opened.tagName).toBe('INPUT');
        expect(opened).toHaveValue('Status');
        expect(opened).toHaveAccessibleName('Status on Title tile-both');
        expect(opened).toHaveFocus();
        expect(opened).toHaveAttribute('aria-expanded', 'true');
        // The other tiles still have only their trigger
        expect(select(statusOnly.uuid).tagName).toBe('BUTTON');
    });

    it.each(['{Enter}', ' ', '{ArrowDown}'])(
        'opens the list from the keyboard with %s',
        async (key) => {
            renderWithProviders(<TileOverlays />);

            select(both.uuid).focus();
            await userEvent.keyboard(key);

            expect(select(both.uuid)).toHaveAttribute('aria-expanded', 'true');
            expect(
                screen
                    .getAllByRole('option', { hidden: true })
                    .map((option) => option.textContent),
            ).toEqual(['Region', 'Status']);
        },
    );

    it('marks filtered tiles as filtered and the ones that could be as available while no field is active', () => {
        setSidebar({
            editingRule: rule({ tileTargets: { [both.uuid]: false } }),
        });
        renderWithProviders(<TileOverlays />);

        expect(overlay(statusOnly.uuid)).toHaveAttribute(
            'data-highlighted',
            'filtered',
        );
        // Filterable, but left out
        expect(overlay(both.uuid)).toHaveAttribute(
            'data-highlighted',
            'available',
        );
        expect(overlay(markdown.uuid)).not.toHaveAttribute('data-highlighted');
    });

    it('shows an empty select with a placeholder on a tile that is not filtered', async () => {
        setSidebar({
            editingRule: rule({ tileTargets: { [both.uuid]: false } }),
        });
        renderWithProviders(<TileOverlays />);

        expect(status(both.uuid)).toBe('This tile is not filtered');
        expect(select(both.uuid)).toHaveTextContent('Select a field');
        expect(clearButton(both.uuid)).not.toBeInTheDocument();
        expect(clearButton(statusOnly.uuid)).toBeInTheDocument();

        await userEvent.click(select(both.uuid));

        const opened = select(both.uuid);
        expect(opened).toHaveValue('');
        expect(opened).toHaveAttribute('placeholder', 'Select a field');
        expect(clearButton(both.uuid)).not.toBeInTheDocument();
        expect(
            screen
                .getAllByRole('option', { hidden: true })
                .map((option) => option.textContent),
        ).toEqual(['Region', 'Status']);
    });

    it('marks a SQL chart tile as available, and as mapped once it is on a column', () => {
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            dashboardTiles: [sql],
        };
        mockTileStatusContext.current = {
            sqlChartTilesMetadata: {
                [sql.uuid]: {
                    columns: [
                        { reference: 'status_col', type: DimensionType.STRING },
                    ],
                },
            },
        };
        setSidebar();
        const { rerender } = renderWithProviders(<TileOverlays />);
        expect(overlay(sql.uuid)).toHaveAttribute(
            'data-highlighted',
            'available',
        );

        setSidebar({
            editingRule: rule({
                tileTargets: {
                    [sql.uuid]: {
                        fieldId: 'status_col',
                        tableName: 'mock_table',
                        isSqlColumn: true,
                    },
                },
            }),
        });
        rerender(<TileOverlays />);
        expect(overlay(sql.uuid)).toHaveAttribute(
            'data-highlighted',
            'filtered',
        );
    });

    it('re-renders only the tiles whose highlight changes with the active field', () => {
        const editingRule = rule({
            tileTargets: {
                [both.uuid]: { fieldId: 'orders_region', tableName: 'orders' },
            },
        });
        // No active field: both are filtered
        setSidebar({ editingRule });
        const { rerender } = renderWithProviders(<TileOverlays />);
        expect(overlay(both.uuid)).toHaveAttribute(
            'data-highlighted',
            'filtered',
        );
        expect(overlay(statusOnly.uuid)).toHaveAttribute(
            'data-highlighted',
            'filtered',
        );
        expect(renders(both.uuid)).toBe(1);
        expect(renders(statusOnly.uuid)).toBe(1);

        // The field "both" is on: it is mapped, the other tile is on
        // another field
        setSidebar({ editingRule, activeFieldId: 'orders_region' });
        rerender(<TileOverlays />);
        expect(overlay(both.uuid)).toHaveAttribute(
            'data-highlighted',
            'mapped',
        );
        expect(overlay(statusOnly.uuid)).toHaveAttribute(
            'data-highlighted',
            'other',
        );
        expect(renders(both.uuid)).toBe(2);
        expect(renders(statusOnly.uuid)).toBe(2);

        // A field neither tile is on: "both" changes, the other tile does not
        setSidebar({ editingRule, activeFieldId: 'orders_other' });
        rerender(<TileOverlays />);
        expect(overlay(both.uuid)).toHaveAttribute('data-highlighted', 'other');
        expect(overlay(statusOnly.uuid)).toHaveAttribute(
            'data-highlighted',
            'other',
        );
        expect(renders(both.uuid)).toBe(3);
        expect(renders(statusOnly.uuid)).toBe(2);

        // No active field again: both go back to filtered, so both render
        setSidebar({ editingRule });
        rerender(<TileOverlays />);
        expect(renders(both.uuid)).toBe(4);
        expect(renders(statusOnly.uuid)).toBe(3);

        // Nothing changed for either tile
        setSidebar({ editingRule, waitingFieldIds: [] });
        rerender(<TileOverlays />);
        expect(renders(both.uuid)).toBe(4);
        expect(renders(statusOnly.uuid)).toBe(3);
    });

    it('never re-renders a tile that is not filtered when the active field changes', () => {
        const editingRule = rule({ tileTargets: { [both.uuid]: false } });
        setSidebar({ editingRule });
        const { rerender } = renderWithProviders(<TileOverlays />);
        expect(renders(both.uuid)).toBe(1);
        expect(renders(statusOnly.uuid)).toBe(1);

        // A field it offers and the filtered tile is not on
        setSidebar({ editingRule, activeFieldId: 'orders_region' });
        rerender(<TileOverlays />);
        expect(renders(both.uuid)).toBe(1);
        expect(renders(statusOnly.uuid)).toBe(2);

        // The field the filtered tile is on
        setSidebar({ editingRule, activeFieldId: 'orders_status' });
        rerender(<TileOverlays />);
        expect(renders(both.uuid)).toBe(1);
        expect(renders(statusOnly.uuid)).toBe(3);

        // At rest the filtered tile goes back to filtered
        setSidebar({ editingRule });
        rerender(<TileOverlays />);
        expect(overlay(both.uuid)).toHaveAttribute(
            'data-highlighted',
            'available',
        );
        expect(renders(both.uuid)).toBe(1);
        expect(renders(statusOnly.uuid)).toBe(4);
    });

    it('re-renders only the tile whose mapping changes', async () => {
        const { rerender } = renderWithProviders(<TileOverlays />);
        expect(renders(both.uuid)).toBe(1);
        expect(renders(statusOnly.uuid)).toBe(1);

        setSidebar({
            editingRule: rule({ tileTargets: { [both.uuid]: false } }),
        });
        rerender(<TileOverlays />);

        expect(status(both.uuid)).toBe('This tile is not filtered');
        expect(renders(both.uuid)).toBe(2);
        expect(renders(statusOnly.uuid)).toBe(1);

        // The handler is one stable function, yet it writes onto the latest rule
        await userEvent.click(clearButton(statusOnly.uuid)!);
        expect(updateFilter.mock.calls[0][0].tileTargets).toEqual({
            [both.uuid]: false,
            [statusOnly.uuid]: false,
        });
    });

    it('only covers the tiles on the active tab', () => {
        renderWithProviders(<TileOverlays />);

        expect(overlay(statusOnly.uuid)).not.toBeNull();
        expect(overlay(otherTab.uuid)).toBeNull();
    });

    it('buckets the overlays by tile order for the arrival wave', () => {
        renderWithProviders(<TileOverlays />);

        expect(overlay(both.uuid)).toHaveAttribute('data-wave', '0');
        expect(overlay(statusOnly.uuid)).toHaveAttribute('data-wave', '1');
        expect(overlay(markdown.uuid)).toHaveAttribute('data-wave', '2');
    });

    it('wraps the wave after six tiles', () => {
        const seventh = tile('tile-seventh', 'tab-1');
        const element = document.createElement('div');
        element.setAttribute('data-tile-uuid', seventh.uuid);
        document.body.appendChild(element);
        mockContainers.current[seventh.uuid] = element;
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            dashboardTiles: [
                ...['a', 'b', 'c', 'd', 'e', 'f'].map((id) =>
                    tile(`tile-${id}`, 'tab-1'),
                ),
                seventh,
            ],
        };
        renderWithProviders(<TileOverlays />);

        expect(overlay(seventh.uuid)).toHaveAttribute('data-wave', '0');
    });

    it('leaves a tile out when its select is cleared, without opening the list', async () => {
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            dashboardTiles: [both],
        };
        renderWithProviders(<TileOverlays />);

        await userEvent.click(clearButton(both.uuid)!);

        expect(updateFilter).toHaveBeenCalledTimes(1);
        expect(updateFilter.mock.calls[0][0].tileTargets[both.uuid]).toBe(
            false,
        );
        // Still the trigger: clearing did not mount the real select
        expect(select(both.uuid).tagName).toBe('BUTTON');
        expect(
            screen.queryByRole('option', { hidden: true }),
        ).not.toBeInTheDocument();
    });

    it('leaves a tile out when the opened select is cleared, with no "Not filtered" option', async () => {
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            dashboardTiles: [both],
        };
        renderWithProviders(<TileOverlays />);

        await userEvent.click(select(both.uuid));
        expect(
            screen
                .getAllByRole('option', { hidden: true })
                .map((option) => option.textContent),
        ).toEqual(['Region', 'Status']);
        await userEvent.click(clearButton(both.uuid)!);

        expect(updateFilter).toHaveBeenCalledTimes(1);
        expect(updateFilter.mock.calls[0][0].tileTargets[both.uuid]).toBe(
            false,
        );
    });

    describe('clearing the last tile of a field', () => {
        const removeWaitingField = vi.fn();
        const removeLastField = vi.fn();
        const clearHighlightedField = vi.fn();
        const REGION = { fieldId: 'orders_region', tableName: 'orders' };

        beforeEach(() => {
            removeWaitingField.mockClear();
            removeLastField.mockClear();
            clearHighlightedField.mockClear();
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                dashboardTiles: [both, statusOnly],
            };
        });

        it('removes a secondary field instead of leaving it waiting', async () => {
            setSidebar({
                editingRule: rule({ tileTargets: { [both.uuid]: REGION } }),
                highlightedFieldId: 'orders_region',
                removeWaitingField,
                removeLastField,
                clearHighlightedField,
            });
            renderWithProviders(<TileOverlays />);

            await userEvent.click(clearButton(both.uuid)!);

            expect(updateFilter).toHaveBeenCalledTimes(1);
            const next = updateFilter.mock.calls[0][0];
            expect(next.target).toEqual(rule().target);
            // Left unfiltered, not moved to the first field
            expect(next.tileTargets).toEqual({ [both.uuid]: false });
            expect(removeWaitingField).toHaveBeenCalledWith('orders_region');
            expect(clearHighlightedField).toHaveBeenCalledTimes(1);
            expect(removeLastField).not.toHaveBeenCalled();
        });

        it('removes the first field and promotes the next one', async () => {
            setSidebar({
                editingRule: rule({ tileTargets: { [both.uuid]: REGION } }),
                removeWaitingField,
                removeLastField,
                clearHighlightedField,
            });
            renderWithProviders(<TileOverlays />);

            await userEvent.click(clearButton(statusOnly.uuid)!);

            expect(updateFilter).toHaveBeenCalledTimes(1);
            expect(updateFilter.mock.calls[0][0].target).toEqual(REGION);
            expect(removeWaitingField).toHaveBeenCalledWith('orders_status');
            expect(clearHighlightedField).not.toHaveBeenCalled();
        });

        it("keeps the filter's only field, leaving the tile out", async () => {
            setSidebar({
                editingRule: rule({ tileTargets: { [both.uuid]: false } }),
                removeWaitingField,
                removeLastField,
            });
            renderWithProviders(<TileOverlays />);

            await userEvent.click(clearButton(statusOnly.uuid)!);

            expect(updateFilter).toHaveBeenCalledTimes(1);
            expect(updateFilter.mock.calls[0][0].tileTargets).toEqual({
                [both.uuid]: false,
                [statusOnly.uuid]: false,
            });
            expect(removeLastField).not.toHaveBeenCalled();
            expect(removeWaitingField).not.toHaveBeenCalled();
        });

        it('only leaves the tile out while the field has other tiles', async () => {
            setSidebar({
                editingRule: rule({ tileTargets: { [both.uuid]: REGION } }),
                removeWaitingField,
                removeLastField,
            });
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                dashboardTiles: [both, statusOnly, otherTab],
            };
            renderWithProviders(<TileOverlays />);

            await userEvent.click(clearButton(statusOnly.uuid)!);

            expect(updateFilter.mock.calls[0][0].target).toEqual(rule().target);
            expect(
                updateFilter.mock.calls[0][0].tileTargets[statusOnly.uuid],
            ).toBe(false);
            expect(removeWaitingField).not.toHaveBeenCalled();
        });
    });

    it('clears from the keyboard and keeps focus on the select', async () => {
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            dashboardTiles: [both],
        };
        renderWithProviders(<TileOverlays />);

        select(both.uuid).focus();
        await userEvent.tab();
        expect(clearButton(both.uuid)).toHaveFocus();
        await userEvent.keyboard('{Enter}');

        expect(updateFilter.mock.calls[0][0].tileTargets[both.uuid]).toBe(
            false,
        );
        expect(select(both.uuid)).toHaveFocus();
    });

    it('veils a tile that cannot take the filter without a card', () => {
        renderWithProviders(<TileOverlays />);

        expect(overlay(markdown.uuid)).not.toBeNull();
        expect(overlay(markdown.uuid)?.textContent).toBe('');
    });

    it("veils a tile with none of the filter's fields and none it could add, with no text", () => {
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            allFilterableFieldsMap: {
                orders_status: statusField,
                orders_amount: amountField,
            },
            filterableFieldsByTileUuid: {
                [both.uuid]: [statusField, regionField],
                [statusOnly.uuid]: [amountField],
            },
        };
        renderWithProviders(<TileOverlays />);

        expect(overlay(statusOnly.uuid)?.textContent).toBe('');
        expect(overlay(statusOnly.uuid)).not.toHaveAttribute(
            'data-highlighted',
        );
        expect(overlay(statusOnly.uuid)).toHaveAttribute(
            'title',
            'This tile has no field this filter can use',
        );
    });

    describe('adding a field from a tile', () => {
        const allOptions = () =>
            screen
                .getAllByRole('option', { hidden: true })
                .map((option) => option.textContent);

        it('lists the other fields of the kind the tile offers too', async () => {
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                allFilterableFieldsMap: {
                    orders_status: statusField,
                    orders_region: regionField,
                    orders_amount: amountField,
                },
                filterableFieldsByTileUuid: {
                    [both.uuid]: [statusField, regionField, amountField],
                    [statusOnly.uuid]: [statusField],
                },
            };
            renderWithProviders(<TileOverlays />);

            await userEvent.click(select(both.uuid));

            // The filter's own field and what the tile could add, grouped by
            // table as the shipped field select does; Amount is another kind
            expect(allOptions()).toEqual(['Region', 'Status']);
            expect(groupLabels()).toEqual(['Orders']);
        });

        it('lists only its own field on a tile that offers nothing else', async () => {
            renderWithProviders(<TileOverlays />);

            await userEvent.click(select(statusOnly.uuid));

            expect(allOptions()).toEqual(['Status']);
            // The shipped field select groups by table
            expect(groupLabels()).toEqual(['Orders']);
            expect(
                screen.queryByText('In this filter'),
            ).not.toBeInTheDocument();
            // Short: it is not searchable
            expect(select(statusOnly.uuid)).toHaveAttribute('readonly');
        });

        it('maps only this tile to another field chosen from it', async () => {
            const third = tile('tile-third', 'tab-1');
            const element = document.createElement('div');
            document.body.appendChild(element);
            mockContainers.current[third.uuid] = element;
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                dashboardTiles: [both, statusOnly, third],
                filterableFieldsByTileUuid: {
                    [both.uuid]: [statusField, regionField],
                    [statusOnly.uuid]: [statusField],
                    [third.uuid]: [statusField, regionField],
                },
            };
            renderWithProviders(<TileOverlays />);

            await userEvent.click(select(both.uuid));
            await userEvent.click(
                screen.getByRole('option', {
                    name: 'Region',
                    hidden: true,
                }),
            );

            expect(updateFilter).toHaveBeenCalledTimes(1);
            const next = updateFilter.mock.calls[0][0];
            expect(next.target).toEqual(rule().target);
            // Nothing for the other tile that offers Region
            expect(next.tileTargets).toEqual({
                [both.uuid]: { fieldId: 'orders_region', tableName: 'orders' },
            });
        });

        describe('on a date with time grains', () => {
            beforeEach(() => {
                mockDashboardContext.current = {
                    ...mockDashboardContext.current,
                    dashboardTiles: [both, statusOnly],
                    allFilterableFieldsMap: {
                        orders_status: statusField,
                        orders_created_day: createdDay,
                        orders_created_week: createdWeek,
                        orders_created_month: createdMonth,
                    },
                    filterableFieldsByTileUuid: {
                        [both.uuid]: [
                            createdMonth,
                            statusField,
                            createdWeek,
                            createdDay,
                        ],
                        [statusOnly.uuid]: [statusField],
                    },
                };
                setSidebar({
                    editingRule: rule({
                        target: {
                            fieldId: 'orders_created_day',
                            tableName: 'orders',
                        },
                    }),
                });
            });

            it('names the tile by the grain it is filtered by', () => {
                renderWithProviders(<TileOverlays />);

                expect(select(both.uuid)).toHaveTextContent('Created day');
                expect(select(both.uuid)).toHaveAccessibleName(
                    'Created day on Title tile-both',
                );
            });

            it('lists each other grain of the date the filter is on', async () => {
                renderWithProviders(<TileOverlays />);

                await userEvent.click(select(both.uuid));

                expect(allOptions()).toEqual([
                    'Created day',
                    'Created week',
                    'Created month',
                ]);
            });

            it('writes the chosen grain to this tile', async () => {
                renderWithProviders(<TileOverlays />);

                await userEvent.click(select(both.uuid));
                await userEvent.click(
                    screen.getByRole('option', {
                        name: 'Created month',
                        hidden: true,
                    }),
                );

                expect(updateFilter).toHaveBeenCalledTimes(1);
                expect(updateFilter.mock.calls[0][0].tileTargets).toEqual({
                    [both.uuid]: {
                        fieldId: 'orders_created_month',
                        tableName: 'orders',
                    },
                });
            });
        });

        it('lists a field that joined the filter on the other tiles', async () => {
            const third = tile('tile-third', 'tab-1');
            const element = document.createElement('div');
            document.body.appendChild(element);
            mockContainers.current[third.uuid] = element;
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                dashboardTiles: [both, third],
                filterableFieldsByTileUuid: {
                    [both.uuid]: [statusField, regionField],
                    [third.uuid]: [statusField, regionField],
                },
            };
            setSidebar({
                editingRule: rule({
                    tileTargets: {
                        [both.uuid]: {
                            fieldId: 'orders_region',
                            tableName: 'orders',
                        },
                    },
                }),
            });
            renderWithProviders(<TileOverlays />);

            await userEvent.click(select(third.uuid));

            expect(allOptions()).toEqual(['Region', 'Status']);
            // The shipped field select groups by table
            expect(groupLabels()).toEqual(['Orders']);
        });

        it('does not repeat a waiting field', async () => {
            setSidebar({ waitingFieldIds: ['orders_region'] });
            renderWithProviders(<TileOverlays />);

            await userEvent.click(select(both.uuid));

            expect(allOptions()).toEqual(['Region', 'Status']);
            // The shipped field select groups by table
            expect(groupLabels()).toEqual(['Orders']);
        });

        it('tells apart entries that read the same by their table group', async () => {
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                allFilterableFieldsMap: {
                    orders_status: statusField,
                    orders_region: regionField,
                    customers_status: customerStatusField,
                },
                filterableFieldsByTileUuid: {
                    [both.uuid]: [
                        statusField,
                        regionField,
                        customerStatusField,
                    ],
                },
            };
            renderWithProviders(<TileOverlays />);

            await userEvent.click(select(both.uuid));

            expect(allOptions()).toEqual(['Status', 'Region', 'Status']);
            expect(groupLabels()).toEqual(['Customers', 'Orders']);
        });

        it('has no second group on a SQL chart tile', async () => {
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                dashboardTiles: [sql],
                filterableFieldsByTileUuid: {
                    [sql.uuid]: [statusField, regionField],
                },
            };
            mockTileStatusContext.current = {
                sqlChartTilesMetadata: {
                    [sql.uuid]: {
                        columns: [
                            {
                                reference: 'status_col',
                                type: DimensionType.STRING,
                            },
                        ],
                    },
                },
            };
            renderWithProviders(<TileOverlays />);

            await userEvent.click(select(sql.uuid));

            expect(allOptions()).toEqual(['status_col']);
            expect(
                screen.queryByRole('group', { hidden: true }),
            ).not.toBeInTheDocument();
        });

        it('reaches a tile that offers only a field it could add', async () => {
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                filterableFieldsByTileUuid: {
                    [both.uuid]: [statusField, regionField],
                    [statusOnly.uuid]: [regionField],
                },
            };
            renderWithProviders(<TileOverlays />);

            expect(overlay(statusOnly.uuid)).toHaveAttribute(
                'data-highlighted',
                'available',
            );
            expect(status(statusOnly.uuid)).toBe('This tile is not filtered');
            expect(select(statusOnly.uuid)).toHaveTextContent('Select a field');
            expect(clearButton(statusOnly.uuid)).not.toBeInTheDocument();

            await userEvent.click(select(statusOnly.uuid));

            // One group only: a plain list with no label, still searchable
            expect(allOptions()).toEqual(['Region']);
            // The shipped field select groups by table
            expect(groupLabels()).toEqual(['Orders']);
            expect(
                screen.queryByText('Other fields on this tile'),
            ).not.toBeInTheDocument();
            expect(select(statusOnly.uuid)).not.toHaveAttribute('readonly');
        });

        it('searches the grouped dropdown by the visible label', async () => {
            renderWithProviders(<TileOverlays />);

            await userEvent.click(select(both.uuid));
            const opened = select(both.uuid);
            expect(opened).not.toHaveAttribute('readonly');
            expect(opened).toHaveAccessibleName('Status on Title tile-both');

            await userEvent.clear(opened);
            await userEvent.type(opened, 'reg');

            expect(allOptions()).toEqual(['Region']);
        });

        it('is searchable past eight entries without a second group', async () => {
            const waiting = Array.from({ length: 8 }, (_, index) =>
                dimension(`extra_${index}`, `Extra ${index}`),
            );
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                allFilterableFieldsMap: Object.fromEntries(
                    [statusField, ...waiting].map((field) => [
                        `orders_${field.name}`,
                        field,
                    ]),
                ),
                filterableFieldsByTileUuid: {
                    [statusOnly.uuid]: [statusField, ...waiting],
                },
            };
            setSidebar({
                waitingFieldIds: waiting.map((field) => `orders_${field.name}`),
            });
            renderWithProviders(<TileOverlays />);

            await userEvent.click(select(statusOnly.uuid));

            expect(allOptions()).toHaveLength(9);
            expect(select(statusOnly.uuid)).not.toHaveAttribute('readonly');
        });

        it('re-renders no tile when a field is hovered or the rule changes without its fields', () => {
            const editingRule = rule({ tileTargets: { [both.uuid]: false } });
            setSidebar({ editingRule });
            const { rerender } = renderWithProviders(<TileOverlays />);
            expect(renders(both.uuid)).toBe(1);

            // Hovering Region: the tile is not filtered, so nothing changes
            setSidebar({ editingRule, activeFieldId: 'orders_region' });
            rerender(<TileOverlays />);
            expect(renders(both.uuid)).toBe(1);
            // The filtered tile is now on another field than the active one
            expect(renders(statusOnly.uuid)).toBe(2);

            // A new rule object with the same fields and mapping
            setSidebar({
                editingRule: { ...editingRule, values: ['completed'] },
                activeFieldId: 'orders_region',
            });
            rerender(<TileOverlays />);
            expect(renders(both.uuid)).toBe(1);
            expect(renders(statusOnly.uuid)).toBe(2);
        });
    });

    it('marks every veil for the grid so a drag never starts on it', () => {
        renderWithProviders(<TileOverlays />);

        // The grid's draggableCancel selector
        expect(overlay(markdown.uuid)).toHaveClass('non-draggable');
        expect(overlay(both.uuid)).toHaveClass('non-draggable');
        expect(overlay(both.uuid)).toHaveAttribute('data-controls-overlay');
    });

    it('lets a mouse down on a veil reach the document', () => {
        const onMouseDown = vi.fn();
        document.addEventListener('mousedown', onMouseDown);
        renderWithProviders(<TileOverlays />);

        fireEvent.mouseDown(overlay(markdown.uuid)!);
        fireEvent.mouseDown(overlay(both.uuid)!);
        document.removeEventListener('mousedown', onMouseDown);

        expect(onMouseDown).toHaveBeenCalledTimes(2);
    });

    it('closes an open list without search when another tile is pressed', async () => {
        renderWithProviders(<TileOverlays />);

        await userEvent.click(select(statusOnly.uuid));
        // One field and nothing to add: this list has no search box
        expect(select(statusOnly.uuid)).toHaveAttribute('readonly');
        expect(select(statusOnly.uuid)).toHaveAttribute(
            'aria-expanded',
            'true',
        );

        await userEvent.click(overlay(both.uuid)!);
        expect(select(statusOnly.uuid)).toHaveAttribute(
            'aria-expanded',
            'false',
        );
    });

    it('keeps one list open at a time', async () => {
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            filterableFieldsByTileUuid: {
                [both.uuid]: [statusField],
                [statusOnly.uuid]: [statusField],
            },
        };
        renderWithProviders(<TileOverlays />);

        await userEvent.click(select(statusOnly.uuid));
        await userEvent.click(select(both.uuid));

        expect(select(both.uuid)).toHaveAttribute('aria-expanded', 'true');
        expect(select(statusOnly.uuid)).toHaveAttribute(
            'aria-expanded',
            'false',
        );
    });

    it('does not reopen the list when the opened select is cleared from the keyboard', async () => {
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            dashboardTiles: [both],
        };
        renderWithProviders(<TileOverlays />);

        // The first click opens the list
        await userEvent.click(select(both.uuid));
        expect(select(both.uuid)).toHaveAttribute('aria-expanded', 'true');
        await userEvent.keyboard('{Escape}');
        expect(select(both.uuid)).toHaveAttribute('aria-expanded', 'false');

        await userEvent.tab();
        expect(clearButton(both.uuid)).toHaveFocus();
        await userEvent.keyboard('{Enter}');

        expect(updateFilter.mock.calls[0][0].tileTargets[both.uuid]).toBe(
            false,
        );
        expect(select(both.uuid)).toHaveFocus();
        expect(select(both.uuid)).toHaveAttribute('aria-expanded', 'false');
    });

    it('closes the list once its select is covered while the page scrolls', async () => {
        const original = document.elementFromPoint;
        renderWithProviders(<TileOverlays />);
        await userEvent.click(select(statusOnly.uuid));

        // Still in view: the select is what sits at its own centre
        document.elementFromPoint = () => select(statusOnly.uuid);
        fireEvent.scroll(window);
        expect(select(statusOnly.uuid)).toHaveAttribute(
            'aria-expanded',
            'true',
        );

        // Under the pinned bar: something else is on top
        document.elementFromPoint = () => document.body;
        fireEvent.scroll(window);
        expect(select(statusOnly.uuid)).toHaveAttribute(
            'aria-expanded',
            'false',
        );
        document.elementFromPoint = original;
    });

    describe('a new control with no field yet', () => {
        const placeholder = (label?: string) =>
            rule({ label, target: { fieldId: '', tableName: '' } });
        const newRenders = (tileUuid: string) =>
            renderCounts.current[`New filter on Title ${tileUuid}`] ?? 0;
        const allOptions = () =>
            screen
                .getAllByRole('option', { hidden: true })
                .map((option) => option.textContent);
        const choose = (name: string) =>
            userEvent.click(screen.getByRole('option', { name, hidden: true }));

        beforeEach(() => {
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                dashboardTiles: [both, statusOnly, markdown, otherTab],
                allFilterableFieldsMap: {
                    orders_status: statusField,
                    orders_region: regionField,
                    orders_amount: amountField,
                    orders_created_day: createdDay,
                    orders_created_month: createdMonth,
                },
                filterableFieldsByTileUuid: {
                    [both.uuid]: [
                        statusField,
                        regionField,
                        amountField,
                        createdMonth,
                        createdDay,
                    ],
                    [statusOnly.uuid]: [statusField],
                    [otherTab.uuid]: [statusField],
                },
            };
            setSidebar({ editingRule: placeholder(), isPlaceholder: true });
        });

        it('shows an empty card on every tile it could start from', () => {
            renderWithProviders(<TileOverlays />);

            [both, statusOnly].forEach((t) => {
                expect(overlay(t.uuid)).toHaveAttribute(
                    'data-highlighted',
                    'available',
                );
                expect(status(t.uuid)).toBe('This tile is not filtered');
                expect(clearButton(t.uuid)).not.toBeInTheDocument();
                expect(select(t.uuid).tagName).toBe('BUTTON');
            });
            expect(select(statusOnly.uuid)).toHaveTextContent('Select a field');
            expect(select(statusOnly.uuid)).toHaveAccessibleName(
                'New filter on Title tile-status',
            );
            expect(select(both.uuid)).toHaveTextContent('Select a field');
            expect(overlay(otherTab.uuid)).toBeNull();
        });

        it('veils a tile with no fields, with no card', () => {
            renderWithProviders(<TileOverlays />);

            expect(overlay(markdown.uuid)).not.toHaveAttribute(
                'data-highlighted',
            );
            expect(overlay(markdown.uuid)?.textContent).toBe('');
            expect(overlay(markdown.uuid)).toHaveAttribute(
                'title',
                'This tile has no field this filter can use',
            );
        });

        it('keeps a SQL chart tile out of reach, whatever it reports', () => {
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                dashboardTiles: [sql],
                filterableFieldsByTileUuid: { [sql.uuid]: [statusField] },
            };
            mockTileStatusContext.current = {
                sqlChartTilesMetadata: {
                    [sql.uuid]: {
                        columns: [
                            {
                                reference: 'status_col',
                                type: DimensionType.STRING,
                            },
                        ],
                    },
                },
            };
            renderWithProviders(<TileOverlays />);

            expect(overlay(sql.uuid)).not.toHaveAttribute('data-highlighted');
            expect(overlay(sql.uuid)?.textContent).toBe('');
        });

        it('lists the fields of every kind, each grain of a date included', async () => {
            renderWithProviders(<TileOverlays />);

            await userEvent.click(select(both.uuid));

            expect(allOptions()).toEqual([
                'Amount',
                'Created day',
                'Created month',
                'Region',
                'Status',
            ]);
            // The shipped field select groups by table
            expect(groupLabels()).toEqual(['Orders']);
            expect(select(both.uuid)).toHaveAttribute(
                'placeholder',
                'Select a field',
            );
        });

        it("shows none of the rail's own group labels", async () => {
            renderWithProviders(<TileOverlays />);

            await userEvent.click(select(statusOnly.uuid));

            expect(allOptions()).toEqual(['Status']);
            // The shipped field select groups by table
            expect(groupLabels()).toEqual(['Orders']);
            expect(
                screen.queryByText('Fields on this tile'),
            ).not.toBeInTheDocument();
        });

        it('tells apart two fields that read the same by their table group', async () => {
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                allFilterableFieldsMap: {
                    orders_status: statusField,
                    customers_status: customerStatusField,
                },
                filterableFieldsByTileUuid: {
                    [statusOnly.uuid]: [statusField, customerStatusField],
                },
            };
            renderWithProviders(<TileOverlays />);

            await userEvent.click(select(statusOnly.uuid));

            expect(allOptions()).toEqual(['Status', 'Status']);
            expect(groupLabels()).toEqual(['Customers', 'Orders']);
        });

        it('starts the filter from the chosen grain on this tile', async () => {
            renderWithProviders(<TileOverlays />);

            await userEvent.click(select(both.uuid));
            await choose('Created month');

            expect(addFirstFieldOnTile).toHaveBeenCalledTimes(1);
            expect(addFirstFieldOnTile).toHaveBeenCalledWith(
                createdMonth,
                both.uuid,
            );
            expect(updateFilter).not.toHaveBeenCalled();
        });

        it('re-renders no tile card while a label is typed', () => {
            const { rerender } = renderWithProviders(<TileOverlays />);
            expect(newRenders(both.uuid)).toBe(1);
            expect(newRenders(statusOnly.uuid)).toBe(1);

            ['R', 'Re', 'Region'].forEach((label) => {
                setSidebar({
                    editingRule: placeholder(label),
                    isPlaceholder: true,
                });
                rerender(<TileOverlays />);
            });
            setSidebar({
                editingRule: placeholder('Region'),
                isPlaceholder: true,
                activeFieldId: 'orders_region',
            });
            rerender(<TileOverlays />);

            expect(newRenders(both.uuid)).toBe(1);
            expect(newRenders(statusOnly.uuid)).toBe(1);
        });
    });

    it('says on hover that tiles are locked while a filter is edited', () => {
        renderWithProviders(<TileOverlays />);

        expect(overlay(both.uuid)).toHaveAttribute(
            'title',
            'Tiles are locked while a filter is edited',
        );
    });

    it('reads the controls context through selectors only', () => {
        wholeContextReads.current = 0;
        renderWithProviders(<TileOverlays />);

        expect(overlay(both.uuid)).not.toBeNull();
        expect(wholeContextReads.current).toBe(0);
    });

    it('renders nothing when no control is edited', () => {
        setSidebar({ editingRule: null });
        renderWithProviders(<TileOverlays />);

        allTiles.forEach((t) => expect(overlay(t.uuid)).toBeNull());
    });

    it('marks a tile on another field as other, whether or not it offers the active field', () => {
        setSidebar({ activeFieldId: 'orders_region' });
        renderWithProviders(<TileOverlays />);

        // Offers Region
        expect(overlay(both.uuid)).toHaveAttribute('data-highlighted', 'other');
        // Does not
        expect(overlay(statusOnly.uuid)).toHaveAttribute(
            'data-highlighted',
            'other',
        );
        expect(overlay(markdown.uuid)).not.toHaveAttribute('data-highlighted');
        // The select is the one way to switch, its clear button the way out
        expect(card(both.uuid).getAllByRole('button')).toEqual([
            select(both.uuid),
            clearButton(both.uuid),
        ]);
    });

    it('offers a waiting field in the select of a tile that could take it', async () => {
        setSidebar({ waitingFieldIds: ['orders_region'] });
        renderWithProviders(<TileOverlays />);
        await userEvent.click(select(both.uuid));

        const names = screen
            .getAllByRole('option', { hidden: true })
            .map((option) => option.textContent);
        expect(names).toContain('Region');
    });

    it('keeps an unfiltered tile available, whether or not it offers the active field', () => {
        // Offers Region
        setSidebar({
            editingRule: rule({ tileTargets: { [both.uuid]: false } }),
            activeFieldId: 'orders_region',
        });
        const { rerender } = renderWithProviders(<TileOverlays />);
        expect(overlay(both.uuid)).toHaveAttribute(
            'data-highlighted',
            'available',
        );

        // Does not
        setSidebar({
            editingRule: rule({ tileTargets: { [statusOnly.uuid]: false } }),
            activeFieldId: 'orders_region',
        });
        rerender(<TileOverlays />);
        expect(status(statusOnly.uuid)).toBe('This tile is not filtered');
        expect(overlay(statusOnly.uuid)).toHaveAttribute(
            'data-highlighted',
            'available',
        );
        expect(overlay(markdown.uuid)).not.toHaveAttribute('data-highlighted');
    });

    it('marks a SQL chart tile on a column as other while a field is active', () => {
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            dashboardTiles: [sql],
        };
        mockTileStatusContext.current = {
            sqlChartTilesMetadata: {
                [sql.uuid]: {
                    columns: [
                        { reference: 'status_col', type: DimensionType.STRING },
                    ],
                },
            },
        };
        setSidebar({
            editingRule: rule({
                tileTargets: {
                    [sql.uuid]: {
                        fieldId: 'status_col',
                        tableName: 'mock_table',
                        isSqlColumn: true,
                    },
                },
            }),
            activeFieldId: 'orders_status',
        });
        renderWithProviders(<TileOverlays />);

        expect(overlay(sql.uuid)).toHaveAttribute('data-highlighted', 'other');
    });

    it('marks an unfiltered tile as available and a tile on the field as mapped', () => {
        setSidebar({
            editingRule: rule({ tileTargets: { [both.uuid]: false } }),
            activeFieldId: 'orders_status',
        });
        renderWithProviders(<TileOverlays />);

        expect(status(both.uuid)).toBe('This tile is not filtered');
        expect(overlay(both.uuid)).toHaveAttribute(
            'data-highlighted',
            'available',
        );
        expect(overlay(statusOnly.uuid)).toHaveAttribute(
            'data-highlighted',
            'mapped',
        );
    });

    it('maps a SQL chart tile to any of its columns, as the shipped popover does', async () => {
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            dashboardTiles: [sql],
        };
        mockTileStatusContext.current = {
            sqlChartTilesMetadata: {
                [sql.uuid]: {
                    columns: [
                        { reference: 'status_col', type: DimensionType.STRING },
                        { reference: 'amount', type: DimensionType.NUMBER },
                    ],
                },
            },
        };
        renderWithProviders(<TileOverlays />);

        expect(status(sql.uuid)).toBe('This tile is not filtered');
        expect(select(sql.uuid)).toHaveTextContent('Select a column');
        await userEvent.click(select(sql.uuid));
        const options = screen.getAllByRole('option', { hidden: true });
        expect(options.map((option) => option.textContent)).toEqual([
            'status_col',
            'amount',
        ]);
        await userEvent.click(options[0]);

        expect(updateFilter.mock.calls[0][0].tileTargets[sql.uuid]).toEqual({
            fieldId: 'status_col',
            tableName: 'mock_table',
            isSqlColumn: true,
        });
    });

    it('scrolls the first tile on the clicked field into view after a row click only', () => {
        const scrollIntoView = vi.fn();
        Element.prototype.scrollIntoView = scrollIntoView;

        setSidebar({ activeFieldId: 'orders_status' });
        const { unmount } = renderWithProviders(<TileOverlays />);
        expect(scrollIntoView).not.toHaveBeenCalled();
        unmount();

        setSidebar({
            activeFieldId: 'orders_status',
            highlightedFieldId: 'orders_status',
        });
        renderWithProviders(<TileOverlays />);
        expect(scrollIntoView).toHaveBeenCalledTimes(1);
        expect(scrollIntoView.mock.instances[0]).toBe(overlay(both.uuid));
    });

    it('does not scroll again when another row is hovered and left', () => {
        const scrollIntoView = vi.fn();
        Element.prototype.scrollIntoView = scrollIntoView;

        const clicked = {
            activeFieldId: 'orders_status',
            highlightedFieldId: 'orders_status',
        };
        setSidebar(clicked);
        const { rerender } = renderWithProviders(<TileOverlays />);
        expect(scrollIntoView).toHaveBeenCalledTimes(1);

        // Hovering, or tabbing past, the Region row
        setSidebar({ ...clicked, activeFieldId: 'orders_region' });
        rerender(<TileOverlays />);
        // And leaving it: Status is the active field again
        setSidebar(clicked);
        rerender(<TileOverlays />);

        expect(scrollIntoView).toHaveBeenCalledTimes(1);
    });

    describe('a SQL column that reads like a field id', () => {
        const onColumn = {
            fieldId: 'orders_status',
            tableName: 'mock_table',
            isSqlColumn: true,
        };
        beforeEach(() => {
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                dashboardTiles: [sql, statusOnly],
            };
            mockTileStatusContext.current = {
                sqlChartTilesMetadata: {
                    [sql.uuid]: {
                        columns: [
                            {
                                reference: 'orders_status',
                                type: DimensionType.STRING,
                            },
                        ],
                    },
                },
            };
        });

        it('is not on the field of that id: the tile is "other", and is no scroll target', () => {
            const scrollIntoView = vi.fn();
            Element.prototype.scrollIntoView = scrollIntoView;
            setSidebar({
                editingRule: rule({ tileTargets: { [sql.uuid]: onColumn } }),
                activeFieldId: 'orders_status',
                highlightedFieldId: 'orders_status',
            });
            renderWithProviders(<TileOverlays />);

            expect(overlay(sql.uuid)).toHaveAttribute(
                'data-highlighted',
                'other',
            );
            expect(overlay(statusOnly.uuid)).toHaveAttribute(
                'data-highlighted',
                'mapped',
            );
            expect(scrollIntoView.mock.instances).toEqual([
                overlay(statusOnly.uuid),
            ]);
        });

        it('names a SQL column filter by its column, and offers a chart tile no field for it', () => {
            setSidebar({
                editingRule: rule({
                    target: onColumn,
                    tileTargets: { [sql.uuid]: onColumn },
                }),
            });
            renderWithProviders(<TileOverlays />);

            expect(
                card(sql.uuid).getByLabelText(
                    'orders_status on Title tile-sql',
                ),
            ).toBeInTheDocument();
            // The chart tile offers a field called orders_status, which is
            // not this column
            expect(
                card(statusOnly.uuid).queryByLabelText(/ on Title /),
            ).not.toBeInTheDocument();
        });
    });

    it('lists a tile with a missing or stale tab on the first tab, as the grid draws it', () => {
        const noTab = { ...tile('tile-both', 'tab-1'), tabUuid: undefined };
        const staleTab = tile('tile-status', 'tab-deleted');
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            dashboardTiles: [noTab, staleTab, otherTab],
        };
        const { unmount } = renderWithProviders(<TileOverlays />);
        expect(overlay(both.uuid)).not.toBeNull();
        expect(overlay(statusOnly.uuid)).not.toBeNull();
        expect(overlay(otherTab.uuid)).toBeNull();
        unmount();

        // Not on the second tab too
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            activeTab: { uuid: 'tab-2', name: 'Two', order: 1 },
        };
        renderWithProviders(<TileOverlays />);
        expect(overlay(both.uuid)).toBeNull();
        expect(overlay(statusOnly.uuid)).toBeNull();
        expect(overlay(otherTab.uuid)).not.toBeNull();
    });

    it('never scrolls while no field is clicked, though the tiles are marked', () => {
        const scrollIntoView = vi.fn();
        Element.prototype.scrollIntoView = scrollIntoView;

        const editingRule = rule({ tileTargets: { [both.uuid]: false } });
        setSidebar({ editingRule });
        const { rerender } = renderWithProviders(<TileOverlays />);
        expect(overlay(both.uuid)).toHaveAttribute(
            'data-highlighted',
            'available',
        );
        expect(overlay(statusOnly.uuid)).toHaveAttribute(
            'data-highlighted',
            'filtered',
        );
        expect(scrollIntoView).not.toHaveBeenCalled();

        // Hover alone changes the marks' subject, and still does not scroll
        setSidebar({ editingRule, activeFieldId: 'orders_status' });
        rerender(<TileOverlays />);
        expect(scrollIntoView).not.toHaveBeenCalled();
    });

    it('scrolls to the first tile on the clicked field, not the first marked tile', () => {
        const scrollIntoView = vi.fn();
        Element.prototype.scrollIntoView = scrollIntoView;

        // At rest both are filtered; only "both" is on Region
        const editingRule = rule({
            tileTargets: {
                [both.uuid]: { fieldId: 'orders_region', tableName: 'orders' },
            },
        });
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            dashboardTiles: [statusOnly, both],
        };
        setSidebar({ editingRule });
        const { rerender } = renderWithProviders(<TileOverlays />);
        expect(scrollIntoView).not.toHaveBeenCalled();

        setSidebar({
            editingRule,
            activeFieldId: 'orders_region',
            highlightedFieldId: 'orders_region',
        });
        rerender(<TileOverlays />);
        // The first tile in the grid is marked too, but for another field
        expect(overlay(statusOnly.uuid)).toHaveAttribute(
            'data-highlighted',
            'other',
        );
        expect(scrollIntoView).toHaveBeenCalledTimes(1);
        expect(scrollIntoView.mock.instances[0]).toBe(overlay(both.uuid));
    });

    it('does not scroll when the clicked field is on no tile', () => {
        const scrollIntoView = vi.fn();
        Element.prototype.scrollIntoView = scrollIntoView;

        // Region waits: "both" offers it and every filtered tile is on Status
        setSidebar({
            editingRule: rule({ tileTargets: { [statusOnly.uuid]: false } }),
            waitingFieldIds: ['orders_region'],
            activeFieldId: 'orders_region',
            highlightedFieldId: 'orders_region',
        });
        renderWithProviders(<TileOverlays />);

        expect(overlay(both.uuid)).toHaveAttribute('data-highlighted', 'other');
        expect(overlay(statusOnly.uuid)).toHaveAttribute(
            'data-highlighted',
            'available',
        );
        expect(scrollIntoView).not.toHaveBeenCalled();
    });

    it('does not scroll while another field is hovered over the clicked one', () => {
        const scrollIntoView = vi.fn();
        Element.prototype.scrollIntoView = scrollIntoView;

        setSidebar({
            activeFieldId: 'orders_region',
            highlightedFieldId: 'orders_status',
        });
        renderWithProviders(<TileOverlays />);

        expect(overlay(both.uuid)).toHaveAttribute('data-highlighted', 'other');
        expect(scrollIntoView).not.toHaveBeenCalled();
    });

    describe('a data app tile', () => {
        const app = tile('tile-app', 'tab-1', DashboardTileTypes.DATA_APP);
        const appSwitch = () =>
            card(app.uuid).getByRole('switch', {
                name: 'Status on Title tile-app',
            });

        beforeEach(() => {
            const element = document.createElement('div');
            element.setAttribute('data-tile-uuid', app.uuid);
            document.body.appendChild(element);
            mockContainers.current[app.uuid] = element;
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                dashboardTiles: [both, statusOnly, app],
            };
        });

        it('gets a card with a switch instead of a field select, on by default', () => {
            renderWithProviders(<TileOverlays />);

            expect(status(app.uuid)).toBe('This tile is filtered');
            expect(appSwitch()).toBeChecked();
            expect(
                card(app.uuid).queryByLabelText(/ on Title /, {
                    selector: 'button',
                }),
            ).not.toBeInTheDocument();
            expect(overlay(app.uuid)).toHaveAttribute(
                'data-highlighted',
                'filtered',
            );
            expect(overlay(app.uuid)).toHaveClass('non-draggable');
        });

        it('is on no particular field while a field is active', () => {
            setSidebar({ activeFieldId: 'orders_status' });
            renderWithProviders(<TileOverlays />);

            expect(overlay(app.uuid)).toHaveAttribute(
                'data-highlighted',
                'other',
            );
        });

        it('reads "This tile is not filtered" and is available once it is left out', () => {
            setSidebar({
                editingRule: rule({ tileTargets: { [app.uuid]: false } }),
                activeFieldId: 'orders_status',
            });
            renderWithProviders(<TileOverlays />);

            expect(status(app.uuid)).toBe('This tile is not filtered');
            expect(appSwitch()).not.toBeChecked();
            expect(overlay(app.uuid)).toHaveAttribute(
                'data-highlighted',
                'available',
            );
        });

        it('writes false when switched off and drops the entry when switched on', async () => {
            const { rerender } = renderWithProviders(<TileOverlays />);

            await userEvent.click(appSwitch());
            expect(updateFilter).toHaveBeenLastCalledWith(
                rule({ tileTargets: { [app.uuid]: false } }),
            );

            setSidebar({
                editingRule: rule({
                    tileTargets: {
                        [app.uuid]: false,
                        [statusOnly.uuid]: false,
                    },
                }),
            });
            rerender(<TileOverlays />);
            await userEvent.click(appSwitch());
            expect(updateFilter).toHaveBeenLastCalledWith(
                rule({ tileTargets: { [statusOnly.uuid]: false } }),
            );
        });

        it('re-renders no other card when it is switched', () => {
            const { rerender } = renderWithProviders(<TileOverlays />);
            expect(renders(both.uuid)).toBe(1);
            expect(renders(statusOnly.uuid)).toBe(1);

            setSidebar({
                editingRule: rule({ tileTargets: { [app.uuid]: false } }),
            });
            rerender(<TileOverlays />);

            expect(status(app.uuid)).toBe('This tile is not filtered');
            expect(renders(both.uuid)).toBe(1);
            expect(renders(statusOnly.uuid)).toBe(1);
        });

        it('stays out of reach of a new control with no field yet', () => {
            setSidebar({
                editingRule: rule({ target: { fieldId: '', tableName: '' } }),
                isPlaceholder: true,
            });
            renderWithProviders(<TileOverlays />);

            expect(
                card(app.uuid).queryByRole('switch'),
            ).not.toBeInTheDocument();
            expect(overlay(app.uuid)).not.toHaveAttribute('data-highlighted');
        });
    });

    describe('the follow-up after a tile is changed', () => {
        const first = tile('tile-first', 'tab-1');
        const second = tile('tile-second', 'tab-1');
        const third = tile('tile-third', 'tab-1');
        const ALL_OUT = {
            [first.uuid]: false,
            [second.uuid]: false,
            [third.uuid]: false,
            [otherTab.uuid]: false,
        } as const;
        const REGION = { fieldId: 'orders_region', tableName: 'orders' };
        const addContainer = (uuid: string) => {
            const element = document.createElement('div');
            element.setAttribute('data-tile-uuid', uuid);
            document.body.appendChild(element);
            mockContainers.current[uuid] = element;
        };
        const followUp = (tileUuid: string) =>
            card(tileUuid).queryByRole('button', { name: /the other \d/ });
        const anyFollowUp = () =>
            screen.queryByRole('button', { name: /the other \d/ });
        const choose = async (tileUuid: string, label: string) => {
            await userEvent.click(select(tileUuid));
            // Lists opened earlier stay mounted: take this select's own
            const listName = select(tileUuid).getAttribute('aria-label');
            const option = screen
                .getAllByRole('option', { hidden: true })
                .find(
                    (candidate) =>
                        candidate.textContent === label &&
                        candidate
                            .closest('[role="listbox"]')
                            ?.getAttribute('aria-label') === listName,
                );
            await userEvent.click(option!);
        };
        // The provider would hand the written rule back
        const applyLastWrite = (
            rerender: (ui: React.ReactElement) => void,
            overrides: Record<string, unknown> = {},
        ) => {
            setSidebar({
                editingRule: updateFilter.mock.lastCall?.[0],
                ...overrides,
            });
            rerender(<TileOverlays />);
        };

        beforeEach(() => {
            [first, second, third].forEach((t) => addContainer(t.uuid));
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                dashboardTiles: [first, second, third, otherTab],
                filterableFieldsByTileUuid: {
                    [first.uuid]: [statusField, regionField],
                    [second.uuid]: [statusField, regionField],
                    [third.uuid]: [statusField, regionField],
                    [otherTab.uuid]: [statusField],
                },
            };
        });

        it('offers the rest of the tab after a tile is set, and fills it', async () => {
            setSidebar({ editingRule: rule({ tileTargets: ALL_OUT }) });
            const { rerender } = renderWithProviders(<TileOverlays />);
            expect(anyFollowUp()).not.toBeInTheDocument();

            await choose(first.uuid, 'Status');
            applyLastWrite(rerender);

            expect(followUp(first.uuid)).toHaveTextContent(
                'Apply to the other 2 too',
            );
            expect(followUp(first.uuid)).toHaveAccessibleName(
                'Apply Status to the other 2 tiles on this tab too',
            );
            expect(followUp(second.uuid)).not.toBeInTheDocument();
            expect(followUp(third.uuid)).not.toBeInTheDocument();

            updateFilter.mockClear();
            await userEvent.click(followUp(first.uuid)!);
            // The other tab keeps what it had
            expect(updateFilter.mock.calls[0][0].tileTargets).toEqual({
                [otherTab.uuid]: false,
            });
            applyLastWrite(rerender);
            expect(anyFollowUp()).not.toBeInTheDocument();
        });

        it('offers the field a tile was switched to', async () => {
            setSidebar({
                editingRule: rule({
                    tileTargets: {
                        [second.uuid]: false,
                        [third.uuid]: false,
                    },
                }),
            });
            const { rerender } = renderWithProviders(<TileOverlays />);

            await choose(first.uuid, 'Region');
            applyLastWrite(rerender);

            expect(followUp(first.uuid)).toHaveAccessibleName(
                'Apply Region to the other 2 tiles on this tab too',
            );
            updateFilter.mockClear();
            await userEvent.click(followUp(first.uuid)!);
            expect(updateFilter.mock.calls[0][0].tileTargets).toEqual({
                [first.uuid]: REGION,
                [second.uuid]: REGION,
                [third.uuid]: REGION,
            });
        });

        it('applies over the other tiles of the tab that are on another field, for the bar to undo', async () => {
            const { rerender } = renderWithProviders(<TileOverlays />);

            // The others are on Status
            await choose(first.uuid, 'Region');
            applyLastWrite(rerender);

            expect(followUp(first.uuid)).toHaveAccessibleName(
                'Apply Region to the other 2 tiles on this tab too',
            );
            updateFilter.mockClear();
            await userEvent.click(followUp(first.uuid)!);
            expect(applyWithUndo).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    tileTargets: {
                        [first.uuid]: REGION,
                        [second.uuid]: REGION,
                        [third.uuid]: REGION,
                    },
                }),
                {
                    kind: 'apply' as const,
                    fieldId: 'orders_region',
                    tileCount: 3,
                    replaced: 2,
                    acrossTabs: false,
                },
            );
            applyLastWrite(rerender);
            expect(anyFollowUp()).not.toBeInTheDocument();
        });

        it('has none when every other tile of the tab is on the field', async () => {
            setSidebar({
                editingRule: rule({ tileTargets: { [first.uuid]: false } }),
            });
            const { rerender } = renderWithProviders(<TileOverlays />);

            await choose(first.uuid, 'Status');
            applyLastWrite(rerender);

            expect(status(first.uuid)).toBe('This tile is filtered on');
            expect(anyFollowUp()).not.toBeInTheDocument();
        });

        it('offers to clear the rest of the tab after a tile is left out', async () => {
            const { rerender } = renderWithProviders(<TileOverlays />);

            await userEvent.click(clearButton(first.uuid)!);
            applyLastWrite(rerender);

            expect(followUp(first.uuid)).toHaveTextContent(
                'Clear the other 2 too',
            );
            expect(followUp(first.uuid)).toHaveAccessibleName(
                'Clear Status from the other 2 tiles on this tab too',
            );

            updateFilter.mockClear();
            await userEvent.click(followUp(first.uuid)!);
            // The tile on the other tab stays on the field
            expect(updateFilter.mock.calls[0][0].tileTargets).toEqual({
                [first.uuid]: false,
                [second.uuid]: false,
                [third.uuid]: false,
            });
            // Through the undoable write, which the provider keeps only for
            // the clicked field
            expect(applyWithUndo.mock.lastCall?.[1]).toEqual({
                kind: 'clear',
                fieldId: 'orders_status',
                tileCount: 2,
                replaced: 0,
                acrossTabs: false,
            });
            applyLastWrite(rerender);
            expect(anyFollowUp()).not.toBeInTheDocument();
        });

        it('has none after the last tile on the field is left out', async () => {
            setSidebar({
                editingRule: rule({
                    tileTargets: {
                        [second.uuid]: false,
                        [third.uuid]: false,
                    },
                }),
            });
            const { rerender } = renderWithProviders(<TileOverlays />);

            await userEvent.click(clearButton(first.uuid)!);
            applyLastWrite(rerender);

            expect(anyFollowUp()).not.toBeInTheDocument();
        });

        it('moves to the tile changed last', async () => {
            setSidebar({ editingRule: rule({ tileTargets: ALL_OUT }) });
            const { rerender } = renderWithProviders(<TileOverlays />);

            await choose(first.uuid, 'Status');
            applyLastWrite(rerender);
            await choose(second.uuid, 'Status');
            applyLastWrite(rerender);

            expect(followUp(first.uuid)).not.toBeInTheDocument();
            expect(followUp(second.uuid)).toHaveTextContent(
                'Apply to the other 1 too',
            );
            expect(followUp(second.uuid)).toHaveAccessibleName(
                'Apply Status to the other 1 tile on this tab too',
            );
        });

        it('follows changes made elsewhere, and leaves at none', async () => {
            setSidebar({ editingRule: rule({ tileTargets: ALL_OUT }) });
            const { rerender } = renderWithProviders(<TileOverlays />);
            await choose(first.uuid, 'Status');
            applyLastWrite(rerender);

            // The bar filled one more tile
            setSidebar({
                editingRule: rule({
                    tileTargets: {
                        [third.uuid]: false,
                        [otherTab.uuid]: false,
                    },
                }),
            });
            rerender(<TileOverlays />);
            expect(followUp(first.uuid)).toHaveTextContent(
                'Apply to the other 1 too',
            );

            setSidebar({
                editingRule: rule({
                    tileTargets: { [otherTab.uuid]: false },
                }),
            });
            rerender(<TileOverlays />);
            expect(anyFollowUp()).not.toBeInTheDocument();
        });

        it('leaves when its own tile is changed from elsewhere', async () => {
            setSidebar({ editingRule: rule({ tileTargets: ALL_OUT }) });
            const { rerender } = renderWithProviders(<TileOverlays />);
            await choose(first.uuid, 'Status');
            applyLastWrite(rerender);
            expect(followUp(first.uuid)).toBeInTheDocument();

            // Cleared from the bar: the tile is no longer on the field
            setSidebar({ editingRule: rule({ tileTargets: ALL_OUT }) });
            rerender(<TileOverlays />);
            expect(anyFollowUp()).not.toBeInTheDocument();
        });

        it('is gone once the tab changes, and does not come back', async () => {
            const tabOne = mockDashboardContext.current.activeTab;
            setSidebar({ editingRule: rule({ tileTargets: ALL_OUT }) });
            const { rerender } = renderWithProviders(<TileOverlays />);
            await choose(first.uuid, 'Status');
            applyLastWrite(rerender);
            expect(followUp(first.uuid)).toBeInTheDocument();

            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                activeTab: { uuid: 'tab-2', name: 'Two', order: 1 },
            };
            rerender(<TileOverlays />);
            expect(anyFollowUp()).not.toBeInTheDocument();

            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                activeTab: tabOne,
            };
            rerender(<TileOverlays />);
            expect(anyFollowUp()).not.toBeInTheDocument();
        });

        it('is gone once another control is opened, or the editor closes', async () => {
            setSidebar({ editingRule: rule({ tileTargets: ALL_OUT }) });
            const { rerender } = renderWithProviders(<TileOverlays />);
            await choose(first.uuid, 'Status');
            const written = updateFilter.mock.lastCall?.[0];
            applyLastWrite(rerender);
            expect(followUp(first.uuid)).toBeInTheDocument();

            setSidebar({ editingRule: { ...written, id: 'another' } });
            rerender(<TileOverlays />);
            expect(anyFollowUp()).not.toBeInTheDocument();
            setSidebar({ editingRule: written });
            rerender(<TileOverlays />);
            expect(anyFollowUp()).not.toBeInTheDocument();

            await choose(second.uuid, 'Status');
            applyLastWrite(rerender);
            expect(followUp(second.uuid)).toBeInTheDocument();
            const reopened = updateFilter.mock.lastCall?.[0];
            setSidebar({ editingRule: null });
            rerender(<TileOverlays />);
            setSidebar({ editingRule: reopened });
            rerender(<TileOverlays />);
            expect(anyFollowUp()).not.toBeInTheDocument();
        });

        it('is gone once the field is removed', async () => {
            const { rerender } = renderWithProviders(<TileOverlays />);
            await userEvent.click(clearButton(first.uuid)!);
            applyLastWrite(rerender);
            expect(followUp(first.uuid)).toBeInTheDocument();

            // Status removed in the sidebar: Region is the filter's field now
            setSidebar({
                editingRule: rule({
                    target: REGION,
                    tileTargets: { [first.uuid]: false },
                }),
            });
            rerender(<TileOverlays />);
            expect(anyFollowUp()).not.toBeInTheDocument();
        });

        it('counts every tile and names no tab on a dashboard without tabs', async () => {
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                dashboardTabs: [],
                activeTab: undefined,
            };
            setSidebar({ editingRule: rule({ tileTargets: ALL_OUT }) });
            const { rerender } = renderWithProviders(<TileOverlays />);

            await choose(first.uuid, 'Status');
            applyLastWrite(rerender);
            expect(followUp(first.uuid)).toHaveTextContent(
                /^Apply to the other 3 too$/,
            );
            expect(followUp(first.uuid)).toHaveAccessibleName(
                'Apply Status to the other 3 tiles too',
            );

            await userEvent.click(followUp(first.uuid)!);
            applyLastWrite(rerender);
            await userEvent.click(clearButton(second.uuid)!);
            applyLastWrite(rerender);
            expect(followUp(second.uuid)).toHaveTextContent(
                /^Clear the other 3 too$/,
            );
            expect(followUp(second.uuid)).toHaveAccessibleName(
                'Clear Status from the other 3 tiles too',
            );
        });

        it('never shows on a new control started from a tile', async () => {
            setSidebar({ editingRule: rule(), isPlaceholder: true });
            const { rerender } = renderWithProviders(<TileOverlays />);

            await choose(first.uuid, 'Status');
            expect(addFirstFieldOnTile).toHaveBeenCalledTimes(1);
            expect(anyFollowUp()).not.toBeInTheDocument();

            // The control it became: on that tile only
            setSidebar({
                editingRule: rule({
                    tileTargets: {
                        [second.uuid]: false,
                        [third.uuid]: false,
                        [otherTab.uuid]: false,
                    },
                }),
            });
            rerender(<TileOverlays />);
            expect(anyFollowUp()).not.toBeInTheDocument();
        });

        it('never shows for a data app tile, and its switch ends the one there was', async () => {
            const app = tile('tile-app', 'tab-1', DashboardTileTypes.DATA_APP);
            addContainer(app.uuid);
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                dashboardTiles: [first, second, third, app],
            };
            setSidebar({ editingRule: rule({ tileTargets: ALL_OUT }) });
            const { rerender } = renderWithProviders(<TileOverlays />);
            await choose(first.uuid, 'Status');
            applyLastWrite(rerender);
            expect(followUp(first.uuid)).toBeInTheDocument();

            await userEvent.click(card(app.uuid).getByRole('switch'));
            applyLastWrite(rerender);
            expect(anyFollowUp()).not.toBeInTheDocument();
        });

        it('offers a SQL column to the other SQL chart tiles that have it', async () => {
            const sqlTwo = tile(
                'tile-sql-2',
                'tab-1',
                DashboardTileTypes.SQL_CHART,
            );
            const sqlThree = tile(
                'tile-sql-3',
                'tab-1',
                DashboardTileTypes.SQL_CHART,
            );
            [sqlTwo, sqlThree].forEach((t) => addContainer(t.uuid));
            const column = (reference: string) => ({
                reference,
                type: DimensionType.STRING,
            });
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                dashboardTiles: [first, sql, sqlTwo, sqlThree],
            };
            mockTileStatusContext.current = {
                sqlChartTilesMetadata: {
                    [sql.uuid]: { columns: [column('country')] },
                    [sqlTwo.uuid]: { columns: [column('country')] },
                    [sqlThree.uuid]: { columns: [column('city')] },
                },
            };
            const { rerender } = renderWithProviders(<TileOverlays />);

            await choose(sql.uuid, 'country');
            applyLastWrite(rerender);
            expect(followUp(sql.uuid)).toHaveTextContent(
                'Apply to the other 1 too',
            );
            expect(followUp(sql.uuid)).toHaveAccessibleName(
                'Apply country to the other 1 tile on this tab too',
            );

            await userEvent.click(followUp(sql.uuid)!);
            const filled = updateFilter.mock.lastCall?.[0].tileTargets;
            expect(Object.keys(filled)).toEqual([sql.uuid, sqlTwo.uuid]);
            expect(filled[sqlTwo.uuid]).toMatchObject({
                fieldId: 'country',
                isSqlColumn: true,
            });
            applyLastWrite(rerender);
            expect(anyFollowUp()).not.toBeInTheDocument();

            await userEvent.click(clearButton(sql.uuid)!);
            applyLastWrite(rerender);
            expect(followUp(sql.uuid)).toHaveAccessibleName(
                'Clear country from the other 1 tile on this tab too',
            );
        });

        it('does not outlive the last field of the filter', async () => {
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                dashboardTabs: [],
                activeTab: undefined,
                dashboardTiles: [first, second, third],
            };
            const { rerender } = renderWithProviders(<TileOverlays />);
            await userEvent.click(clearButton(first.uuid)!);
            applyLastWrite(rerender);
            expect(followUp(first.uuid)).toBeInTheDocument();

            // Its only field is removed: the control is empty, with its id
            setSidebar({
                editingRule: rule({ target: { fieldId: '', tableName: '' } }),
                isPlaceholder: true,
            });
            rerender(<TileOverlays />);
            await choose(second.uuid, 'Status');
            expect(addFirstFieldOnTile).toHaveBeenCalledTimes(1);

            // Back as a filter on the second tile only
            setSidebar({
                editingRule: rule({
                    tileTargets: {
                        [first.uuid]: false,
                        [third.uuid]: false,
                    },
                }),
            });
            rerender(<TileOverlays />);
            expect(anyFollowUp()).not.toBeInTheDocument();
        });

        it('counts a tile with no tab on the first tab', async () => {
            const noTab = {
                ...tile('tile-no-tab', 'tab-1'),
                tabUuid: undefined,
            } as DashboardTile;
            addContainer(noTab.uuid);
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                dashboardTiles: [first, noTab, otherTab],
                filterableFieldsByTileUuid: {
                    [first.uuid]: [statusField],
                    [noTab.uuid]: [statusField],
                    [otherTab.uuid]: [statusField],
                },
            };
            setSidebar({
                editingRule: rule({
                    tileTargets: {
                        [first.uuid]: false,
                        [noTab.uuid]: false,
                        [otherTab.uuid]: false,
                    },
                }),
            });
            const { rerender } = renderWithProviders(<TileOverlays />);

            await choose(first.uuid, 'Status');
            applyLastWrite(rerender);
            expect(followUp(first.uuid)).toHaveTextContent(
                'Apply to the other 1 too',
            );

            // On the second tab the tile is not drawn, so it gets no card
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                activeTab: { uuid: 'tab-2', name: 'Two', order: 1 },
            };
            rerender(<TileOverlays />);
            expect(overlay(noTab.uuid)).toBeNull();
        });

        it('hands focus to the select of its tile once it is used', async () => {
            setSidebar({ editingRule: rule({ tileTargets: ALL_OUT }) });
            const { rerender } = renderWithProviders(<TileOverlays />);
            await choose(first.uuid, 'Status');
            applyLastWrite(rerender);

            await userEvent.click(followUp(first.uuid)!);
            applyLastWrite(rerender);

            expect(anyFollowUp()).not.toBeInTheDocument();
            expect(select(first.uuid)).toHaveFocus();
        });

        it('is not offered while the tile fields are not loaded', async () => {
            const { rerender } = renderWithProviders(<TileOverlays />);
            await userEvent.click(clearButton(first.uuid)!);
            applyLastWrite(rerender);
            expect(followUp(first.uuid)).toBeInTheDocument();

            // A refetch: what each tile offers is not known for a moment
            const fields =
                mockDashboardContext.current.filterableFieldsByTileUuid;
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                filterableFieldsByTileUuid: undefined,
            };
            rerender(<TileOverlays />);
            expect(anyFollowUp()).not.toBeInTheDocument();

            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                filterableFieldsByTileUuid: fields,
            };
            rerender(<TileOverlays />);
            expect(followUp(first.uuid)).toBeInTheDocument();
        });

        it('re-renders only the cards the follow-up is on or leaves', async () => {
            setSidebar({ editingRule: rule({ tileTargets: ALL_OUT }) });
            const { rerender } = renderWithProviders(<TileOverlays />);
            await choose(first.uuid, 'Status');
            applyLastWrite(rerender);
            const thirdRenders = renders(third.uuid);

            await choose(second.uuid, 'Status');
            applyLastWrite(rerender);
            expect(followUp(second.uuid)).toBeInTheDocument();
            expect(renders(third.uuid)).toBe(thirdRenders);
        });
    });

    describe('a tile mapped to a field it no longer has', () => {
        const GONE = { fieldId: 'orders_gone', tableName: 'orders' };
        const WARNING =
            "The selected field 'orders_gone' is not available in this chart";

        beforeEach(() => {
            setSidebar({
                editingRule: rule({
                    tileTargets: { [statusOnly.uuid]: GONE },
                }),
            });
        });

        it('says so, with an empty select, a warning and the clear button', () => {
            renderWithProviders(<TileOverlays />);

            expect(status(statusOnly.uuid)).toBe(
                'Filtered by a field this tile no longer has',
            );
            expect(select(statusOnly.uuid)).toHaveTextContent('Select a field');
            expect(select(statusOnly.uuid)).not.toHaveTextContent(
                'orders_gone',
            );
            expect(
                card(statusOnly.uuid).getByRole('img', { name: WARNING }),
            ).toBeInTheDocument();
            expect(clearButton(statusOnly.uuid)).toBeInTheDocument();
            // The other tiles carry no warning
            expect(
                card(both.uuid).queryByRole('img', { name: WARNING }),
            ).not.toBeInTheDocument();
        });

        it('names the missing field in a tooltip', async () => {
            renderWithProviders(<TileOverlays />);

            await userEvent.hover(
                card(statusOnly.uuid).getByRole('img', { name: WARNING }),
            );
            expect(await screen.findByText(WARNING)).toBeInTheDocument();
        });

        it('is available, not filtered, whatever field is active', () => {
            const { rerender } = renderWithProviders(<TileOverlays />);
            expect(overlay(statusOnly.uuid)).toHaveAttribute(
                'data-highlighted',
                'available',
            );

            setSidebar({
                editingRule: rule({
                    tileTargets: { [statusOnly.uuid]: GONE },
                }),
                activeFieldId: 'orders_gone',
                highlightedFieldId: 'orders_gone',
            });
            rerender(<TileOverlays />);
            expect(overlay(statusOnly.uuid)).toHaveAttribute(
                'data-highlighted',
                'available',
            );
        });

        it('offers the fields the tile does have, never the missing one', async () => {
            renderWithProviders(<TileOverlays />);

            await userEvent.click(select(statusOnly.uuid));
            expect(select(statusOnly.uuid)).toHaveValue('');
            expect(
                screen
                    .getAllByRole('option', { hidden: true })
                    .map((option) => option.textContent),
            ).toEqual(['Status']);

            await userEvent.click(
                screen.getByRole('option', { name: 'Status', hidden: true }),
            );
            expect(updateFilter).toHaveBeenLastCalledWith(rule());
        });

        it('leaves the tile out when cleared', async () => {
            renderWithProviders(<TileOverlays />);

            await userEvent.click(clearButton(statusOnly.uuid)!);
            expect(updateFilter).toHaveBeenLastCalledWith(
                rule({ tileTargets: { [statusOnly.uuid]: false } }),
            );
        });

        it('keeps its card when the tile offers nothing the filter could take', () => {
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                allFilterableFieldsMap: {
                    orders_status: statusField,
                    orders_amount: amountField,
                },
                filterableFieldsByTileUuid: {
                    [both.uuid]: [statusField],
                    [statusOnly.uuid]: [amountField],
                },
            };
            renderWithProviders(<TileOverlays />);

            expect(status(statusOnly.uuid)).toBe(
                'Filtered by a field this tile no longer has',
            );
            expect(clearButton(statusOnly.uuid)).toBeInTheDocument();
        });

        it('marks a SQL chart tile on a column it no longer returns', () => {
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                dashboardTiles: [sql],
            };
            mockTileStatusContext.current = {
                sqlChartTilesMetadata: {
                    [sql.uuid]: {
                        columns: [
                            {
                                reference: 'status_col',
                                type: DimensionType.STRING,
                            },
                        ],
                    },
                },
            };
            setSidebar({
                editingRule: rule({
                    tileTargets: {
                        [sql.uuid]: {
                            fieldId: 'old_col',
                            tableName: 'mock_table',
                            isSqlColumn: true,
                        },
                    },
                }),
            });
            renderWithProviders(<TileOverlays />);

            expect(status(sql.uuid)).toBe(
                'Filtered by a field this tile no longer has',
            );
            expect(select(sql.uuid)).toHaveTextContent('Select a column');
            expect(overlay(sql.uuid)).toHaveAttribute(
                'data-highlighted',
                'available',
            );
        });

        it('does not call a SQL chart tile on a column of another type missing', () => {
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                dashboardTiles: [sql],
            };
            mockTileStatusContext.current = {
                sqlChartTilesMetadata: {
                    [sql.uuid]: {
                        columns: [
                            { reference: 'amount', type: DimensionType.NUMBER },
                        ],
                    },
                },
            };
            // The filter is on a string field
            setSidebar({
                editingRule: rule({
                    tileTargets: {
                        [sql.uuid]: {
                            fieldId: 'amount',
                            tableName: 'mock_table',
                            isSqlColumn: true,
                        },
                    },
                }),
            });
            renderWithProviders(<TileOverlays />);

            expect(status(sql.uuid)).not.toBe(
                'Filtered by a field this tile no longer has',
            );
            expect(select(sql.uuid)).toHaveTextContent('amount');
            expect(overlay(sql.uuid)).toHaveAttribute(
                'data-highlighted',
                'filtered',
            );
        });
    });
});
