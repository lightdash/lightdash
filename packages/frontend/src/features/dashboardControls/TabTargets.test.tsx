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
import { TabTargets } from './TabTargets';

const mockSidebar = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
const mockTileStatusContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));

vi.mock('./useControlsSidebar', () => ({
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
const REGION = { fieldId: 'orders_region', tableName: 'orders' };

const tile = (
    uuid: string,
    tabUuid: string,
    type: DashboardTileTypes = DashboardTileTypes.SAVED_CHART,
) => ({ uuid, tabUuid, type, properties: {} }) as DashboardTile;

const rule = (
    tileTargets?: DashboardFilterRule['tileTargets'],
): DashboardFilterRule => ({
    id: 'control',
    label: undefined,
    operator: FilterOperator.EQUALS,
    target: { fieldId: 'orders_status', tableName: 'orders' },
    values: [],
    ...(tileTargets ? { tileTargets } : {}),
});

const updateFilter = vi.fn();

const setSidebar = (overrides: Record<string, unknown> = {}) => {
    mockSidebar.current = {
        editingRule: rule(),
        isPlaceholder: false,
        updateFilter,
        ...overrides,
    };
};

const TABS = [
    { uuid: 'tab-1', name: 'Sales', order: 0 },
    { uuid: 'tab-2', name: 'Regions', order: 1 },
    { uuid: 'tab-3', name: 'Notes', order: 2 },
];

const checkbox = (tabName: string) =>
    screen.getByRole('checkbox', { name: `Filter every tile on ${tabName}` });

describe('TabTargets', () => {
    beforeEach(() => {
        updateFilter.mockClear();
        mockDashboardContext.current = {
            dashboardTiles: [
                tile('tile-both', 'tab-1'),
                tile('tile-status', 'tab-1'),
                tile('tile-markdown', 'tab-1', DashboardTileTypes.MARKDOWN),
                tile('tile-region', 'tab-2'),
                tile('tile-app', 'tab-2', DashboardTileTypes.DATA_APP),
                tile('tile-sql', 'tab-2', DashboardTileTypes.SQL_CHART),
                tile('tile-note', 'tab-3', DashboardTileTypes.MARKDOWN),
            ],
            dashboardTabs: TABS,
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
        mockTileStatusContext.current = {
            sqlChartTilesMetadata: {
                'tile-sql': {
                    columns: [
                        { reference: 'status_col', type: DimensionType.STRING },
                    ],
                },
            },
        };
        setSidebar();
    });

    it('lists each tab with the count its badge shows', () => {
        renderWithProviders(<TabTargets />);

        expect(screen.getByText('Tabs')).toBeInTheDocument();
        expect(screen.getByText('Sales')).toBeInTheDocument();
        expect(screen.getByText('2 of 3 tiles')).toBeInTheDocument();
        // Regions: the data app tile is on, the other two are not filtered
        expect(screen.getByText('1 of 3 tiles')).toBeInTheDocument();
        expect(screen.getByText('0 of 1 tiles')).toBeInTheDocument();
    });

    it('is checked when every tile it can reach is filtered, unchecked when none is and indeterminate in between', () => {
        setSidebar({
            editingRule: rule({ 'tile-region': REGION, 'tile-app': false }),
        });
        const { unmount } = renderWithProviders(<TabTargets />);

        expect(checkbox('Sales')).toBeChecked();
        expect(checkbox('Sales')).not.toBePartiallyChecked();
        // The SQL chart tile could still be mapped to a column
        expect(checkbox('Regions')).toBePartiallyChecked();
        unmount();

        setSidebar({
            editingRule: rule({ 'tile-both': false, 'tile-status': false }),
        });
        renderWithProviders(<TabTargets />);
        expect(checkbox('Sales')).not.toBeChecked();
        expect(checkbox('Sales')).not.toBePartiallyChecked();
    });

    it('is disabled on a tab where it could switch nothing on', () => {
        renderWithProviders(<TabTargets />);

        expect(checkbox('Notes')).toBeDisabled();
        expect(checkbox('Sales')).toBeEnabled();
    });

    it('switches a filtered tab off in one write, leaving the other tabs alone', async () => {
        setSidebar({ editingRule: rule({ 'tile-region': REGION }) });
        renderWithProviders(<TabTargets />);

        await userEvent.click(checkbox('Sales'));

        expect(updateFilter).toHaveBeenCalledTimes(1);
        expect(updateFilter).toHaveBeenCalledWith(
            rule({
                'tile-region': REGION,
                'tile-both': false,
                'tile-status': false,
            }),
        );
    });

    it('switches a partly filtered tab off, as the shipped popover does', async () => {
        setSidebar({ editingRule: rule({ 'tile-status': false }) });
        renderWithProviders(<TabTargets />);
        expect(checkbox('Sales')).toBePartiallyChecked();

        await userEvent.click(checkbox('Sales'));

        expect(updateFilter).toHaveBeenCalledTimes(1);
        expect(updateFilter).toHaveBeenCalledWith(
            rule({ 'tile-status': false, 'tile-both': false }),
        );
    });

    it("switches a tab on with the filter's own fields, in one write", async () => {
        // Region is a field of the filter through the first tab
        setSidebar({
            editingRule: rule({
                'tile-both': REGION,
                'tile-region': false,
                'tile-app': false,
            }),
        });
        renderWithProviders(<TabTargets />);
        expect(checkbox('Regions')).not.toBeChecked();

        await userEvent.click(checkbox('Regions'));

        expect(updateFilter).toHaveBeenCalledTimes(1);
        // The data app tile follows the rule again; the SQL tile is untouched
        expect(updateFilter).toHaveBeenCalledWith(
            rule({ 'tile-both': REGION, 'tile-region': REGION }),
        );
    });

    it.each([
        ['a dashboard with one tab', { dashboardTabs: [TABS[0]] }, {}],
        ['a dashboard with no tabs', { dashboardTabs: [] }, {}],
        [
            'a new control with no field yet',
            {},
            {
                editingRule: rule(),
                isPlaceholder: true,
            },
        ],
        ['no control', {}, { editingRule: null }],
    ])('renders nothing for %s', (_, dashboard, sidebar) => {
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            ...dashboard,
        };
        setSidebar(sidebar);
        renderWithProviders(<TabTargets />);

        expect(screen.queryByText('Tabs')).not.toBeInTheDocument();
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });
});
