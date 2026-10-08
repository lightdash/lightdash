import {
    DashboardTileTypes,
    DimensionType,
    FieldType,
    FilterOperator,
    type DashboardFilterRule,
    type DashboardTile,
    type FilterableDimension,
} from '@lightdash/common';
import { screen, within } from '@testing-library/react';
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

const setSidebar = (overrides: Record<string, unknown> = {}) => {
    mockSidebar.current = {
        editingRule: rule(),
        isPlaceholder: false,
        activeFieldId: null,
        waitingFieldIds: [],
        highlightedFieldId: null,
        updateFilter,
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

describe('TileOverlays', () => {
    beforeEach(() => {
        updateFilter.mockClear();
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
            ).toEqual(['Status', 'Not filtered']);
        },
    );

    it('marks every tile the filter reaches while no field is active', () => {
        setSidebar({
            editingRule: rule({ tileTargets: { [both.uuid]: false } }),
        });
        renderWithProviders(<TileOverlays />);

        expect(overlay(statusOnly.uuid)).toHaveAttribute(
            'data-highlighted',
            'reached',
        );
        // Filterable, but left out
        expect(overlay(both.uuid)).not.toHaveAttribute('data-highlighted');
        expect(overlay(markdown.uuid)).not.toHaveAttribute('data-highlighted');
    });

    it('marks a SQL chart tile mapped to a column as reached', () => {
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
        expect(overlay(sql.uuid)).not.toHaveAttribute('data-highlighted');

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
            'reached',
        );
    });

    it('re-renders only the tiles whose highlight changes with the active field', () => {
        const editingRule = rule({
            tileTargets: {
                [both.uuid]: { fieldId: 'orders_region', tableName: 'orders' },
            },
        });
        setSidebar({ editingRule, activeFieldId: 'orders_region' });
        const { rerender } = renderWithProviders(<TileOverlays />);
        expect(overlay(both.uuid)).toHaveAttribute(
            'data-highlighted',
            'mapped',
        );
        expect(overlay(statusOnly.uuid)).not.toHaveAttribute(
            'data-highlighted',
        );
        const before = {
            both: renders(both.uuid),
            statusOnly: renders(statusOnly.uuid),
        };
        expect(before).toEqual({ both: 1, statusOnly: 1 });

        // A field neither tile is on nor offers
        setSidebar({ editingRule, activeFieldId: 'orders_other' });
        rerender(<TileOverlays />);

        expect(overlay(both.uuid)).not.toHaveAttribute('data-highlighted');
        expect(renders(both.uuid)).toBe(2);
        expect(renders(statusOnly.uuid)).toBe(1);

        // No active field: both go to "reached", so both render
        setSidebar({ editingRule });
        rerender(<TileOverlays />);
        expect(renders(both.uuid)).toBe(3);
        expect(renders(statusOnly.uuid)).toBe(2);

        // Nothing changed for either tile
        setSidebar({ editingRule, waitingFieldIds: [] });
        rerender(<TileOverlays />);
        expect(renders(both.uuid)).toBe(3);
        expect(renders(statusOnly.uuid)).toBe(2);
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
        await userEvent.click(select(statusOnly.uuid));
        await userEvent.click(
            screen.getByRole('option', { name: 'Not filtered', hidden: true }),
        );
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

    it('leaves a tile out when "Not filtered" is chosen', async () => {
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            dashboardTiles: [both],
        };
        renderWithProviders(<TileOverlays />);

        await userEvent.click(select(both.uuid));
        const options = screen.getAllByRole('option', { hidden: true });
        expect(options.map((option) => option.textContent)).toEqual([
            'Status',
            'Not filtered',
        ]);
        await userEvent.click(options[1]);

        expect(updateFilter).toHaveBeenCalledTimes(1);
        expect(updateFilter.mock.calls[0][0].tileTargets[both.uuid]).toBe(
            false,
        );
    });

    it('veils a tile that cannot take the filter without a card', () => {
        renderWithProviders(<TileOverlays />);

        expect(overlay(markdown.uuid)).not.toBeNull();
        expect(overlay(markdown.uuid)).toBeEmptyDOMElement();
    });

    it("veils a tile with none of the filter's fields the same way, with no text", () => {
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            filterableFieldsByTileUuid: {
                [both.uuid]: [statusField, regionField],
                [statusOnly.uuid]: [regionField],
            },
        };
        renderWithProviders(<TileOverlays />);

        expect(overlay(statusOnly.uuid)).toBeEmptyDOMElement();
        expect(overlay(statusOnly.uuid)).toHaveAttribute(
            'title',
            'This filter cannot reach this tile',
        );
    });

    it('swallows mouse down and click on the veil', async () => {
        const onPointer = vi.fn();
        renderWithProviders(
            <div onMouseDown={onPointer} onClick={onPointer}>
                <TileOverlays />
            </div>,
        );

        await userEvent.click(overlay(markdown.uuid)!);
        await userEvent.click(overlay(both.uuid)!);

        expect(onPointer).not.toHaveBeenCalled();
    });

    it('renders nothing for a placeholder', () => {
        setSidebar({
            editingRule: rule({ target: { fieldId: '', tableName: '' } }),
            isPlaceholder: true,
        });
        renderWithProviders(<TileOverlays />);

        allTiles.forEach((t) => expect(overlay(t.uuid)).toBeNull());
    });

    it('renders nothing when no control is edited', () => {
        setSidebar({ editingRule: null });
        renderWithProviders(<TileOverlays />);

        allTiles.forEach((t) => expect(overlay(t.uuid)).toBeNull());
    });

    it('marks a tile that could switch to the active field as available', () => {
        setSidebar({ activeFieldId: 'orders_region' });
        renderWithProviders(<TileOverlays />);

        expect(overlay(both.uuid)).toHaveAttribute(
            'data-highlighted',
            'available',
        );
        expect(overlay(statusOnly.uuid)).not.toHaveAttribute(
            'data-highlighted',
        );
        // The select is the one way to switch
        expect(card(both.uuid).getAllByRole('button')).toEqual([
            select(both.uuid),
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

    it('maps a SQL chart tile to one of its columns of the same kind', async () => {
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
        await userEvent.click(select(sql.uuid));
        const options = screen.getAllByRole('option', { hidden: true });
        expect(options.map((option) => option.textContent)).toEqual([
            'status_col',
            'Not filtered',
        ]);
        await userEvent.click(options[0]);

        expect(updateFilter.mock.calls[0][0].tileTargets[sql.uuid]).toEqual({
            fieldId: 'status_col',
            tableName: 'mock_table',
            isSqlColumn: true,
        });
    });

    it('scrolls the first highlighted tile into view after a row click only', () => {
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

    it('never scrolls to a tile that is only reached', () => {
        const scrollIntoView = vi.fn();
        Element.prototype.scrollIntoView = scrollIntoView;

        // A click on a field no tile is on or offers
        setSidebar({
            activeFieldId: null,
            highlightedFieldId: 'orders_other',
        });
        renderWithProviders(<TileOverlays />);

        expect(overlay(both.uuid)).toHaveAttribute(
            'data-highlighted',
            'reached',
        );
        expect(scrollIntoView).not.toHaveBeenCalled();
    });
});
