import {
    DashboardTileTypes,
    DimensionType,
    FilterOperator,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardTile,
} from '@lightdash/common';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    isFilterHiddenOnTab,
    useFilterTabPlacement,
} from './useFilterTabPlacement';

const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));

vi.mock('../../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector: (context: Record<string, unknown>) => unknown) =>
        selector(mockDashboardContext.current),
    ),
}));
vi.mock('../../../ee/providers/Embed/useUiStrings', () => ({
    useUiStrings: () => (key: string) => key,
}));

const rule = (
    overrides: Partial<DashboardFilterRule> = {},
): DashboardFilterRule => ({
    id: 'a',
    label: undefined,
    operator: FilterOperator.EQUALS,
    target: { fieldId: 'orders_status', tableName: 'orders' },
    values: ['done'],
    ...overrides,
});

const tile = (uuid: string, tabUuid: string | undefined) =>
    ({
        uuid,
        tabUuid,
        type: DashboardTileTypes.SAVED_CHART,
        properties: {},
    }) as DashboardTile;

const statusField = {
    name: 'status',
    table: 'orders',
    tableLabel: 'Orders',
    label: 'Status',
    type: DimensionType.STRING,
    fieldType: 'dimension',
} as DashboardFilterableField;

const tab = (uuid: string, order: number) => ({ uuid, name: uuid, order });

const place = (filterRule: DashboardFilterRule, activeTabUuid?: string) => {
    const { result } = renderHook(() => useFilterTabPlacement());
    const appliesToTabs = result.current.getTabsUsingFilter(filterRule);
    return {
        appliesToTabs,
        isHidden: isFilterHiddenOnTab(appliesToTabs, activeTabUuid),
        ...result.current.getOrphanedState(filterRule, appliesToTabs),
    };
};

describe('useFilterTabPlacement', () => {
    beforeEach(() => {
        mockDashboardContext.current = {
            dashboardTiles: [tile('tile-1', undefined)],
            dashboardTabs: [],
            filterableFieldsByTileUuid: { 'tile-1': [statusField] },
        };
    });

    it('decides by tiles on a dashboard with no tabs', () => {
        expect(place(rule())).toEqual({
            appliesToTabs: [],
            isHidden: false,
            isOrphaned: false,
            orphanedTooltip: 'filters.notAppliedToAnyTiles',
        });
        expect(
            place(rule({ tileTargets: { 'tile-1': false } })).isOrphaned,
        ).toBe(true);
    });

    it('decides by tiles on a dashboard with one tab', () => {
        mockDashboardContext.current.dashboardTiles = [tile('tile-1', 'tab-1')];
        mockDashboardContext.current.dashboardTabs = [tab('tab-1', 0)];

        expect(
            place(
                rule({
                    target: { fieldId: 'orders_region', tableName: 'orders' },
                }),
                'tab-1',
            ),
        ).toMatchObject({
            isOrphaned: true,
            orphanedTooltip: 'filters.notAppliedToAnyTiles',
        });
    });

    it('decides by tabs when there is more than one', () => {
        mockDashboardContext.current.dashboardTiles = [
            tile('tile-1', 'tab-1'),
            tile('tile-2', 'tab-2'),
        ];
        mockDashboardContext.current.dashboardTabs = [
            tab('tab-2', 1),
            tab('tab-1', 0),
        ];

        expect(place(rule(), 'tab-2')).toEqual({
            appliesToTabs: ['tab-1'],
            isHidden: true,
            isOrphaned: false,
            orphanedTooltip: 'filters.notAppliedToAnyTabs',
        });
        expect(place(rule(), 'tab-1').isHidden).toBe(false);
        // A filter on no tab always shows, marked as not applied
        expect(
            place(rule({ tileTargets: { 'tile-1': false } }), 'tab-2'),
        ).toMatchObject({ isHidden: false, isOrphaned: true });
    });
});
