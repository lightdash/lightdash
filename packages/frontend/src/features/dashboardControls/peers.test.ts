import {
    DashboardTileTypes,
    DimensionType,
    FilterOperator,
    FilterType,
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
    getMissingTileFieldId,
    getSqlColumnsOfKind,
    getTabCounts,
    getTabCountsForField,
    getTabTargetState,
    getTileField,
    isTileChanged,
    isTileFilterable,
    removeField,
    removeFieldFromAll,
    setTabTargets,
    setTileField,
    toSqlColumnTarget,
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

    it('counts reached tiles per tab out of every tile on the tab', () => {
        expect(
            getTabCounts(rule({ c: PAYMENTS }), tiles, tabs, fieldsByTile),
        ).toEqual({
            t1: { applied: 2, total: 2 },
            t2: { applied: 1, total: 3 },
        });
    });

    it('counts tiles per tab that use one field of the filter', () => {
        const r = rule({ c: PAYMENTS });
        expect(
            getTabCountsForField(r, 'orders_status', tiles, tabs, fieldsByTile),
        ).toEqual({
            t1: { applied: 2, total: 2 },
            t2: { applied: 0, total: 3 },
        });
        expect(
            getTabCountsForField(
                r,
                'payments_status',
                tiles,
                tabs,
                fieldsByTile,
            ),
        ).toEqual({
            t1: { applied: 0, total: 2 },
            t2: { applied: 1, total: 3 },
        });
    });

    it('does not count a tile whose filter is disabled', () => {
        expect(
            getTabCountsForField(
                rule({ a: false }),
                'orders_status',
                tiles,
                tabs,
                fieldsByTile,
            ),
        ).toEqual({
            t1: { applied: 1, total: 2 },
            t2: { applied: 0, total: 3 },
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
    const SQL_STATUS = toSqlColumnTarget('status');

    it('keeps only columns of the filter kind', () => {
        const columns = [
            { reference: 'status', type: DimensionType.STRING },
            { reference: 'amount', type: DimensionType.NUMBER },
        ];
        expect(getSqlColumnsOfKind(columns, FilterType.STRING)).toEqual([
            columns[0],
        ]);
        expect(getSqlColumnsOfKind(columns, FilterType.DATE)).toEqual([]);
    });

    it('writes the isSqlColumn target shape', () => {
        expect(SQL_STATUS).toEqual({
            fieldId: 'status',
            tableName: 'mock_table',
            isSqlColumn: true,
        });
    });

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

    it('setTileField keeps the SQL entry and clears it back to auto', () => {
        const mapped = setTileField(
            rule(),
            sqlTile,
            SQL_STATUS,
            fieldsByTile,
            sqlColumns,
        );
        expect(mapped.tileTargets).toEqual({ s: SQL_STATUS });
        const cleared = setTileField(
            mapped,
            sqlTile,
            null,
            fieldsByTile,
            sqlColumns,
        );
        expect(cleared.tileTargets).toBeUndefined();
    });

    it('counts a SQL tile among possible and applied', () => {
        expect(
            getFieldCount(
                rule({ s: SQL_STATUS }),
                'status',
                allTiles,
                fieldsByTile,
                sqlColumns,
            ),
            // a SQL column is reached per tile, so it is never "possible" as a field
        ).toEqual({ possible: 0, applied: 1 });
        expect(
            getFieldCount(rule(), 'status', allTiles, fieldsByTile, sqlColumns)
                .applied,
        ).toBe(0);
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
        expect(
            getTabCountsForField(
                rule({ s: SQL_STATUS }),
                'status',
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
        expect(isTileFilterable(appTile, fieldsByTile)).toBe(true);
        expect(isTileFilterable(tiles[4], fieldsByTile)).toBe(false);
    });

    it('is on by default and off only when left out, as in the shipped popover', () => {
        expect(getTileField(rule(), appTile, fieldsByTile)).toEqual(ORDERS);
        expect(getTileField(rule({ app: false }), appTile, fieldsByTile)).toBe(
            null,
        );
    });

    it('writes false to switch it off and no entry to switch it on', () => {
        const off = setTileField(rule(), appTile, null, fieldsByTile);
        expect(off.tileTargets).toEqual({ app: false });
        const on = setTileField(off, appTile, off.target, fieldsByTile);
        expect(on.tileTargets).toBeUndefined();
    });

    it('counts in its tab while on, and never as a tile on a field', () => {
        expect(getTabCounts(rule(), allTiles, tabs, fieldsByTile).t2).toEqual({
            applied: 1,
            total: 4,
        });
        expect(
            getTabCounts(rule({ app: false }), allTiles, tabs, fieldsByTile).t2,
        ).toEqual({ applied: 0, total: 4 });
        expect(
            getFieldCount(rule(), 'orders_status', allTiles, fieldsByTile),
        ).toEqual({ applied: 2, possible: 2 });
        expect(
            getTabCountsForField(
                rule(),
                'orders_status',
                allTiles,
                tabs,
                fieldsByTile,
            ).t2,
        ).toEqual({ applied: 0, total: 4 });
    });

    it('stays as it is when a field is cleared from its tiles or removed', () => {
        expect(
            removeFieldFromAll(rule(), 'orders_status', allTiles, fieldsByTile)
                .tileTargets,
        ).toEqual({ a: false, b: false });

        const on = removeField(
            rule({ c: PAYMENTS }),
            'orders_status',
            allTiles,
            fieldsByTile,
        );
        expect(on.target).toEqual(PAYMENTS);
        expect(getTileField(on, appTile, fieldsByTile)).toEqual(PAYMENTS);

        const off = removeField(
            rule({ c: PAYMENTS, app: false }),
            'orders_status',
            allTiles,
            fieldsByTile,
        );
        expect(getTileField(off, appTile, fieldsByTile)).toBe(null);
    });

    it('follows its tab when the tab is switched on or off', () => {
        const off = setTabTargets(rule(), 't2', false, allTiles, fieldsByTile);
        expect(off.tileTargets).toEqual({ app: false });
        const on = setTabTargets(off, 't2', true, allTiles, fieldsByTile);
        expect(on.tileTargets).toBeUndefined();
    });
});

describe('a tile mapped to a field it no longer offers', () => {
    const GONE: DashboardFieldTarget = {
        fieldId: 'orders_gone',
        tableName: 'orders',
    };

    it('names the missing field of a mapped tile only', () => {
        expect(getMissingTileFieldId(rule({ a: GONE }), a, fieldsByTile)).toBe(
            'orders_gone',
        );
        expect(
            getMissingTileFieldId(rule({ b: PAYMENTS }), b, fieldsByTile),
        ).toBe(null);
        // On the default rule or left out, nothing is mapped
        expect(getMissingTileFieldId(rule(), c, fieldsByTile)).toBe(null);
        expect(getMissingTileFieldId(rule({ a: false }), a, fieldsByTile)).toBe(
            null,
        );
    });

    it('says nothing while the fields of the tile are not known', () => {
        expect(getMissingTileFieldId(rule({ a: GONE }), a, undefined)).toBe(
            null,
        );
        expect(getMissingTileFieldId(rule({ a: GONE }), a, {})).toBe(null);
    });

    it('names a column a SQL chart tile no longer returns', () => {
        const sqlTile = {
            uuid: 's',
            tabUuid: 't2',
            type: DashboardTileTypes.SQL_CHART,
        } as DashboardTile;
        const sqlColumns: SqlColumnsByTile = {
            s: [{ reference: 'status', type: DimensionType.STRING }],
        };
        expect(
            getMissingTileFieldId(
                rule({ s: toSqlColumnTarget('old_status') }),
                sqlTile,
                fieldsByTile,
                sqlColumns,
            ),
        ).toBe('old_status');
        expect(
            getMissingTileFieldId(
                rule({ s: toSqlColumnTarget('status') }),
                sqlTile,
                fieldsByTile,
                sqlColumns,
            ),
        ).toBe(null);
    });

    it('still counts as filtered, as the shipped popover counts it selected', () => {
        const r = rule({ a: GONE });
        expect(getTabCounts(r, tiles, tabs, fieldsByTile).t1).toEqual({
            applied: 2,
            total: 2,
        });
        expect(getTabTargetState(r, 't1', tiles, fieldsByTile).checked).toBe(
            'all',
        );
    });
});

describe('switching a whole tab on or off', () => {
    it('leaves every tile on the tab out, and no tile on another tab', () => {
        const next = setTabTargets(
            rule({ c: PAYMENTS }),
            't1',
            false,
            tiles,
            fieldsByTile,
        );
        expect(next.tileTargets).toEqual({ a: false, b: false, c: PAYMENTS });
    });

    it('writes nothing for a tile the filter was not on', () => {
        const next = setTabTargets(rule(), 't2', false, tiles, fieldsByTile);
        expect(next.tileTargets).toBeUndefined();
    });

    it("gives each unfiltered tile the filter's first field when it offers it", () => {
        const next = setTabTargets(
            rule({ a: false, b: false, c: PAYMENTS }),
            't1',
            true,
            tiles,
            fieldsByTile,
        );
        expect(next.tileTargets).toEqual({ c: PAYMENTS });
    });

    it('keeps the field of a tile that is already filtered', () => {
        const next = setTabTargets(
            rule({ a: false, b: PAYMENTS, c: PAYMENTS }),
            't1',
            true,
            tiles,
            fieldsByTile,
        );
        expect(next.tileTargets).toEqual({ b: PAYMENTS, c: PAYMENTS });
    });

    it('falls back to another field of the filter that the tile offers', () => {
        const next = setTabTargets(
            rule({ b: PAYMENTS, c: false }),
            't2',
            true,
            tiles,
            fieldsByTile,
        );
        expect(next.tileTargets).toEqual({ b: PAYMENTS, c: PAYMENTS });
    });

    it('never adds a field the filter does not have', () => {
        // c offers payments_status, which is not a field of this filter
        const next = setTabTargets(rule(), 't2', true, tiles, fieldsByTile);
        expect(next).toEqual(rule());
    });

    it('picks among several fields in the shipped order: same name before same type', () => {
        const typed = (table: string, name: string) =>
            ({
                table,
                name,
                type: DimensionType.STRING,
            }) as DashboardFilterableField;
        const typedFields: Record<string, DashboardFilterableField[]> = {
            a: [typed('orders', 'status')],
            b: [typed('users', 'city'), typed('payments', 'status')],
            c: [typed('users', 'city'), typed('payments', 'status')],
            d: [typed('users', 'city')],
        };
        const CITY: DashboardFieldTarget = {
            fieldId: 'users_city',
            tableName: 'users',
        };
        const next = setTabTargets(
            rule({ b: CITY, c: false, d: PAYMENTS }),
            't2',
            true,
            tiles,
            typedFields,
        );
        expect(next.tileTargets?.c).toEqual(PAYMENTS);
    });

    it('leaves a SQL chart tile alone when switching on and out when switching off', () => {
        const sqlTile = {
            uuid: 's',
            tabUuid: 't2',
            type: DashboardTileTypes.SQL_CHART,
        } as DashboardTile;
        const sqlColumns: SqlColumnsByTile = {
            s: [{ reference: 'status', type: DimensionType.STRING }],
        };
        const withSql = [...tiles, sqlTile];
        expect(
            setTabTargets(
                rule(),
                't2',
                true,
                withSql,
                fieldsByTile,
                sqlColumns,
            ),
        ).toEqual(rule());

        const mapped = rule({ s: toSqlColumnTarget('status') });
        expect(
            setTabTargets(mapped, 't2', true, withSql, fieldsByTile, sqlColumns)
                .tileTargets,
        ).toEqual(mapped.tileTargets);
        const off = setTabTargets(
            mapped,
            't2',
            false,
            withSql,
            fieldsByTile,
            sqlColumns,
        );
        expect(getTileField(off, sqlTile, fieldsByTile, sqlColumns)).toBe(null);
        // It can still be reached, so the tab is not fully filtered
        expect(
            getTabTargetState(rule(), 't2', withSql, fieldsByTile, sqlColumns),
        ).toEqual({ checked: 'none', canSwitchOn: false });
    });

    it('reports all, some or none of the tiles the filter can reach', () => {
        expect(getTabTargetState(rule(), 't1', tiles, fieldsByTile)).toEqual({
            checked: 'all',
            canSwitchOn: false,
        });
        expect(
            getTabTargetState(rule({ a: false }), 't1', tiles, fieldsByTile),
        ).toEqual({ checked: 'some', canSwitchOn: true });
        expect(
            getTabTargetState(
                rule({ a: false, b: false }),
                't1',
                tiles,
                fieldsByTile,
            ),
        ).toEqual({ checked: 'none', canSwitchOn: true });
    });

    it('ignores tiles the filter could only reach through a new field', () => {
        // t2: c offers another field of the kind, d and e offer nothing
        expect(getTabTargetState(rule(), 't2', tiles, fieldsByTile)).toEqual({
            checked: 'none',
            canSwitchOn: false,
        });
        expect(
            getTabTargetState(rule({ c: PAYMENTS }), 't2', tiles, fieldsByTile),
        ).toEqual({ checked: 'all', canSwitchOn: false });
    });
});
