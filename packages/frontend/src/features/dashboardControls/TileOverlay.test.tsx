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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
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
const select = (tileUuid: string) =>
    card(tileUuid).getByLabelText(/ on Title /, { selector: 'input' });
// The dimmed line above the select
const status = (tileUuid: string) =>
    container(tileUuid).querySelector('p')?.textContent;
const overlay = (tileUuid: string) =>
    container(tileUuid).firstElementChild as HTMLElement | null;

describe('TileOverlays', () => {
    beforeEach(() => {
        updateFilter.mockClear();
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
        expect(select(both.uuid)).toHaveValue('Status');
        expect(select(both.uuid)).toHaveAccessibleName(
            'Status on Title tile-both',
        );
        expect(overlay(both.uuid)).not.toHaveAttribute('data-highlighted');
    });

    it('only covers the tiles on the active tab', () => {
        renderWithProviders(<TileOverlays />);

        expect(overlay(statusOnly.uuid)).not.toBeNull();
        expect(overlay(otherTab.uuid)).toBeNull();
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
        expect(card(both.uuid).queryByRole('button')).not.toBeInTheDocument();
    });

    it('offers a waiting field in the select of a tile that could take it', () => {
        setSidebar({ waitingFieldIds: ['orders_region'] });
        renderWithProviders(<TileOverlays />);

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
});
