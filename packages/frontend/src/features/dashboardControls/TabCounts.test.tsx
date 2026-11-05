import {
    DashboardTileTypes,
    DimensionType,
    FieldType,
    FilterOperator,
    type DashboardFilterRule,
    type DashboardFilters,
    type DashboardTile,
    type FilterableDimension,
} from '@lightdash/common';
import { screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type SqlChartTileMetadata } from '../../providers/Dashboard/types';
import {
    createDashboardTestStore,
    type DashboardEditTestValues,
    seedDashboardEditState,
} from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import { renderWithProviders as renderWithAppProviders } from '../../testing/testUtils';
import { TabCounts } from './TabCounts';
import type * as PortalTargets from './usePortalTargets';

type PortalTargetsModule = typeof PortalTargets;

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
const mockPortal = vi.hoisted(() => ({
    isReal: false,
    last: null as null | {
        getSelector: (key: string) => string;
        lockSiblings: boolean;
    },
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
vi.mock('./usePortalTargets', async () => {
    const actual =
        await vi.importActual<PortalTargetsModule>('./usePortalTargets');
    return {
        usePortalTargets: (
            keys: string[],
            getSelector: (key: string) => string,
            enabled: boolean,
            lockSiblings: boolean,
        ) => {
            if (mockPortal.isReal)
                return actual.usePortalTargets(
                    keys,
                    getSelector,
                    enabled,
                    lockSiblings,
                );
            mockPortal.last = { getSelector, lockSiblings };
            return enabled
                ? Object.fromEntries(
                      keys.map((key) => [key, mockContainers.current[key]]),
                  )
                : {};
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
        isMapping: true,
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

    it('counts the filtered tiles out of the tiles on each tab that can take the filter', async () => {
        renderWithProviders(<TabCounts />);

        // The markdown tile cannot take a filter: the tabs add up to the row's total
        expect(badgeText('tab-1')).toBe('2/2');
        expect(badgeText('tab-2')).toBe('0/1');
        expect(badgeText('tab-empty')).toBe('0/0');

        await userEvent.hover(screen.getByText('2/2'));
        expect(
            await screen.findByText(
                '2 of 2 tiles on this tab are filtered by this filter',
            ),
        ).toBeInTheDocument();
    });

    it('marks the tabs the control reaches while no field is active', () => {
        renderWithProviders(<TabCounts />);

        expect(isBadgeReached('tab-1')).toBe('true');
        expect(isBadgeReached('tab-2')).toBe('false');
    });

    it("keeps the whole filter's count whichever chip is hovered or selected", () => {
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

        expect(badgeText('tab-1')).toBe('2/2');
        expect(badgeText('tab-2')).toBe('1/1');
        expect(isBadgeBlue('tab-2')).toBe(false);
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
        expect(badgeText('tab-1')).toBe('2/2');
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
    it("keeps the tab's width cap in edit mode", () => {
        renderWithProviders(<TabCounts />);
        expect(badge('tab-1')).toHaveAttribute('data-capped');
    });

    it("never counts a viewer's tabs: a viewer never chooses tiles", () => {
        setSidebar({ isViewer: true, isMapping: false });
        renderWithProviders(<TabCounts />);

        TAB_UUIDS.forEach((tabUuid) =>
            expect(mockContainers.current[tabUuid].childElementCount).toBe(0),
        );
    });

    it('counts only while tiles are chosen: an open filter keeps its slots empty', () => {
        setSidebar({ isMapping: false });
        const { rerender } = renderWithProviders(<TabCounts />);
        TAB_UUIDS.forEach((tabUuid) => expect(badgeText(tabUuid)).toBe(''));

        setSidebar();
        rerender(<TabCounts />);
        expect(badgeText('tab-1')).not.toBe('');
    });

    describe("an editor's slot, shared with the tab menu", () => {
        it("goes into the tab's trailing section in edit mode, the tab itself for a viewer", () => {
            renderWithProviders(<TabCounts hasTabSlots />);
            expect(mockPortal.last?.getSelector('tab-1')).toContain(
                "> [data-position='right']",
            );
            expect(badge('tab-1')).toHaveAttribute('data-controls-overlay');

            setSidebar({ isViewer: true });
            renderWithProviders(<TabCounts hasTabSlots />);
            expect(mockPortal.last?.getSelector('tab-1')).not.toContain(
                'data-position',
            );
        });

        // Locking makes the menu beside the count inert: hidden and out of the tab order
        it('takes the menu out while a filter is open, and gives it back at rest', () => {
            const { rerender } = renderWithProviders(<TabCounts hasTabSlots />);
            expect(mockPortal.last?.lockSiblings).toBe(true);

            setSidebar({ editingRule: null });
            rerender(<TabCounts hasTabSlots />);
            expect(mockPortal.last?.lockSiblings).toBe(false);
        });

        it('takes the menu out for a new filter too', () => {
            setSidebar({
                editingRule: rule({ target: { fieldId: '', tableName: '' } }),
                isPlaceholder: true,
            });
            renderWithProviders(<TabCounts hasTabSlots />);
            expect(mockPortal.last?.lockSiblings).toBe(true);
        });

        it("never locks a viewer's tabs", () => {
            setSidebar({ isViewer: true });
            renderWithProviders(<TabCounts hasTabSlots />);
            expect(mockPortal.last?.lockSiblings).toBe(false);
        });
    });

    // The real target lookup, against the tabs each host renders
    describe('real tab markup', () => {
        beforeEach(() => {
            mockPortal.isReal = true;
            document.body.innerHTML = '';
        });
        afterEach(() => {
            mockPortal.isReal = false;
        });

        // Mantine's ids are "<tabsId>-tab-<value>"
        const tabMarkup = (withSlot: boolean) =>
            TAB_UUIDS.map(
                (uuid) =>
                    `<div data-quiet-actions><button role="tab" id="t-tab-${uuid}"><span class="mantine-Tabs-tabLabel">${uuid}</span>${
                        withSlot
                            ? '<span data-position="right"><span role="button" aria-haspopup="menu">menu</span></span>'
                            : ''
                    }</button></div>`,
            ).join('');
        const embedMarkup = () =>
            TAB_UUIDS.map(
                (uuid) =>
                    `<button role="tab" id="t-tab-${uuid}"><span>${uuid}</span></button>`,
            ).join('');
        const mount = (html: string) => {
            const list = document.createElement('div');
            list.setAttribute('role', 'tablist');
            list.innerHTML = html;
            document.body.appendChild(list);
        };
        const tab = (uuid: string) =>
            document.getElementById(`t-tab-${uuid}`) as HTMLElement;

        it("puts an embed editor's count in the tab node, which has no slot", () => {
            mount(embedMarkup());
            renderWithProviders(<TabCounts />);

            const count = tab('tab-1').querySelector('[data-reserve]');
            expect(count?.parentElement).toBe(tab('tab-1'));
            expect(count).toHaveAttribute('data-capped');
            expect(count?.textContent).toContain('2/2');
            expect(tab('tab-1').querySelector('[inert]')).toBeNull();
        });

        it("puts the app editor's count beside the menu, and locks the menu while a filter is open", () => {
            mount(tabMarkup(true));
            renderWithProviders(<TabCounts hasTabSlots />);

            const slot = tab('tab-1').querySelector('[data-position="right"]');
            expect(slot?.querySelector('[data-reserve]')).not.toBeNull();
            expect(
                slot?.querySelector('[aria-haspopup="menu"]'),
            ).toHaveAttribute('inert');
            expect(
                tab('tab-1').querySelector('.mantine-Tabs-tabLabel'),
            ).not.toHaveAttribute('inert');
        });
    });

    it('labels the fraction for screen readers in words', () => {
        renderWithProviders(<TabCounts />);

        expect(badgeText('tab-1')).toBe('2/2');
        expect(mockContainers.current['tab-1'].textContent).toContain('2 of 2');
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
