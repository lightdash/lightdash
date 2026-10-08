import {
    DashboardTileTypes,
    DimensionType,
    FilterOperator,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardFilters,
    type DashboardTile,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getFilterPillLabels,
    getFilterPillPlacement,
    moveFilterRule,
    showsComposedValue,
} from './pillState';

const rule = (
    id: string,
    overrides: Partial<DashboardFilterRule> = {},
): DashboardFilterRule => ({
    id,
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

const getUiString = (key: string) => key;

describe('moveFilterRule', () => {
    const filters: DashboardFilters = {
        dimensions: [rule('a'), rule('b'), rule('c')],
        metrics: [rule('m1'), rule('m2')],
        tableCalculations: [],
    };

    it('moves a dimension rule to the place of another', () => {
        const next = moveFilterRule(filters, 'dimensions', 'a', 'c');

        expect(next.dimensions.map((r) => r.id)).toEqual(['b', 'c', 'a']);
        expect(next.metrics).toBe(filters.metrics);
    });

    it('moves a metric rule inside the metrics only', () => {
        const next = moveFilterRule(filters, 'metrics', 'm2', 'm1');

        expect(next.metrics.map((r) => r.id)).toEqual(['m2', 'm1']);
        expect(next.dimensions).toBe(filters.dimensions);
    });

    it('changes nothing across groups or for an unknown rule', () => {
        expect(moveFilterRule(filters, 'dimensions', 'a', 'm1')).toBe(filters);
        expect(moveFilterRule(filters, 'metrics', 'gone', 'm1')).toBe(filters);
        expect(moveFilterRule(filters, 'dimensions', 'a', 'a')).toBe(filters);
    });
});

describe('getFilterPillPlacement', () => {
    const fieldsByTile = { 'tile-1': [statusField] };

    it('decides by tiles on a dashboard with no tabs', () => {
        const context = {
            dashboardTiles: [tile('tile-1', undefined)],
            sortedTabUuids: [],
            filterableFieldsByTileUuid: fieldsByTile,
            activeTabUuid: undefined,
        };

        expect(getFilterPillPlacement(rule('a'), context)).toEqual({
            isOnActiveTab: true,
            isOnNoTab: true,
            isOrphaned: false,
            orphanedTooltipKey: 'filters.notAppliedToAnyTiles',
        });
        expect(
            getFilterPillPlacement(
                rule('a', { tileTargets: { 'tile-1': false } }),
                context,
            ).isOrphaned,
        ).toBe(true);
    });

    it('decides by tiles on a dashboard with one tab', () => {
        const placement = getFilterPillPlacement(
            rule('a', {
                target: { fieldId: 'orders_region', tableName: 'orders' },
            }),
            {
                dashboardTiles: [tile('tile-1', 'tab-1')],
                sortedTabUuids: ['tab-1'],
                filterableFieldsByTileUuid: fieldsByTile,
                activeTabUuid: 'tab-1',
            },
        );

        expect(placement.isOrphaned).toBe(true);
        expect(placement.orphanedTooltipKey).toBe(
            'filters.notAppliedToAnyTiles',
        );
    });

    it('decides by tabs when there is more than one', () => {
        const context = {
            dashboardTiles: [tile('tile-1', 'tab-1'), tile('tile-2', 'tab-2')],
            sortedTabUuids: ['tab-1', 'tab-2'],
            filterableFieldsByTileUuid: fieldsByTile,
            activeTabUuid: 'tab-2',
        };

        expect(getFilterPillPlacement(rule('a'), context)).toEqual({
            isOnActiveTab: false,
            isOnNoTab: false,
            isOrphaned: false,
            orphanedTooltipKey: 'filters.notAppliedToAnyTabs',
        });
        expect(
            getFilterPillPlacement(
                rule('a', { tileTargets: { 'tile-1': false } }),
                context,
            ),
        ).toMatchObject({ isOnNoTab: true, isOrphaned: true });
    });
});

describe('getFilterPillLabels', () => {
    it('names a field by its label', () => {
        expect(
            getFilterPillLabels(rule('a'), statusField, {}, getUiString).field,
        ).toBe('Status');
    });

    it('names a SQL column a tile reported, with its type', () => {
        const sqlRule = rule('a', {
            operator: FilterOperator.GREATER_THAN,
            target: {
                fieldId: 'amount',
                tableName: 'sql',
                isSqlColumn: true,
            },
            values: [10],
        });
        const labels = getFilterPillLabels(
            sqlRule,
            undefined,
            {
                'tile-1': {
                    columns: [
                        { reference: 'amount', type: DimensionType.NUMBER },
                    ],
                },
            },
            getUiString,
        );

        expect(labels.field).toBe('amount');
        expect(labels.value).toBe('10');
    });

    it('falls back to the field id and the type on the target', () => {
        const labels = getFilterPillLabels(
            rule('a', {
                target: {
                    fieldId: 'created',
                    tableName: 'sql',
                    isSqlColumn: true,
                    fallbackType: DimensionType.DATE,
                },
                values: ['2025-07-06'],
            }),
            undefined,
            {},
            getUiString,
        );

        expect(labels.field).toBe('created');
    });
});

describe('showsComposedValue', () => {
    it('is true for dates and booleans, from the field or the target', () => {
        expect(showsComposedValue(rule('a'), statusField)).toBe(false);
        expect(
            showsComposedValue(rule('a'), {
                ...statusField,
                type: DimensionType.BOOLEAN,
            } as DashboardFilterableField),
        ).toBe(true);
        expect(
            showsComposedValue(
                rule('a', {
                    target: {
                        fieldId: 'created',
                        tableName: 'sql',
                        fallbackType: DimensionType.TIMESTAMP,
                    },
                }),
                undefined,
            ),
        ).toBe(true);
    });
});
