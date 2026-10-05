import { type DashboardFilterRule } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    addFilterField,
    getFilterTargets,
    getFilterTileMapping,
    getFirstMappingTargets,
    hasUnknownFilterFields,
    mapFilterTile,
    removeFilterField,
    unmapFilterTile,
    type FilterTile,
} from './filterMapping';

type Rule = Pick<
    DashboardFilterRule,
    'target' | 'additionalTargets' | 'tileTargets'
>;

const ordersStatus = { fieldId: 'orders_status', tableName: 'orders' };
const paymentsStatus = { fieldId: 'payments_status', tableName: 'payments' };
const subscriptionsState = {
    fieldId: 'subscriptions_state',
    tableName: 'subscriptions',
};

const tiles: FilterTile[] = [
    { tileUuid: 'orders-1', kind: 'chart', fieldIds: ['orders_status'] },
    { tileUuid: 'orders-2', kind: 'chart', fieldIds: ['orders_status'] },
    {
        tileUuid: 'payments-1',
        kind: 'chart',
        fieldIds: ['payments_status', 'payments_method'],
    },
    {
        tileUuid: 'payments-2',
        kind: 'chart',
        fieldIds: ['payments_status', 'orders_status'],
    },
    { tileUuid: 'subs', kind: 'chart', fieldIds: ['subscriptions_state'] },
    { tileUuid: 'sql', kind: 'sql', fieldIds: ['status'] },
    { tileUuid: 'app', kind: 'dataApp', fieldIds: [] },
];

// A filter first mapped on orders-1
const firstMapped = (): Rule => ({
    target: ordersStatus,
    tileTargets: getFirstMappingTargets('orders-1', ordersStatus, tiles),
});

describe('getFirstMappingTargets', () => {
    it('saves every other tile that has the field as off', () => {
        expect(getFirstMappingTargets('orders-1', ordersStatus, tiles)).toEqual(
            { 'orders-2': false, 'payments-2': false },
        );
    });

    it('writes the column on a SQL chart tile', () => {
        const column = {
            fieldId: 'status',
            tableName: 'mock_table',
            isSqlColumn: true,
        };
        expect(getFirstMappingTargets('sql', column, tiles)).toEqual({
            sql: column,
        });
    });
});

describe('getFilterTileMapping', () => {
    it('applies through the first mapped field a tile has when it has no entry', () => {
        const rule: Rule = {
            target: ordersStatus,
            additionalTargets: [paymentsStatus],
        };
        expect(getFilterTileMapping(rule, tiles[2])).toEqual({
            kind: 'mapped',
            fieldId: 'payments_status',
            isExplicit: false,
        });
        expect(getFilterTileMapping(rule, tiles[3])).toEqual({
            kind: 'mapped',
            fieldId: 'orders_status',
            isExplicit: false,
        });
        expect(getFilterTileMapping(rule, tiles[4])).toEqual({
            kind: 'unmapped',
        });
    });

    it('reports a saved field the chart no longer has', () => {
        const rule: Rule = {
            target: ordersStatus,
            tileTargets: { subs: paymentsStatus },
        };
        expect(getFilterTileMapping(rule, tiles[4])).toEqual({
            kind: 'broken',
            fieldId: 'payments_status',
        });
    });

    it('treats off as unmapped, also for data app tiles', () => {
        const rule = {
            ...firstMapped(),
            tileTargets: { ...firstMapped().tileTargets, app: false as const },
        };
        expect(getFilterTileMapping(rule, tiles[1])).toEqual({
            kind: 'unmapped',
        });
        expect(getFilterTileMapping(rule, tiles[6])).toEqual({
            kind: 'unmapped',
        });
    });
});

describe('mapFilterTile', () => {
    it('maps a second tile to the own field by dropping its off entry', () => {
        const rule = mapFilterTile(
            firstMapped(),
            'orders-2',
            ordersStatus,
            tiles,
        );
        expect(rule.tileTargets).toEqual({ 'payments-2': false });
        expect(rule.additionalTargets).toBeUndefined();
    });

    it('adds a new field per tile and to the additional targets, and takes the other tiles with it out', () => {
        const rule = mapFilterTile(
            firstMapped(),
            'payments-1',
            paymentsStatus,
            tiles,
        );
        expect(rule.target).toEqual(ordersStatus);
        expect(rule.additionalTargets).toEqual([paymentsStatus]);
        // payments-2 already had an off entry, so it stays as the author left it
        expect(rule.tileTargets).toEqual({
            'orders-2': false,
            'payments-2': false,
            'payments-1': paymentsStatus,
        });
    });

    it('writes off for unmapped tiles that would pick up a new field', () => {
        const start: Rule = { target: ordersStatus, tileTargets: {} };
        const rule = mapFilterTile(start, 'payments-1', paymentsStatus, [
            ...tiles,
            {
                tileUuid: 'payments-3',
                kind: 'chart',
                fieldIds: ['payments_status'],
            },
        ]);
        expect(rule.tileTargets).toEqual({
            'payments-1': paymentsStatus,
            'payments-3': false,
        });
    });

    it('does not take out tiles when the field is already mapped', () => {
        const withPayments = mapFilterTile(
            firstMapped(),
            'payments-1',
            paymentsStatus,
            tiles,
        );
        const rule = mapFilterTile(
            withPayments,
            'payments-2',
            paymentsStatus,
            tiles,
        );
        expect(rule.tileTargets?.['payments-2']).toEqual(paymentsStatus);
        expect(rule.additionalTargets).toEqual([paymentsStatus]);
    });

    it('drops a field no tile uses after a tile changes field', () => {
        const withPayments = mapFilterTile(
            firstMapped(),
            'payments-1',
            paymentsStatus,
            tiles,
        );
        const rule = mapFilterTile(
            withPayments,
            'payments-1',
            { fieldId: 'payments_method', tableName: 'payments' },
            tiles,
        );
        expect(rule.additionalTargets).toEqual([
            { fieldId: 'payments_method', tableName: 'payments' },
        ]);
    });
});

describe('unmapFilterTile', () => {
    it('saves off when the chart has a mapped field', () => {
        const both = mapFilterTile(
            firstMapped(),
            'orders-2',
            ordersStatus,
            tiles,
        );
        const rule = unmapFilterTile(both, 'orders-2', tiles);
        expect(rule.tileTargets?.['orders-2']).toBe(false);
    });

    it('deletes the entry when the chart has no mapped field left', () => {
        const withSubs = mapFilterTile(
            firstMapped(),
            'subs',
            subscriptionsState,
            tiles,
        );
        expect(withSubs.additionalTargets).toEqual([subscriptionsState]);
        const rule = unmapFilterTile(withSubs, 'subs', tiles);
        expect(rule.additionalTargets).toBeUndefined();
        expect(rule.tileTargets).not.toHaveProperty('subs');
    });

    it('promotes the next field when the own field loses its last tile', () => {
        const withPayments = mapFilterTile(
            firstMapped(),
            'payments-1',
            paymentsStatus,
            tiles,
        );
        const rule = unmapFilterTile(withPayments, 'orders-1', tiles);
        expect(rule.target).toEqual(paymentsStatus);
        expect(rule.additionalTargets).toBeUndefined();
        // payments-2 has the promoted field, so it stays off; orders-only tiles need no entry
        expect(rule.tileTargets).toEqual({
            'payments-2': false,
            'payments-1': paymentsStatus,
        });
    });

    it('keeps the field when the last tile is taken out', () => {
        const rule = unmapFilterTile(firstMapped(), 'orders-1', tiles);
        expect(rule.target).toEqual(ordersStatus);
        expect(rule.tileTargets?.['orders-1']).toBe(false);
    });
});

// A control being added: no field yet
const noField = (): Rule => ({
    target: { fieldId: '', tableName: '' },
    tileTargets: {},
});

const mappedTiles = (rule: Rule): Record<string, string> =>
    Object.fromEntries(
        tiles.flatMap((tile) => {
            const mapping = getFilterTileMapping(rule, tile);
            // Data app tiles have no field: they are checked on their own
            return mapping.kind === 'mapped' && tile.kind !== 'dataApp'
                ? [[tile.tileUuid, mapping.fieldId]]
                : [];
        }),
    );

describe('a control with no field', () => {
    it('maps no chart or SQL tile', () => {
        expect(mappedTiles(noField())).toEqual({});
        expect(getFilterTargets(noField())).toEqual([]);
    });

    it('takes the first field chosen on a tile as its own, on that tile only', () => {
        const rule = mapFilterTile(noField(), 'orders-1', ordersStatus, tiles);
        expect(rule.target).toEqual(ordersStatus);
        expect(rule.additionalTargets).toBeUndefined();
        expect(rule.tileTargets).toEqual({
            'orders-2': false,
            'payments-2': false,
        });
        expect(mappedTiles(rule)).toEqual({ 'orders-1': 'orders_status' });
    });
});

describe('addFilterField', () => {
    it('maps every tile that has the field when the control has none yet', () => {
        const rule = addFilterField(noField(), ordersStatus, tiles);
        expect(rule.target).toEqual(ordersStatus);
        expect(rule.tileTargets).toEqual({});
        expect(mappedTiles(rule)).toEqual({
            'orders-1': 'orders_status',
            'orders-2': 'orders_status',
            'payments-2': 'orders_status',
        });
    });

    it('adds a second field on the unmapped tiles and leaves mapped tiles alone', () => {
        const rule = addFilterField(
            addFilterField(noField(), ordersStatus, tiles),
            paymentsStatus,
            tiles,
        );
        expect(rule.target).toEqual(ordersStatus);
        expect(rule.additionalTargets).toEqual([paymentsStatus]);
        // payments-2 has both fields and stays on the one it was mapped to
        expect(mappedTiles(rule)).toEqual({
            'orders-1': 'orders_status',
            'orders-2': 'orders_status',
            'payments-1': 'payments_status',
            'payments-2': 'orders_status',
        });
    });

    it('maps the tiles left out of a field that is already mapped', () => {
        const one = mapFilterTile(noField(), 'orders-1', ordersStatus, tiles);
        const rule = addFilterField(one, ordersStatus, tiles);
        expect(rule.tileTargets).toEqual({});
        expect(Object.keys(mappedTiles(rule))).toEqual([
            'orders-1',
            'orders-2',
            'payments-2',
        ]);
    });
});

describe('data app tiles', () => {
    const app = tiles[6];
    const isOn = (rule: Rule) =>
        getFilterTileMapping(rule, app).kind === 'mapped';

    it('are on by default, with nothing written for them', () => {
        expect(isOn(noField())).toBe(true);
        const rule = addFilterField(noField(), ordersStatus, tiles);
        expect(rule.tileTargets).toEqual({});
        expect(isOn(rule)).toBe(true);
        expect(isOn({ target: ordersStatus })).toBe(true);
    });

    it('are off only where the author switched them off, and back on by dropping that', () => {
        const off = unmapFilterTile(
            addFilterField(noField(), ordersStatus, tiles),
            'app',
            tiles,
        );
        expect(off.tileTargets).toEqual({ app: false });
        expect(isOn(off)).toBe(false);
        const on = mapFilterTile(off, 'app', ordersStatus, tiles);
        expect(on.tileTargets).toEqual({});
        expect(isOn(on)).toBe(true);
    });

    it('stay off across the first mapping when switched off before a field exists', () => {
        const off = unmapFilterTile(noField(), 'app', tiles);
        expect(off.tileTargets).toEqual({ app: false });
        const rule = addFilterField(off, ordersStatus, tiles);
        expect(rule.target).toEqual(ordersStatus);
        expect(rule.tileTargets).toEqual({ app: false });
    });

    it('are left as they are when a field is removed', () => {
        const rule = removeFilterField(
            addFilterField(noField(), ordersStatus, tiles),
            ordersStatus,
            tiles,
        );
        expect(isOn(rule)).toBe(true);
        expect(rule.tileTargets?.app).toBeUndefined();
        expect(mappedTiles(rule)).toEqual({});
    });
});

describe('removeFilterField', () => {
    const both = () =>
        addFilterField(
            addFilterField(noField(), ordersStatus, tiles),
            paymentsStatus,
            tiles,
        );

    it('unmaps every tile of the field and promotes the next field', () => {
        const rule = removeFilterField(both(), ordersStatus, tiles);
        expect(rule.target).toEqual(paymentsStatus);
        expect(rule.additionalTargets).toBeUndefined();
        expect(mappedTiles(rule)).toEqual({ 'payments-1': 'payments_status' });
        // payments-2 also has the remaining field, so it is saved as off
        expect(rule.tileTargets?.['payments-2']).toBe(false);
        expect(rule.tileTargets?.['orders-1']).toBeUndefined();
    });

    it('leaves the other fields alone when an additional field goes', () => {
        const rule = removeFilterField(both(), paymentsStatus, tiles);
        expect(rule.target).toEqual(ordersStatus);
        expect(rule.additionalTargets).toBeUndefined();
        expect(mappedTiles(rule)).toEqual({
            'orders-1': 'orders_status',
            'orders-2': 'orders_status',
            'payments-2': 'orders_status',
        });
    });

    it('maps nothing once the last field is removed, and can be mapped again', () => {
        const none = removeFilterField(
            addFilterField(noField(), ordersStatus, tiles),
            ordersStatus,
            tiles,
        );
        expect(mappedTiles(none)).toEqual({});
        const again = addFilterField(none, paymentsStatus, tiles);
        expect(again.target).toEqual(paymentsStatus);
        expect(mappedTiles(again)).toEqual({
            'payments-1': 'payments_status',
            'payments-2': 'payments_status',
        });
    });
});

describe('fields not loaded yet', () => {
    const withUnloaded = (tileUuid: string): FilterTile[] =>
        tiles.map((tile) =>
            tile.tileUuid === tileUuid ? { ...tile, fieldIds: null } : tile,
        );

    it('does not write a mapping while a chart tile has no field list', () => {
        const loading = withUnloaded('orders-2');
        const rule = firstMapped();
        expect(hasUnknownFilterFields(loading)).toBe(true);
        expect(mapFilterTile(rule, 'payments-1', paymentsStatus, loading)).toBe(
            rule,
        );
        expect(unmapFilterTile(rule, 'orders-1', loading)).toBe(rule);
    });

    it('keeps the off entry of a SQL tile whose columns are unknown', () => {
        const unvisited = withUnloaded('sql');
        expect(hasUnknownFilterFields(unvisited)).toBe(false);
        const rule: Rule = {
            target: ordersStatus,
            tileTargets: { 'orders-2': false, sql: false },
        };
        const next = mapFilterTile(
            rule,
            'payments-1',
            paymentsStatus,
            unvisited,
        );
        expect(next.tileTargets?.sql).toBe(false);
        // With its columns loaded and no field that applies, the entry goes
        expect(
            mapFilterTile(rule, 'payments-1', paymentsStatus, tiles)
                .tileTargets,
        ).not.toHaveProperty('sql');
    });

    it('does not call a saved field missing before the fields load', () => {
        const rule: Rule = {
            target: ordersStatus,
            tileTargets: { sql: { ...ordersStatus, isSqlColumn: true } },
        };
        expect(getFilterTileMapping(rule, withUnloaded('sql')[5])).toEqual({
            kind: 'mapped',
            fieldId: 'orders_status',
            isExplicit: true,
        });
    });
});
