import {
    DashboardTileTypes,
    FilterOperator,
    type DashboardFieldTarget,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardTab,
    type DashboardTile,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    applyFieldToAll,
    getDefaultTileField,
    getFieldCount,
    getFilterFields,
    getTabCounts,
    getTileField,
    isTileChanged,
    removeField,
    removeFieldFromAll,
    setTileField,
} from './peers';

const field = (table: string, name: string) =>
    ({ table, name }) as DashboardFilterableField;

const tile = (uuid: string, tabUuid: string) =>
    ({
        uuid,
        tabUuid,
        type: DashboardTileTypes.SAVED_CHART,
    }) as DashboardTile;

const ORDERS: DashboardFieldTarget = {
    fieldId: 'orders_status',
    tableName: 'orders',
};
const PAYMENTS: DashboardFieldTarget = {
    fieldId: 'payments_status',
    tableName: 'payments',
};

// a: orders only, b: both fields, c: payments only, d: neither, e: not a chart
const tiles = [
    tile('a', 't1'),
    tile('b', 't1'),
    tile('c', 't2'),
    tile('d', 't2'),
    tile('e', 't2'),
];
const [a, b, c, d] = tiles;
const fieldsByTile: Record<string, DashboardFilterableField[]> = {
    a: [field('orders', 'status')],
    b: [field('orders', 'status'), field('payments', 'status')],
    c: [field('payments', 'status')],
    d: [field('customers', 'name')],
};
const tabs = [
    { uuid: 't1', name: 'One', order: 0 },
    { uuid: 't2', name: 'Two', order: 1 },
] as DashboardTab[];

const rule = (
    tileTargets?: DashboardFilterRule['tileTargets'],
): DashboardFilterRule => ({
    id: 'f1',
    label: undefined,
    operator: FilterOperator.EQUALS,
    target: ORDERS,
    values: [],
    ...(tileTargets ? { tileTargets } : {}),
});

describe('peers', () => {
    it('resolves auto, excluded and peer tiles', () => {
        const r = rule({ b: false, c: PAYMENTS });
        expect(getTileField(r, a, fieldsByTile)).toEqual(ORDERS);
        expect(getTileField(r, b, fieldsByTile)).toBeNull();
        expect(getTileField(r, c, fieldsByTile)).toEqual(PAYMENTS);
        expect(getTileField(r, d, fieldsByTile)).toBeNull();
        expect(getDefaultTileField(r, b, fieldsByTile)).toEqual(ORDERS);
        expect(getDefaultTileField(r, c, fieldsByTile)).toBeNull();
    });

    it('detects changed tiles only when the entry differs from the default', () => {
        const r = rule({ a: ORDERS, b: false, c: PAYMENTS, d: false });
        expect(isTileChanged(r, a, fieldsByTile)).toBe(false);
        expect(isTileChanged(r, b, fieldsByTile)).toBe(true);
        expect(isTileChanged(r, c, fieldsByTile)).toBe(true);
        expect(isTileChanged(r, d, fieldsByTile)).toBe(false);
        expect(isTileChanged(rule(), a, fieldsByTile)).toBe(false);
    });

    it('lists fields in order without duplicates', () => {
        expect(
            getFilterFields(rule({ b: PAYMENTS, c: PAYMENTS, d: false }), [
                'orders_status',
                'customers_name',
            ]),
        ).toEqual(['orders_status', 'payments_status', 'customers_name']);
    });

    it('counts applied and possible charts per field', () => {
        const r = rule({ c: PAYMENTS });
        expect(getFieldCount(r, 'orders_status', tiles, fieldsByTile)).toEqual({
            applied: 2,
            possible: 2,
        });
        expect(
            getFieldCount(r, 'payments_status', tiles, fieldsByTile),
        ).toEqual({ applied: 1, possible: 2 });
    });

    it('setTileField writes minimal entries and deletes ones equal to the default', () => {
        const excluded = setTileField(rule(), a, null, fieldsByTile);
        expect(excluded.tileTargets).toEqual({ a: false });
        const back = setTileField(excluded, a, ORDERS, fieldsByTile);
        expect(back).not.toHaveProperty('tileTargets');

        const peer = setTileField(rule(), c, PAYMENTS, fieldsByTile);
        expect(peer.tileTargets).toEqual({ c: PAYMENTS });
        expect(setTileField(peer, c, null, fieldsByTile)).not.toHaveProperty(
            'tileTargets',
        );
        expect(
            setTileField(rule({ d: false }), d, null, fieldsByTile),
        ).not.toHaveProperty('tileTargets');
    });

    it('applyFieldToAll puts a peer on every chart that offers it', () => {
        const r = applyFieldToAll(rule(), PAYMENTS, tiles, fieldsByTile);
        expect(r.tileTargets).toEqual({ b: PAYMENTS, c: PAYMENTS });
        expect(getTileField(r, a, fieldsByTile)).toEqual(ORDERS);
    });

    it('applyFieldToAll on the target clears exclusions and peers on its charts', () => {
        const r = applyFieldToAll(
            rule({ a: false, b: PAYMENTS, c: PAYMENTS }),
            ORDERS,
            tiles,
            fieldsByTile,
        );
        expect(r.tileTargets).toEqual({ c: PAYMENTS });
    });

    it('removeFieldFromAll stops filtering the charts using the field', () => {
        const base = rule({ c: PAYMENTS });
        expect(
            removeFieldFromAll(base, 'orders_status', tiles, fieldsByTile)
                .tileTargets,
        ).toEqual({ a: false, b: false, c: PAYMENTS });
        expect(
            removeFieldFromAll(base, 'payments_status', tiles, fieldsByTile),
        ).not.toHaveProperty('tileTargets');
    });

    it('removeField on a peer sends its charts back to the default', () => {
        const r = removeField(
            rule({ a: false, b: PAYMENTS, c: PAYMENTS }),
            'payments_status',
            tiles,
            fieldsByTile,
        );
        expect(r.tileTargets).toEqual({ a: false });
        expect(getTileField(r, b, fieldsByTile)).toEqual(ORDERS);
        expect(getTileField(r, c, fieldsByTile)).toBeNull();
    });

    it('removeField on the target promotes the next field and keeps other charts', () => {
        const before = rule({ c: PAYMENTS });
        const r = removeField(before, 'orders_status', tiles, fieldsByTile);
        expect(r.target).toEqual(PAYMENTS);
        // c keeps payments (now the default); a and b used the removed field
        // so they stop being filtered, even though b offers the new target.
        expect(r.tileTargets).toEqual({ b: false });
        expect(getTileField(r, a, fieldsByTile)).toBeNull();
        expect(getTileField(r, b, fieldsByTile)).toBeNull();
        expect(getTileField(r, c, fieldsByTile)).toEqual(PAYMENTS);
    });

    it('removeField on the target keeps explicit exclusions of other charts', () => {
        const r = removeField(
            rule({ b: PAYMENTS, c: false }),
            'orders_status',
            tiles,
            fieldsByTile,
        );
        expect(r.target).toEqual(PAYMENTS);
        expect(r.tileTargets).toEqual({ c: false });
    });

    it('removeField on the only field is a no-op', () => {
        const only = rule({ a: false });
        expect(removeField(only, 'orders_status', tiles, fieldsByTile)).toBe(
            only,
        );
    });

    it('counts reached charts per tab, ignoring tiles that are not charts', () => {
        expect(
            getTabCounts(rule({ c: PAYMENTS }), tiles, tabs, fieldsByTile),
        ).toEqual({
            t1: { applied: 2, total: 2 },
            t2: { applied: 1, total: 2 },
        });
    });
});
