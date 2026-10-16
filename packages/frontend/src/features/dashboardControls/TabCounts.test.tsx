import {
    DashboardTileTypes,
    DimensionType,
    FieldType,
    FilterOperator,
    MetricType,
    type DashboardFilterRule,
    type DashboardTile,
    type FilterableDimension,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { TabCounts } from './TabCounts';

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
vi.mock('../../providers/Dashboard/useDashboardTileStatusContext', () => ({
    default: vi.fn((selector) => selector({ sqlChartTilesMetadata: {} })),
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
        activeFieldId: null,
        ...overrides,
    };
};

const badgeText = (tabUuid: string) =>
    mockContainers.current[tabUuid].textContent;

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
    badge(tabUuid).style.getPropertyValue('--badge-color').includes('blue');

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

        expect(badgeText('tab-1')).toBe('2 of 3');
        expect(badgeText('tab-2')).toBe('0 of 1');
        expect(badgeText('tab-empty')).toBe('');

        await userEvent.hover(screen.getByText('2 of 3'));
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

        expect(badgeText('tab-1')).toBe('0 of 1');
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

        expect(badgeText('tab-1')).toBe('0 of 1');
        expect(badgeText('tab-2')).toBe('1 of 1');

        await userEvent.hover(screen.getByText('1 of 1'));
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

        await userEvent.hover(screen.getByText('1 of 1'));
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

        await userEvent.hover(screen.getByText('1 of 1'));
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

        expect(badgeText('tab-1')).toBe('2 of 3');
        expect(badgeText('tab-2')).toBe('');
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
        expect(badgeText('tab-2')).toBe('1 of 2');
        unmount();

        setSidebar({
            editingRule: rule({ tileTargets: { 'tile-app': false } }),
        });
        renderWithProviders(<TabCounts />);
        expect(badgeText('tab-2')).toBe('0 of 2');
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

        expect(badgeText('tab-1')).toBe('1 of 1');
    });

    it('renders nothing for a placeholder', () => {
        setSidebar({
            editingRule: rule({ target: { fieldId: '', tableName: '' } }),
            isPlaceholder: true,
        });
        renderWithProviders(<TabCounts />);

        TAB_UUIDS.forEach((tabUuid) => expect(badgeText(tabUuid)).toBe(''));
    });

    it('renders nothing when no control is edited', () => {
        setSidebar({ editingRule: null });
        renderWithProviders(<TabCounts />);

        TAB_UUIDS.forEach((tabUuid) => expect(badgeText(tabUuid)).toBe(''));
    });
});
