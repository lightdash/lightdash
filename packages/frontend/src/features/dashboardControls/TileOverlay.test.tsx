import {
    DashboardTileTypes,
    DimensionType,
    FieldType,
    FilterOperator,
    TimeFrames,
    type DashboardFilterRule,
    type DashboardTile,
    type FilterableDimension,
} from '@lightdash/common';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
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

vi.mock('./useControlsSidebar', () => ({
    useControlsSidebar: () => mockSidebar.current,
    useControlsSidebarSelector: (
        selector: (value: Record<string, unknown>) => unknown,
    ) => selector(mockSidebar.current),
}));
vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector) => selector(mockDashboardContext.current)),
}));
vi.mock('../../providers/Dashboard/useDashboardTileStatusContext', () => ({
    default: vi.fn((selector) => selector(mockTileStatusContext.current)),
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
const addFirstFieldOnTile = vi.fn();

const setSidebar = (overrides: Record<string, unknown> = {}) => {
    mockSidebar.current = {
        editingRule: rule(),
        isPlaceholder: false,
        activeFieldId: null,
        waitingFieldIds: [],
        highlightedFieldId: null,
        updateFilter,
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
    card(tileUuid).queryByRole('button', { name: 'Leave this tile out' });

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
            activeTab: { uuid: 'tab-1', name: 'One', order: 0 },
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

    it('shows the field a filterable tile is filtered by', () => {
        renderWithProviders(<TileOverlays />);

        expect(status(both.uuid)).toBe('Filtered by');
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
            ).toEqual(['Status', 'Region']);
        },
    );

    it('marks filtered tiles as mapped and the ones that could be as available while no field is active', () => {
        setSidebar({
            editingRule: rule({ tileTargets: { [both.uuid]: false } }),
        });
        renderWithProviders(<TileOverlays />);

        expect(overlay(statusOnly.uuid)).toHaveAttribute(
            'data-highlighted',
            'mapped',
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

        expect(status(both.uuid)).toBe('Not filtered');
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
        ).toEqual(['Status', 'Region']);
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
        expect(overlay(sql.uuid)).toHaveAttribute('data-highlighted', 'mapped');
    });

    it('re-renders only the tiles whose highlight changes with the active field', () => {
        const editingRule = rule({
            tileTargets: {
                [both.uuid]: { fieldId: 'orders_region', tableName: 'orders' },
            },
        });
        // No active field: both are filtered, so both are mapped
        setSidebar({ editingRule });
        const { rerender } = renderWithProviders(<TileOverlays />);
        expect(overlay(both.uuid)).toHaveAttribute(
            'data-highlighted',
            'mapped',
        );
        expect(overlay(statusOnly.uuid)).toHaveAttribute(
            'data-highlighted',
            'mapped',
        );
        expect(renders(both.uuid)).toBe(1);
        expect(renders(statusOnly.uuid)).toBe(1);

        // The field "both" is on: it stays mapped, the other tile is on
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
        expect(renders(both.uuid)).toBe(1);
        expect(renders(statusOnly.uuid)).toBe(2);

        // A field neither tile is on: "both" changes, the other tile does not
        setSidebar({ editingRule, activeFieldId: 'orders_other' });
        rerender(<TileOverlays />);
        expect(overlay(both.uuid)).toHaveAttribute('data-highlighted', 'other');
        expect(overlay(statusOnly.uuid)).toHaveAttribute(
            'data-highlighted',
            'other',
        );
        expect(renders(both.uuid)).toBe(2);
        expect(renders(statusOnly.uuid)).toBe(2);

        // No active field again: both go back to mapped, so both render
        setSidebar({ editingRule });
        rerender(<TileOverlays />);
        expect(renders(both.uuid)).toBe(3);
        expect(renders(statusOnly.uuid)).toBe(3);

        // Nothing changed for either tile
        setSidebar({ editingRule, waitingFieldIds: [] });
        rerender(<TileOverlays />);
        expect(renders(both.uuid)).toBe(3);
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

        // At rest the filtered tile is mapped, as it just was
        setSidebar({ editingRule });
        rerender(<TileOverlays />);
        expect(overlay(both.uuid)).toHaveAttribute(
            'data-highlighted',
            'available',
        );
        expect(renders(both.uuid)).toBe(1);
        expect(renders(statusOnly.uuid)).toBe(3);
    });

    it('re-renders only the tile whose mapping changes', async () => {
        const { rerender } = renderWithProviders(<TileOverlays />);
        expect(renders(both.uuid)).toBe(1);
        expect(renders(statusOnly.uuid)).toBe(1);

        setSidebar({
            editingRule: rule({ tileTargets: { [both.uuid]: false } }),
        });
        rerender(<TileOverlays />);

        expect(status(both.uuid)).toBe('Not filtered');
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
        ).toEqual(['Status', 'Region']);
        await userEvent.click(clearButton(both.uuid)!);

        expect(updateFilter).toHaveBeenCalledTimes(1);
        expect(updateFilter.mock.calls[0][0].tileTargets[both.uuid]).toBe(
            false,
        );
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
        expect(overlay(markdown.uuid)).toBeEmptyDOMElement();
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

        expect(overlay(statusOnly.uuid)).toBeEmptyDOMElement();
        expect(overlay(statusOnly.uuid)).not.toHaveAttribute(
            'data-highlighted',
        );
        expect(overlay(statusOnly.uuid)).toHaveAttribute(
            'title',
            'This filter cannot reach this tile',
        );
    });

    describe('adding a field from a tile', () => {
        const addGroup = () =>
            screen.getByRole('group', {
                name: 'Other fields on this tile',
                hidden: true,
            });
        const groupOptions = () =>
            within(addGroup())
                .getAllByRole('option', { hidden: true })
                .map((option) => option.textContent);
        const allOptions = () =>
            screen
                .getAllByRole('option', { hidden: true })
                .map((option) => option.textContent);

        it('lists the other fields of the kind the tile offers in a second group', async () => {
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

            // The filter's own field first, then what the tile could add;
            // Amount is another kind
            expect(allOptions()).toEqual(['Status', 'Region']);
            expect(groupOptions()).toEqual(['Region']);
            expect(
                within(
                    screen.getByRole('group', {
                        name: 'In this filter',
                        hidden: true,
                    }),
                )
                    .getAllByRole('option', { hidden: true })
                    .map((option) => option.textContent),
            ).toEqual(['Status']);
        });

        it('has no second group on a tile that offers nothing else', async () => {
            renderWithProviders(<TileOverlays />);

            await userEvent.click(select(statusOnly.uuid));

            expect(allOptions()).toEqual(['Status']);
            expect(
                screen.queryByRole('group', { hidden: true }),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByText('In this filter'),
            ).not.toBeInTheDocument();
            // Short and ungrouped: it stays a plain select
            expect(select(statusOnly.uuid)).toHaveAttribute('readonly');
        });

        it('maps only this tile to the field chosen from the second group', async () => {
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
                within(addGroup()).getByRole('option', {
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
                expect(groupOptions()).toEqual([
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

        it('lists a field that joined the filter in the first group of the other tiles', async () => {
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

            expect(allOptions()).toEqual(['Status', 'Region']);
            expect(
                screen.queryByRole('group', { hidden: true }),
            ).not.toBeInTheDocument();
        });

        it('does not repeat a waiting field in the second group', async () => {
            setSidebar({ waitingFieldIds: ['orders_region'] });
            renderWithProviders(<TileOverlays />);

            await userEvent.click(select(both.uuid));

            expect(allOptions()).toEqual(['Status', 'Region']);
            expect(
                screen.queryByRole('group', { hidden: true }),
            ).not.toBeInTheDocument();
        });

        it('shows the table label on an entry that would read like another one', async () => {
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

            expect(groupOptions()).toEqual(['Customers Status', 'Region']);
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
            expect(status(statusOnly.uuid)).toBe('Not filtered');
            expect(select(statusOnly.uuid)).toHaveTextContent('Select a field');
            expect(clearButton(statusOnly.uuid)).not.toBeInTheDocument();

            await userEvent.click(select(statusOnly.uuid));

            // One group only: a plain list with no label, still searchable
            expect(allOptions()).toEqual(['Region']);
            expect(
                screen.queryByRole('group', { hidden: true }),
            ).not.toBeInTheDocument();
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
            renderCounts.current[`New control on Title ${tileUuid}`] ?? 0;
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
                expect(status(t.uuid)).toBe('Not filtered');
                expect(clearButton(t.uuid)).not.toBeInTheDocument();
                expect(select(t.uuid).tagName).toBe('BUTTON');
            });
            expect(select(statusOnly.uuid)).toHaveTextContent('Select a field');
            expect(select(statusOnly.uuid)).toHaveAccessibleName(
                'New control on Title tile-status',
            );
            expect(select(both.uuid)).toHaveTextContent('Select a field');
            expect(overlay(otherTab.uuid)).toBeNull();
        });

        it('veils a tile with no fields, with no card', () => {
            renderWithProviders(<TileOverlays />);

            expect(overlay(markdown.uuid)).not.toHaveAttribute(
                'data-highlighted',
            );
            expect(overlay(markdown.uuid)).toBeEmptyDOMElement();
            expect(overlay(markdown.uuid)).toHaveAttribute(
                'title',
                'This control cannot reach this tile',
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
            expect(overlay(sql.uuid)).toBeEmptyDOMElement();
        });

        it('lists the fields of every kind, each grain of a date included, as one plain list', async () => {
            renderWithProviders(<TileOverlays />);

            await userEvent.click(select(both.uuid));

            expect(allOptions()).toEqual([
                'Amount',
                'Created day',
                'Created month',
                'Region',
                'Status',
            ]);
            expect(
                screen.queryByRole('group', { hidden: true }),
            ).not.toBeInTheDocument();
            expect(select(both.uuid)).toHaveAttribute(
                'placeholder',
                'Select a field',
            );
        });

        it('shows no group label on a tile with fields only', async () => {
            renderWithProviders(<TileOverlays />);

            await userEvent.click(select(statusOnly.uuid));

            expect(allOptions()).toEqual(['Status']);
            expect(
                screen.queryByRole('group', { hidden: true }),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByText('Fields on this tile'),
            ).not.toBeInTheDocument();
        });

        it('shows the table label where two fields would read the same', async () => {
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

            expect(allOptions()).toEqual(['Customers Status', 'Orders Status']);
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
        expect(status(statusOnly.uuid)).toBe('Not filtered');
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

        expect(status(both.uuid)).toBe('Not filtered');
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

        expect(status(sql.uuid)).toBe('Not filtered');
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
            'mapped',
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

        // At rest both are mapped; only "both" is on Region
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

            expect(status(app.uuid)).toBe('Filtered');
            expect(appSwitch()).toBeChecked();
            expect(
                card(app.uuid).queryByLabelText(/ on Title /, {
                    selector: 'button',
                }),
            ).not.toBeInTheDocument();
            expect(overlay(app.uuid)).toHaveAttribute(
                'data-highlighted',
                'mapped',
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

        it('reads "Not filtered" and is available once it is left out', () => {
            setSidebar({
                editingRule: rule({ tileTargets: { [app.uuid]: false } }),
                activeFieldId: 'orders_status',
            });
            renderWithProviders(<TileOverlays />);

            expect(status(app.uuid)).toBe('Not filtered');
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

            expect(status(app.uuid)).toBe('Not filtered');
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

    describe('a tile mapped to a field it no longer has', () => {
        const GONE = { fieldId: 'orders_gone', tableName: 'orders' };
        const WARNING =
            "The selected field 'orders_gone' is not available in this tile";

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
                'mapped',
            );
        });
    });
});
