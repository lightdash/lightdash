import {
    DashboardTileTypes,
    DimensionType,
    FieldType,
    FilterOperator,
    MetricType,
    type DashboardFilterRule,
    type DashboardFilters,
    type DashboardTile,
    type FilterableDimension,
} from '@lightdash/common';
import { screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type SqlChartTileMetadata } from '../../providers/Dashboard/types';
import {
    createDashboardTestStore,
    type DashboardEditTestValues,
    seedDashboardEditState,
} from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import { renderWithProviders as renderWithAppProviders } from '../../testing/testUtils';
import { TabCounts } from './TabCounts';

const tileStatus = { current: { sqlChartTilesMetadata: {} } };

const mockSidebar = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
const mockDashboardContext = vi.hoisted(() => ({
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

const status = dimension('status', 'Status');
const region = dimension('region', 'Region');

const tile = (
    uuid: string,
    tabUuid: string,
    type: DashboardTileTypes = DashboardTileTypes.SAVED_CHART,
) => ({ uuid, tabUuid, type, properties: {} }) as DashboardTile;

const TAB_UUIDS = ['tab-1', 'tab-2', 'tab-empty'];

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

const setSidebar = (overrides: Record<string, unknown> = {}) => {
    mockSidebar.current = {
        editingRule: rule(),
        isPlaceholder: false,
        isViewer: false,
        activeFieldId: null,
        ...overrides,
    };
};

// The fraction as seen; screen readers get the "x of y" label instead
const badgeText = (tabUuid: string) =>
    mockContainers.current[tabUuid].querySelector('[aria-hidden="true"]')
        ?.textContent ?? '';

const waitForTooltip = () =>
    act(() => new Promise((resolve) => setTimeout(resolve, 150)));

const isBadgeReached = (tabUuid: string) =>
    mockContainers.current[tabUuid]
        .querySelector('[data-reached]')
        ?.getAttribute('data-reached');

const badge = (tabUuid: string) => {
    const element =
        mockContainers.current[tabUuid].querySelector<HTMLElement>(
            '[data-reached]',
        );
    if (element === null) throw new Error(`expected a badge on ${tabUuid}`);
    return element;
};

const isBadgeBlue = (tabUuid: string) =>
    badge(tabUuid).style.color.includes('blue');

// Seeds the store's SQL chart metadata from `tileStatus` at render time
const renderWithProviders = (ui: ReactElement) => {
    const store = createDashboardTestStore({
        sqlChartTilesMetadata: tileStatus.current
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

describe('TabCounts', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        mockContainers.current = Object.fromEntries(
            TAB_UUIDS.map((tabUuid) => {
                const element = document.createElement('div');
                document.body.appendChild(element);
                return [tabUuid, element];
            }),
        );
        mockDashboardContext.current = {
            dashboardTiles: [
                tile('tile-both', 'tab-1'),
                tile('tile-status', 'tab-1'),
                tile('tile-markdown', 'tab-1', DashboardTileTypes.MARKDOWN),
                tile('tile-region', 'tab-2'),
            ],
            dashboardTabs: TAB_UUIDS.map((uuid, order) => ({
                uuid,
                name: uuid,
                order,
            })),
            allFilterableFieldsMap: {
                orders_status: status,
                orders_region: region,
            },
            allFilterableMetricsMap: {},
            filterableFieldsByTileUuid: {
                'tile-both': [status, region],
                'tile-status': [status],
                'tile-region': [region],
            },
        };
        setSidebar();
    });

    it('counts the filtered tiles out of every tile on each tab', async () => {
        renderWithProviders(<TabCounts />);

        expect(badgeText('tab-1')).toBe('2/3');
        expect(badgeText('tab-2')).toBe('0/1');
        expect(badgeText('tab-empty')).toBe('0/0');

        await userEvent.hover(screen.getByText('2/3'));
        expect(
            await screen.findByText(
                '2 of 3 tiles on this tab are filtered by this filter',
            ),
        ).toBeInTheDocument();
    });

    it('marks the tabs the control reaches while no field is active', () => {
        renderWithProviders(<TabCounts />);

        expect(isBadgeReached('tab-1')).toBe('true');
        expect(isBadgeReached('tab-2')).toBe('false');
    });

    it('marks only the tabs with tiles on the active field', () => {
        setSidebar({
            editingRule: rule({
                tileTargets: {
                    'tile-region': {
                        fieldId: 'orders_region',
                        tableName: 'orders',
                    },
                },
            }),
            activeFieldId: 'orders_region',
        });
        renderWithProviders(<TabCounts />);

        expect(badgeText('tab-1')).toBe('0/1');
        expect(isBadgeReached('tab-1')).toBe('false');
        expect(isBadgeReached('tab-2')).toBe('true');
    });

    it('stays grey on every tab while no field is active', () => {
        renderWithProviders(<TabCounts />);

        expect(badge('tab-1')).toHaveAttribute('data-field-active', 'false');
        expect(badge('tab-2')).toHaveAttribute('data-field-active', 'false');
        expect(isBadgeBlue('tab-1')).toBe(false);
        expect(isBadgeBlue('tab-2')).toBe(false);
    });

    it('turns blue only on the tabs the active field is on', () => {
        setSidebar({
            editingRule: rule({
                tileTargets: {
                    'tile-region': {
                        fieldId: 'orders_region',
                        tableName: 'orders',
                    },
                },
            }),
            activeFieldId: 'orders_region',
        });
        renderWithProviders(<TabCounts />);

        expect(badge('tab-1')).toHaveAttribute('data-field-active', 'true');
        expect(badge('tab-2')).toHaveAttribute('data-field-active', 'true');
        expect(isBadgeReached('tab-1')).toBe('false');
        expect(isBadgeBlue('tab-1')).toBe(false);
        expect(isBadgeReached('tab-2')).toBe('true');
        expect(isBadgeBlue('tab-2')).toBe(true);
    });

    it('counts the active field alone while a row is hovered or clicked', async () => {
        setSidebar({
            editingRule: rule({
                tileTargets: {
                    'tile-region': {
                        fieldId: 'orders_region',
                        tableName: 'orders',
                    },
                },
            }),
            activeFieldId: 'orders_region',
        });
        renderWithProviders(<TabCounts />);

        expect(badgeText('tab-1')).toBe('0/1');
        expect(badgeText('tab-2')).toBe('1/1');

        await userEvent.hover(screen.getByText('1/1'));
        expect(
            await screen.findByText(
                '1 of 1 tile on this tab is filtered by Region',
            ),
        ).toBeInTheDocument();
    });

    it('names a metric in the tooltip, not its id', async () => {
        const revenue = {
            ...dimension('revenue', 'Revenue'),
            fieldType: FieldType.METRIC,
            type: MetricType.SUM,
        };
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            allFilterableMetricsMap: { orders_revenue: revenue },
            filterableFieldsByTileUuid: { 'tile-region': [revenue] },
        };
        setSidebar({
            editingRule: rule({
                target: { fieldId: 'orders_revenue', tableName: 'orders' },
            }),
            activeFieldId: 'orders_revenue',
        });
        renderWithProviders(<TabCounts />);

        await userEvent.hover(screen.getByText('1/1'));
        expect(
            await screen.findByText(
                '1 of 1 tile on this tab is filtered by Revenue',
            ),
        ).toBeInTheDocument();
    });

    it('names a SQL column by its own name, even when a field has that id', async () => {
        const sqlTarget = {
            fieldId: 'orders_status',
            tableName: 'sql_chart',
            isSqlColumn: true,
        };
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            dashboardTiles: [
                tile('tile-sql', 'tab-2', DashboardTileTypes.SQL_CHART),
            ],
        };
        setSidebar({
            editingRule: rule({
                target: sqlTarget,
                tileTargets: { 'tile-sql': sqlTarget },
            }),
            activeFieldId: 'orders_status',
        });
        renderWithProviders(<TabCounts />);

        await userEvent.hover(screen.getByText('1/1'));
        expect(
            await screen.findByText(
                '1 of 1 tile on this tab is filtered by orders_status',
            ),
        ).toBeInTheDocument();
    });

    it('counts a tile with a missing or stale tab on the first tab', () => {
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            dashboardTiles: [
                tile('tile-both', 'tab-1'),
                { ...tile('tile-status', 'tab-1'), tabUuid: undefined },
                tile('tile-region', 'tab-deleted'),
            ],
        };
        renderWithProviders(<TabCounts />);

        expect(badgeText('tab-1')).toBe('2/3');
        expect(badgeText('tab-2')).toBe('0/0');
    });

    it('counts a data app tile while it is on', () => {
        const withApp = () => {
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                dashboardTiles: [
                    tile('tile-region', 'tab-2'),
                    tile('tile-app', 'tab-2', DashboardTileTypes.DATA_APP),
                ],
            };
        };
        withApp();
        const { unmount } = renderWithProviders(<TabCounts />);
        expect(badgeText('tab-2')).toBe('1/2');
        unmount();

        setSidebar({
            editingRule: rule({ tileTargets: { 'tile-app': false } }),
        });
        renderWithProviders(<TabCounts />);
        expect(badgeText('tab-2')).toBe('0/2');
    });

    it('never counts a data app tile as a tile on the active field', () => {
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            dashboardTiles: [
                tile('tile-status', 'tab-1'),
                tile('tile-app', 'tab-1', DashboardTileTypes.DATA_APP),
            ],
        };
        setSidebar({ activeFieldId: 'orders_status' });
        renderWithProviders(<TabCounts />);

        expect(badgeText('tab-1')).toBe('1/1');
    });

    it('shows no count for a placeholder, but keeps its width', () => {
        setSidebar({
            editingRule: rule({ target: { fieldId: '', tableName: '' } }),
            isPlaceholder: true,
        });
        renderWithProviders(<TabCounts />);

        TAB_UUIDS.forEach((tabUuid) => expect(badgeText(tabUuid)).toBe(''));
        expect(badge('tab-1')).toHaveAttribute('data-reserve', '3/3');
    });

    it('shows a full reach as a whole fraction', () => {
        setSidebar({
            editingRule: rule({
                target: { fieldId: 'orders_region', tableName: 'orders' },
            }),
        });
        renderWithProviders(<TabCounts />);

        expect(badgeText('tab-2')).toBe('1/1');
    });

    // Every count fits the width of every tile on its tab, so no count reflows the tabs
    it('reserves the width of every tile on the tab, whatever is active', () => {
        const { rerender } = renderWithProviders(<TabCounts />);
        expect(badge('tab-1')).toHaveAttribute('data-reserve', '3/3');
        expect(badge('tab-2')).toHaveAttribute('data-reserve', '1/1');
        expect(badge('tab-empty')).toHaveAttribute('data-reserve', '0/0');

        setSidebar({ activeFieldId: 'orders_region' });
        rerender(<TabCounts />);
        expect(badgeText('tab-1')).toBe('0/1');
        expect(badge('tab-1')).toHaveAttribute('data-reserve', '3/3');
    });

    // Edit mode keeps every count's space, so opening a filter reflows no tab
    it('keeps an empty, reserved slot on every tab in edit mode while no filter is open', async () => {
        setSidebar({ editingRule: null });
        renderWithProviders(<TabCounts />);

        TAB_UUIDS.forEach((tabUuid) => {
            expect(badgeText(tabUuid)).toBe('');
            expect(mockContainers.current[tabUuid].textContent).toBe('');
        });
        expect(badge('tab-1')).toHaveAttribute('data-reserve', '3/3');
        expect(badge('tab-empty')).toHaveAttribute('data-reserve', '0/0');

        await userEvent.hover(badge('tab-1'));
        await waitForTooltip();
        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    });

    it("renders nothing on a viewer's dashboard while no filter is open", () => {
        setSidebar({ editingRule: null, isViewer: true });
        renderWithProviders(<TabCounts />);

        TAB_UUIDS.forEach((tabUuid) =>
            expect(mockContainers.current[tabUuid].childElementCount).toBe(0),
        );
    });

    it("adds no slot for a viewer's new filter until a field is picked", () => {
        setSidebar({
            editingRule: rule({ target: { fieldId: '', tableName: '' } }),
            isPlaceholder: true,
            isViewer: true,
        });
        renderWithProviders(<TabCounts />);

        TAB_UUIDS.forEach((tabUuid) =>
            expect(mockContainers.current[tabUuid].childElementCount).toBe(0),
        );
    });

    // An editor's tab keeps the shipped width cap, so a long name still truncates
    it("keeps the tab's width cap in edit mode only", () => {
        const { unmount } = renderWithProviders(<TabCounts />);
        expect(badge('tab-1')).toHaveAttribute('data-capped');
        unmount();

        setSidebar({ isViewer: true });
        renderWithProviders(<TabCounts />);
        expect(badge('tab-1')).not.toHaveAttribute('data-capped');
    });

    it('labels the fraction for screen readers in words', () => {
        renderWithProviders(<TabCounts />);

        expect(badgeText('tab-1')).toBe('2/3');
        expect(mockContainers.current['tab-1'].textContent).toContain('2 of 3');
    });

    it('shows no tooltip on a tab with no tile', async () => {
        renderWithProviders(<TabCounts />);

        expect(badgeText('tab-empty')).toBe('0/0');
        await userEvent.hover(badge('tab-empty'));
        await waitForTooltip();
        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    });

    describe('the active tab past the strip', () => {
        const box = (left: number, right: number) =>
            ({ left, right, top: 0, bottom: 20 }) as DOMRect;

        // tab-2 sits at 150-200 in a strip showing 0-100
        const clipTab = () => {
            const list = document.createElement('div');
            list.setAttribute('role', 'tablist');
            Object.defineProperty(list, 'scrollLeft', {
                value: 0,
                writable: true,
            });
            list.getBoundingClientRect = () => box(0, 100);
            const tab = mockContainers.current['tab-2'];
            list.appendChild(tab);
            document.body.appendChild(list);
            tab.getBoundingClientRect = () => box(150, 200);
            tab.scrollIntoView = vi.fn();
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                activeTab: { uuid: 'tab-2', name: 'tab-2', order: 1 },
            };
            return { list, tab };
        };

        it('scrolls the strip, and only the strip, to it', () => {
            const { list, tab } = clipTab();
            const scrollTo = vi.spyOn(window, 'scrollTo');
            renderWithProviders(<TabCounts />);

            expect(list.scrollLeft).toBe(100);
            expect(tab.scrollIntoView).not.toHaveBeenCalled();
            expect(scrollTo).not.toHaveBeenCalled();
            scrollTo.mockRestore();
        });

        it('scrolls to the active tab at rest in edit mode', () => {
            const { list } = clipTab();
            setSidebar({ editingRule: null });
            renderWithProviders(<TabCounts />);

            expect(list.scrollLeft).toBe(100);
        });

        it('never scrolls again when an editor switches filters', () => {
            const { list } = clipTab();
            const { rerender } = renderWithProviders(<TabCounts />);
            list.scrollLeft = 0;
            setSidebar({ editingRule: rule({ id: 'other' }) });
            rerender(<TabCounts />);

            expect(list.scrollLeft).toBe(0);
        });

        it("scrolls when a viewer's filter widens the tabs", () => {
            const { list } = clipTab();
            setSidebar({ editingRule: null, isViewer: true });
            const { rerender } = renderWithProviders(<TabCounts />);
            expect(list.scrollLeft).toBe(0);

            setSidebar({ isViewer: true });
            rerender(<TabCounts />);
            expect(list.scrollLeft).toBe(100);
        });

        it('scrolls once while the edited filter stays', () => {
            const { list } = clipTab();
            const { rerender } = renderWithProviders(<TabCounts />);
            list.scrollLeft = 0;
            setSidebar();
            rerender(<TabCounts />);
            rerender(<TabCounts />);

            expect(list.scrollLeft).toBe(0);
        });
    });
});
