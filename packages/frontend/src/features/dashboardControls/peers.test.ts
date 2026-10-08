import {
    DashboardTileTypes,
    DimensionType,
    FilterOperator,
    type DashboardFieldTarget,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardTab,
    type DashboardTile,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getDefaultTileField,
    getFilterFields,
    getTabCounts,
    getTileField,
    canTileTakeFilter,
    type SqlColumnsByTile,
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

    it('lists fields in order without duplicates', () => {
        expect(
            getFilterFields(rule({ b: PAYMENTS, c: PAYMENTS, d: false })),
        ).toEqual(['orders_status', 'payments_status']);
    });

    it('never lists the empty id of a placeholder', () => {
        const placeholder: DashboardFilterRule = {
            ...rule(),
            target: { fieldId: '', tableName: '' },
            tileTargets: {},
        };
        expect(getFilterFields(placeholder)).toEqual([]);
        expect(
            getFilterFields(
                rule({ b: { fieldId: '', tableName: '' }, c: PAYMENTS }),
            ),
        ).toEqual(['orders_status', 'payments_status']);
    });

    it('counts reached tiles per tab out of every tile on the tab', () => {
        expect(
            getTabCounts(rule({ c: PAYMENTS }), tiles, tabs, fieldsByTile),
        ).toEqual({
            t1: { applied: 2, total: 2 },
            t2: { applied: 1, total: 3 },
        });
    });
});

describe('peers with SQL chart tiles', () => {
    const sqlTile = {
        uuid: 's',
        tabUuid: 't2',
        type: DashboardTileTypes.SQL_CHART,
    } as DashboardTile;
    const sqlColumns: SqlColumnsByTile = {
        s: [{ reference: 'status', type: DimensionType.STRING }],
    };
    const allTiles = [...tiles, sqlTile];
    const SQL_STATUS: DashboardFieldTarget = {
        fieldId: 'status',
        tableName: 'mock_table',
        isSqlColumn: true,
    };

    it('is not filtered on auto and uses its mapped column', () => {
        expect(getTileField(rule(), sqlTile, fieldsByTile, sqlColumns)).toBe(
            null,
        );
        expect(
            getTileField(
                rule({ s: SQL_STATUS }),
                sqlTile,
                fieldsByTile,
                sqlColumns,
            ),
        ).toEqual(SQL_STATUS);
    });

    it('counts a SQL tile in its tab', () => {
        expect(
            getTabCounts(
                rule({ s: SQL_STATUS }),
                allTiles,
                tabs,
                fieldsByTile,
                sqlColumns,
            ).t2,
        ).toEqual({ total: 4, applied: 1 });
    });

    it('counts every tile on the tab, even a SQL tile without a column of the kind', () => {
        expect(
            getTabCounts(rule(), allTiles, tabs, fieldsByTile, { s: [] }).t2
                .total,
        ).toBe(4);
    });
});

describe('peers with data app tiles', () => {
    const appTile = {
        uuid: 'app',
        tabUuid: 't2',
        type: DashboardTileTypes.DATA_APP,
    } as DashboardTile;
    const allTiles = [...tiles, appTile];

    it('is filterable with no fields of its own', () => {
        expect(canTileTakeFilter(appTile, fieldsByTile)).toBe(true);
        expect(canTileTakeFilter(tiles[4], fieldsByTile)).toBe(false);
    });

    it('is on by default and off only when left out, as in the shipped popover', () => {
        expect(getTileField(rule(), appTile, fieldsByTile)).toEqual(ORDERS);
        expect(getTileField(rule({ app: false }), appTile, fieldsByTile)).toBe(
            null,
        );
    });

    it('counts in its tab while on', () => {
        expect(getTabCounts(rule(), allTiles, tabs, fieldsByTile).t2).toEqual({
            applied: 1,
            total: 4,
        });
        expect(
            getTabCounts(rule({ app: false }), allTiles, tabs, fieldsByTile).t2,
        ).toEqual({ applied: 0, total: 4 });
    });
});

describe('a tile mapped to a field it no longer offers', () => {
    const GONE: DashboardFieldTarget = {
        fieldId: 'orders_gone',
        tableName: 'orders',
    };

    it('still counts as filtered, as the shipped popover counts it selected', () => {
        const r = rule({ a: GONE });
        expect(getTabCounts(r, tiles, tabs, fieldsByTile).t1).toEqual({
            applied: 2,
            total: 2,
        });
    });
});
