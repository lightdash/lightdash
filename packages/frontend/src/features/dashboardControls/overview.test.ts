import { describe, expect, it } from 'vitest';
import {
    getControlOverview,
    getMappableSummary,
    getShownTabCount,
    getShownTarget,
    getTabCount,
    type OverviewTile,
} from './overview';

const tile = (
    tileUuid: string,
    tabUuid: string,
    options: string[] | null,
    mappedId: string | null = null,
    isBulkMapped = true,
): OverviewTile => ({
    tileUuid,
    tabUuid,
    options,
    mappedId,
    isBulkMapped,
    switch: null,
});

const nameKeys = {
    orders_status: 'string:status',
    payments_status: 'string:status',
    orders_channel: 'string:channel',
};

const tiles: OverviewTile[] = [
    tile('o1', 'orders', ['orders_status', 'orders_channel'], 'orders_status'),
    tile('o2', 'orders', ['orders_status', 'orders_channel']),
    tile('p1', 'payments', ['payments_status']),
    tile('p2', 'payments', ['payments_status', 'orders_status']),
    tile('customers', 'payments', []),
    tile('loading', 'payments', null),
    tile('sql', 'payments', ['sql:status'], null, false),
];

describe('getControlOverview', () => {
    const overview = getControlOverview({
        tiles,
        order: ['orders_status'],
        nameKeys,
        keepsEmptyRows: false,
    });

    it('has one row per mapped field with the tiles still to map', () => {
        expect(overview.rows).toEqual([
            {
                id: 'orders_status',
                tileUuids: ['o1'],
                remainingTileUuids: ['o2', 'p2'],
            },
        ]);
    });

    it('suggests unmapped fields named like a mapped one', () => {
        expect(overview.suggestions).toEqual([
            { id: 'payments_status', tileUuids: ['p1', 'p2'] },
        ]);
    });

    it('lists every other field with its unmapped tile count, SQL columns left out', () => {
        expect(overview.others).toEqual([
            { id: 'payments_status', tileUuids: ['p1', 'p2'] },
            { id: 'orders_channel', tileUuids: ['o2'] },
        ]);
    });

    it('counts tiles mapped out of tiles that could be', () => {
        expect(overview.mappedCount).toBe(1);
        expect(overview.mappableCount).toBe(5);
    });

    it('drops a field with no tile left and keeps the saved order', () => {
        const mapped = [
            tile('p1', 'payments', ['payments_status'], 'payments_status'),
            tile('o1', 'orders', ['orders_status'], 'orders_status'),
        ];
        expect(
            getControlOverview({
                tiles: mapped,
                order: ['orders_status', 'orders_channel', 'payments_status'],
                nameKeys,
                keepsEmptyRows: false,
            }).rows.map((row) => row.id),
        ).toEqual(['orders_status', 'payments_status']);
    });

    it('has nothing to suggest before anything is mapped', () => {
        const none = getControlOverview({
            tiles: tiles.map((t) => ({ ...t, mappedId: null })),
            order: [],
            nameKeys,
            keepsEmptyRows: false,
        });
        expect(none.rows).toEqual([]);
        expect(none.suggestions).toEqual([]);
        expect(none.others.map((option) => option.id)).toEqual([
            'orders_status',
            'orders_channel',
            'payments_status',
        ]);
    });
});

describe('picker order', () => {
    it('lists what most tiles have first, ties in the order the tiles gave', () => {
        const overview = getControlOverview({
            tiles: [
                tile('a', 'orders', ['first', 'second', 'third']),
                tile('b', 'orders', ['second', 'third', 'fourth']),
                tile('c', 'orders', ['third']),
            ],
            order: [],
            nameKeys: {},
            keepsEmptyRows: false,
        });
        expect(overview.others.map((o) => [o.id, o.tileUuids.length])).toEqual([
            ['third', 3],
            ['second', 2],
            ['first', 1],
            ['fourth', 1],
        ]);
    });

    it('gives suggestions the same order', () => {
        const overview = getControlOverview({
            tiles: [
                tile('a', 'orders', ['mapped'], 'mapped'),
                tile('b', 'orders', ['few']),
                tile('c', 'orders', ['many']),
                tile('d', 'orders', ['many']),
            ],
            order: ['mapped'],
            nameKeys: { mapped: 'n', few: 'n', many: 'n' },
            keepsEmptyRows: false,
        });
        expect(overview.suggestions.map((o) => o.id)).toEqual(['many', 'few']);
    });
});

describe('per tab', () => {
    it('counts tiles mapped out of tiles that could be', () => {
        expect(getTabCount(tiles, 'orders')).toEqual({
            mapped: 1,
            mappable: 2,
        });
        expect(getTabCount(tiles, 'payments')).toEqual({
            mapped: 0,
            mappable: 3,
        });
    });

    it('counts the shown tiles each tab holds', () => {
        const shown = ['p1', 'o2', 'p2'];
        expect(getShownTabCount(tiles, 'orders', shown)).toBe(1);
        expect(getShownTabCount(tiles, 'payments', shown)).toBe(2);
        expect(getShownTabCount(tiles, 'empty', shown)).toBe(0);
        expect(getShownTabCount(tiles, 'orders', [])).toBe(0);
    });
});

describe('getShownTarget', () => {
    const tabUuids = ['orders', 'payments', 'empty'];

    it('stays on the current tab when it holds some of the tiles', () => {
        expect(
            getShownTarget({
                tiles,
                tabUuids,
                activeTabUuid: 'payments',
                tileUuids: ['o2', 'p2', 'p1'],
            }),
        ).toEqual({ tabUuid: 'payments', tileUuid: 'p1' });
    });

    it('goes to the first tab, in tab order, that holds some', () => {
        expect(
            getShownTarget({
                tiles,
                tabUuids: ['empty', 'payments', 'orders'],
                activeTabUuid: 'empty',
                tileUuids: ['o2', 'p2'],
            }),
        ).toEqual({ tabUuid: 'payments', tileUuid: 'p2' });
        expect(
            getShownTarget({
                tiles,
                tabUuids,
                activeTabUuid: 'empty',
                tileUuids: ['o2', 'p2'],
            }),
        ).toEqual({ tabUuid: 'orders', tileUuid: 'o2' });
    });

    it('has no tab to go to on a dashboard without tabs', () => {
        const untabbed = tiles.map((t) => ({ ...t, tabUuid: null }));
        expect(
            getShownTarget({
                tiles: untabbed,
                tabUuids: [],
                activeTabUuid: null,
                tileUuids: ['p1', 'o2'],
            }),
        ).toEqual({ tabUuid: null, tileUuid: 'o2' });
    });

    it('has nowhere to go with no tiles', () => {
        expect(
            getShownTarget({
                tiles,
                tabUuids,
                activeTabUuid: 'orders',
                tileUuids: [],
            }),
        ).toBeNull();
    });
});

describe('tiles that are only switched on or off', () => {
    const app = (tileUuid: string, state: 'on' | 'off'): OverviewTile => ({
        tileUuid,
        tabUuid: 'orders',
        options: [],
        mappedId: null,
        isBulkMapped: false,
        switch: state,
    });
    const withApps = [...tiles, app('app-on', 'on'), app('app-off', 'off')];
    const overview = getControlOverview({
        tiles: withApps,
        order: ['orders_status'],
        nameKeys,
        keepsEmptyRows: false,
    });

    it('count as mapped while on, without a row of their own', () => {
        expect(overview.rows.map((row) => row.id)).toEqual(['orders_status']);
        expect(overview.rows[0].tileUuids).toEqual(['o1']);
        expect(overview.mappedCount).toBe(2);
        expect(overview.mappableCount).toBe(7);
    });

    it('have their own line, so the line counts add up to the tiles applied to', () => {
        expect(overview.switchedOnTileUuids).toEqual(['app-on']);
        const onLines =
            overview.rows.reduce((sum, row) => sum + row.tileUuids.length, 0) +
            overview.switchedOnTileUuids.length;
        expect(onLines).toBe(overview.mappedCount);
    });

    it('make "of M" speak of tiles that can use the control', () => {
        expect(
            getMappableSummary({
                tiles: withApps,
                tabUuid: null,
                typeWord: 'text',
                noun: 'field',
            }),
        ).toBe('7 tiles can use this control');
        expect(
            getMappableSummary({
                tiles: withApps,
                tabUuid: 'payments',
                typeWord: 'text',
                noun: 'field',
            }),
        ).toBe('3 tiles on this tab have a text field this control can use');
    });

    it('are never offered a field from the panel', () => {
        expect(overview.rows[0].remainingTileUuids).toEqual(['o2', 'p2']);
        expect(overview.others.flatMap((o) => o.tileUuids)).not.toContain(
            'app-off',
        );
    });

    it('count on their tab', () => {
        expect(getTabCount(withApps, 'orders')).toEqual({
            mapped: 2,
            mappable: 4,
        });
    });
});

describe('getMappableSummary', () => {
    it('says what the tiles have, for the control type and kind', () => {
        expect(
            getMappableSummary({
                tiles,
                tabUuid: null,
                typeWord: 'text',
                noun: 'field',
            }),
        ).toBe('5 tiles have a text field this control can use');
        expect(
            getMappableSummary({
                tiles,
                tabUuid: null,
                typeWord: 'date',
                noun: 'parameter',
            }),
        ).toBe('5 tiles have a date parameter this control can use');
    });

    it('handles one tile', () => {
        expect(
            getMappableSummary({
                tiles: [tile('a', 'orders', ['orders_status'])],
                tabUuid: 'orders',
                typeWord: 'number',
                noun: 'field',
            }),
        ).toBe('1 tile on this tab has a number field this control can use');
    });
});

describe('a parameter no tile takes the control through', () => {
    const emptied = [
        tile('a', 'orders', ['kept'], 'kept'),
        tile('b', 'orders', ['emptied']),
        tile('c', 'orders', ['other']),
    ];

    it('keeps its row at 0 tiles, with the tiles that could take it back', () => {
        const overview = getControlOverview({
            tiles: emptied,
            order: ['kept', 'emptied'],
            nameKeys: {},
            keepsEmptyRows: true,
        });
        expect(overview.rows).toEqual([
            { id: 'kept', tileUuids: ['a'], remainingTileUuids: [] },
            { id: 'emptied', tileUuids: [], remainingTileUuids: ['b'] },
        ]);
        // It is a row, not something to add
        expect(overview.others.map((option) => option.id)).toEqual(['other']);
        expect(overview.mappedCount).toBe(1);
    });

    it('counts 0 tiles when every parameter is emptied', () => {
        const overview = getControlOverview({
            tiles: emptied.map((t) => ({ ...t, mappedId: null })),
            order: ['kept', 'emptied'],
            nameKeys: {},
            keepsEmptyRows: true,
        });
        expect(overview.rows.map((row) => row.tileUuids.length)).toEqual([
            0, 0,
        ]);
        expect(overview.mappedCount).toBe(0);
    });

    it('drops the row where empty rows are not kept', () => {
        const overview = getControlOverview({
            tiles: emptied,
            order: ['kept', 'emptied'],
            nameKeys: {},
            keepsEmptyRows: false,
        });
        expect(overview.rows.map((row) => row.id)).toEqual(['kept']);
    });
});
