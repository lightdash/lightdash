import {
    DashboardTileTypes,
    DimensionType,
    FieldType,
    FilterOperator,
    type DashboardFilterRule,
    type DashboardParameterControl,
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
        editingControl: null,
        isPlaceholder: false,
        activeFieldId: null,
        ...overrides,
    };
};

const control = (
    tileTargets: DashboardParameterControl['tileTargets'] = {},
): DashboardParameterControl => ({
    id: 'parameter-control',
    label: 'Period',
    parameterKeys: ['start', 'end'],
    tileTargets,
});

const badgeText = (tabUuid: string) =>
    mockContainers.current[tabUuid].textContent;

const isBadgeReached = (tabUuid: string) =>
    mockContainers.current[tabUuid]
        .querySelector('[data-reached]')
        ?.getAttribute('data-reached');

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
            parameterDefinitions: { start: { label: 'Start date' } },
            tileParameterReferences: {
                'tile-both': ['start', 'end'],
                'tile-status': ['start'],
                'tile-region': ['end'],
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

        expect(badgeText('tab-1')).toBe('0 of 3');
        expect(isBadgeReached('tab-1')).toBe('false');
        expect(isBadgeReached('tab-2')).toBe('true');
    });

    it('marks the tabs a parameter control reaches, whole or by parameter', () => {
        setSidebar({ editingRule: null, editingControl: control() });
        const { unmount } = renderWithProviders(<TabCounts />);

        expect(isBadgeReached('tab-1')).toBe('true');
        expect(isBadgeReached('tab-2')).toBe('true');
        unmount();

        setSidebar({
            editingRule: null,
            editingControl: control(),
            activeFieldId: 'start',
        });
        renderWithProviders(<TabCounts />);

        expect(isBadgeReached('tab-1')).toBe('true');
        expect(isBadgeReached('tab-2')).toBe('false');
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

    it('counts the tiles a parameter control sets out of every tile on each tab', async () => {
        setSidebar({
            editingRule: null,
            editingControl: control({ 'tile-status': false }),
        });
        renderWithProviders(<TabCounts />);

        expect(badgeText('tab-1')).toBe('1 of 3');
        expect(badgeText('tab-2')).toBe('1 of 1');
        expect(badgeText('tab-empty')).toBe('');

        await userEvent.hover(screen.getByText('1 of 3'));
        expect(
            await screen.findByText(
                '1 of 3 tiles on this tab are set by this control',
            ),
        ).toBeInTheDocument();
    });

    it('counts the active parameter alone for a parameter control', async () => {
        setSidebar({
            editingRule: null,
            editingControl: control(),
            activeFieldId: 'start',
        });
        renderWithProviders(<TabCounts />);

        expect(badgeText('tab-1')).toBe('2 of 3');
        expect(badgeText('tab-2')).toBe('0 of 1');

        await userEvent.hover(screen.getByText('2 of 3'));
        expect(
            await screen.findByText(
                '2 of 3 tiles on this tab are set by Start date',
            ),
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
