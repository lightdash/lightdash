import {
    DashboardTileTypes,
    DimensionType,
    FieldType,
    FilterOperator,
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
            await screen.findByText('2 of 3 tiles on this tab use this filter'),
        ).toBeInTheDocument();
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

        expect(badgeText('tab-1')).toBe('0 of 3');
        expect(badgeText('tab-2')).toBe('1 of 1');

        await userEvent.hover(screen.getByText('1 of 1'));
        expect(
            await screen.findByText('1 of 1 tiles on this tab use Region'),
        ).toBeInTheDocument();
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
