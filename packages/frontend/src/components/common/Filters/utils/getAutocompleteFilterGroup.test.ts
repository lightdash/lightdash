import {
    DashboardTileTypes,
    DimensionType,
    FieldType,
    FilterOperator,
    type DashboardChartTile,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardFilters,
    type DashboardTile,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getAutocompleteFilterGroup } from './getAutocompleteFilterGroup';

// --- Test fixtures ---

const TAB_A_UUID = 'tab-a-uuid';
const TAB_B_UUID = 'tab-b-uuid';

const makeTile = (uuid: string, tabUuid: string): DashboardChartTile => ({
    uuid,
    type: DashboardTileTypes.SAVED_CHART,
    x: 0,
    y: 0,
    h: 1,
    w: 1,
    tabUuid,
    properties: {
        savedChartUuid: uuid,
        belongsToDashboard: true,
        chartName: `Chart ${uuid}`,
        lastVersionChartKind: null,
    },
});

const tileA1 = makeTile('tile-a1', TAB_A_UUID);
const tileA2 = makeTile('tile-a2', TAB_A_UUID);
const tileB1 = makeTile('tile-b1', TAB_B_UUID);
const tileB2 = makeTile('tile-b2', TAB_B_UUID);

const allTiles: DashboardTile[] = [tileA1, tileA2, tileB1, tileB2];

const makeField = (
    fieldId: string,
    table: string,
): DashboardFilterableField => ({
    name: fieldId.split('_').slice(1).join('_'),
    type: DimensionType.STRING,
    table,
    tableLabel: table,
    label: fieldId,
    fieldType: FieldType.DIMENSION,
    sql: fieldId,
    hidden: false,
});

// All chart tiles have access to both orders and payments fields
// (they're related tables in the same explore)
const sharedFields = [
    makeField('payments_payment_method', 'payments'),
    makeField('orders_is_completed', 'orders'),
    makeField('orders_order_date_year', 'orders'),
    makeField('orders_status', 'orders'),
];

const filterableFieldsByTileUuid: Record<string, DashboardFilterableField[]> = {
    'tile-a1': sharedFields,
    'tile-a2': sharedFields,
    'tile-b1': sharedFields,
    'tile-b2': sharedFields,
};

// Global filter: payment_method (undefined tileTargets = applies to all tiles with field)
const paymentMethodFilter: DashboardFilterRule = {
    id: 'filter-payment-method',
    target: { fieldId: 'payments_payment_method', tableName: 'payments' },
    operator: FilterOperator.EQUALS,
    values: [],
    label: undefined,
};

// Tab B-scoped filter: is_completed = true (explicitly disabled on Tab A tiles)
// Tiles not in tileTargets auto-apply if they have the field.
const isCompletedFilter: DashboardFilterRule = {
    id: 'filter-is-completed',
    target: { fieldId: 'orders_is_completed', tableName: 'orders' },
    operator: FilterOperator.EQUALS,
    values: [true],
    label: undefined,
    tileTargets: {
        'tile-a1': false,
        'tile-a2': false,
        // tile-b1 and tile-b2 not listed → auto-apply (have the field)
    },
};

// Global filter: order_date (undefined tileTargets = applies to all tiles with field)
const orderDateFilter: DashboardFilterRule = {
    id: 'filter-order-date',
    target: { fieldId: 'orders_order_date_year', tableName: 'orders' },
    operator: FilterOperator.IN_THE_PAST,
    values: [10],
    settings: { completed: true, unitOfTime: 'years' },
    label: undefined,
};

const dashboardFilters: DashboardFilters = {
    dimensions: [paymentMethodFilter, isCompletedFilter, orderDateFilter],
    metrics: [],
    tableCalculations: [],
};

// --- Tests ---

describe('getAutocompleteFilterGroup', () => {
    it('excludes the current filter from the autocomplete group', () => {
        const result = getAutocompleteFilterGroup({
            filterId: paymentMethodFilter.id,
            item: makeField('payments_payment_method', 'payments'),
            dashboardFilters,
            dashboardTiles: allTiles,
            filterableFieldsByTileUuid,
            activeTabUuid: TAB_A_UUID,
        });

        const filterIds = result?.and.map((f) => f.id);
        expect(filterIds).not.toContain(paymentMethodFilter.id);
    });

    it('excludes same-field filters from the autocomplete group', () => {
        const secondPaymentFilter: DashboardFilterRule = {
            id: 'filter-payment-method-2',
            target: {
                fieldId: 'payments_payment_method',
                tableName: 'payments',
            },
            operator: FilterOperator.NOT_EQUALS,
            values: ['coupon'],
            label: undefined,
        };

        const filters: DashboardFilters = {
            ...dashboardFilters,
            dimensions: [...dashboardFilters.dimensions, secondPaymentFilter],
        };

        const result = getAutocompleteFilterGroup({
            filterId: paymentMethodFilter.id,
            item: makeField('payments_payment_method', 'payments'),
            dashboardFilters: filters,
            dashboardTiles: allTiles,
            filterableFieldsByTileUuid,
            activeTabUuid: TAB_A_UUID,
        });

        const filterIds = result?.and.map((f) => f.id);
        expect(filterIds).not.toContain(secondPaymentFilter.id);
    });

    it('includes global filters with tile overlap on the active tab', () => {
        const result = getAutocompleteFilterGroup({
            filterId: paymentMethodFilter.id,
            item: makeField('payments_payment_method', 'payments'),
            dashboardFilters,
            dashboardTiles: allTiles,
            filterableFieldsByTileUuid,
            activeTabUuid: TAB_A_UUID,
        });

        const filterIds = result?.and.map((f) => f.id);
        expect(filterIds).toContain(orderDateFilter.id);
    });

    it('excludes tab-scoped filters that do not apply to the active tab', () => {
        // BUG REPRO: When on Tab A, the is_completed filter (scoped to Tab B
        // only, with Tab A tiles set to false) should NOT be included in the
        // autocomplete group for the payment_method filter.
        const result = getAutocompleteFilterGroup({
            filterId: paymentMethodFilter.id,
            item: makeField('payments_payment_method', 'payments'),
            dashboardFilters,
            dashboardTiles: allTiles,
            filterableFieldsByTileUuid,
            activeTabUuid: TAB_A_UUID,
        });

        const filterIds = result?.and.map((f) => f.id);
        expect(filterIds).not.toContain(isCompletedFilter.id);
    });

    it('includes tab-scoped filters when on the same tab', () => {
        const statusFilter: DashboardFilterRule = {
            id: 'filter-status',
            target: { fieldId: 'orders_status', tableName: 'orders' },
            operator: FilterOperator.EQUALS,
            values: [],
            label: undefined,
            tileTargets: {
                'tile-a1': false,
                'tile-a2': false,
                // tile-b1 and tile-b2 not listed → auto-apply
            },
        };

        const filters: DashboardFilters = {
            ...dashboardFilters,
            dimensions: [...dashboardFilters.dimensions, statusFilter],
        };

        const result = getAutocompleteFilterGroup({
            filterId: statusFilter.id,
            item: makeField('orders_status', 'orders'),
            dashboardFilters: filters,
            dashboardTiles: allTiles,
            filterableFieldsByTileUuid,
            activeTabUuid: TAB_B_UUID,
        });

        const filterIds = result?.and.map((f) => f.id);
        expect(filterIds).toContain(isCompletedFilter.id);
    });

    it('works without tabs (activeTabUuid undefined)', () => {
        // When there are no tabs, all tiles are considered for overlap.
        // is_completed applies to tile-b1/b2, payment_method applies to all,
        // so overlap exists on tile-b1/b2.
        const result = getAutocompleteFilterGroup({
            filterId: paymentMethodFilter.id,
            item: makeField('payments_payment_method', 'payments'),
            dashboardFilters,
            dashboardTiles: allTiles,
            filterableFieldsByTileUuid,
            activeTabUuid: undefined,
        });

        const filterIds = result?.and.map((f) => f.id);
        expect(filterIds).toContain(isCompletedFilter.id);
        expect(filterIds).toContain(orderDateFilter.id);
    });
});
