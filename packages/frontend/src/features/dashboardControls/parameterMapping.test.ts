import { type DashboardParameterControl } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    addParameterKey,
    copyParameterControlTileTargets,
    formatTileParameterValue,
    getControlTileKey,
    getDerivedParameterControls,
    getFreeKeysOfType,
    getFreeParameterTypes,
    getIsAppliedOnSave,
    getParameterType,
    getTileParameterOptions,
    hasUnknownParameterReferences,
    haveParameterControlsChanged,
    mapParameterTiles,
    removeParameterKey,
    resolveTileParameterValue,
    unmapParameterTiles,
    type ParameterTile,
} from './parameterMapping';

const tiles: ParameterTile[] = [
    { tileUuid: 'revenue', parameterKeys: ['orders.currency'] },
    { tileUuid: 'revenue-eur', parameterKeys: ['orders.currency'] },
    { tileUuid: 'payments', parameterKeys: ['payments.currency'] },
    { tileUuid: 'refunds', parameterKeys: ['payments.currency'] },
    { tileUuid: 'subs', parameterKeys: [] },
];

const emptyControl: DashboardParameterControl = {
    id: 'currency',
    label: 'Currency',
    parameterKeys: [],
    tileTargets: {},
};

const definitions = {
    'orders.currency': { label: 'Currency', options: ['USD', 'EUR'] },
    'payments.currency': { label: 'Currency', options: ['USD', 'EUR'] },
    'payments.fx_date': { label: 'FX date', type: 'date' as const },
};

const mappedTiles = (
    control: DashboardParameterControl,
): Record<string, string> =>
    Object.fromEntries(
        tiles.flatMap((tile) => {
            const key = getControlTileKey(control, tile);
            return key === null ? [] : [[tile.tileUuid, key]];
        }),
    );

describe('mapParameterTiles', () => {
    it('adds the parameter and takes the other tiles that reference it out', () => {
        const control = mapParameterTiles(
            emptyControl,
            ['revenue'],
            'orders.currency',
            tiles,
        );
        expect(control.parameterKeys).toEqual(['orders.currency']);
        expect(control.tileTargets).toEqual({ 'revenue-eur': false });
    });

    it('maps a tile to a parameter the control already has by dropping its off entry', () => {
        const first = mapParameterTiles(
            emptyControl,
            ['revenue'],
            'orders.currency',
            tiles,
        );
        const control = mapParameterTiles(
            first,
            ['revenue-eur'],
            'orders.currency',
            tiles,
        );
        expect(control.tileTargets).toEqual({});
    });

    it('puts a second parameter under the same control', () => {
        const first = mapParameterTiles(
            emptyControl,
            ['revenue'],
            'orders.currency',
            tiles,
        );
        const control = mapParameterTiles(
            first,
            ['payments'],
            'payments.currency',
            tiles,
        );
        expect(control.parameterKeys).toEqual([
            'orders.currency',
            'payments.currency',
        ]);
        expect(control.tileTargets).toEqual({
            'revenue-eur': false,
            refunds: false,
        });
        expect(mappedTiles(control)).toEqual({
            revenue: 'orders.currency',
            payments: 'payments.currency',
        });
    });
});

describe('addParameterKey', () => {
    it('maps every tile that references a parameter new to the control', () => {
        const control = addParameterKey(emptyControl, 'orders.currency', tiles);
        expect(control.parameterKeys).toEqual(['orders.currency']);
        expect(control.tileTargets).toEqual({});
        expect(mappedTiles(control)).toEqual({
            revenue: 'orders.currency',
            'revenue-eur': 'orders.currency',
        });
    });

    it('maps the tiles left out of a parameter the control already has', () => {
        const one = mapParameterTiles(
            emptyControl,
            ['payments'],
            'payments.currency',
            tiles,
        );
        expect(one.tileTargets).toEqual({ refunds: false });
        const control = addParameterKey(one, 'payments.currency', tiles);
        expect(control.tileTargets).toEqual({});
        expect(Object.keys(mappedTiles(control))).toEqual([
            'payments',
            'refunds',
        ]);
    });

    it('changes nothing when no unmapped tile references the parameter', () => {
        const control = addParameterKey(emptyControl, 'orders.currency', tiles);
        expect(addParameterKey(control, 'orders.currency', tiles)).toBe(
            control,
        );
        expect(addParameterKey(control, 'unknown', tiles)).toBe(control);
    });
});

describe('removeParameterKey', () => {
    it('takes the parameter out with the off entries it no longer needs', () => {
        const both = mapParameterTiles(
            addParameterKey(emptyControl, 'orders.currency', tiles),
            ['payments'],
            'payments.currency',
            tiles,
        );
        expect(both.tileTargets).toEqual({ refunds: false });
        const control = removeParameterKey(both, 'payments.currency', tiles);
        expect(control.parameterKeys).toEqual(['orders.currency']);
        expect(control.tileTargets).toEqual({});
        expect(mappedTiles(control)).toEqual({
            revenue: 'orders.currency',
            'revenue-eur': 'orders.currency',
        });
    });

    it('leaves a control with no parameter when its last one goes', () => {
        const control = removeParameterKey(
            addParameterKey(emptyControl, 'orders.currency', tiles),
            'orders.currency',
            tiles,
        );
        expect(control.parameterKeys).toEqual([]);
        expect(mappedTiles(control)).toEqual({});
    });
});

describe('unmapParameterTiles', () => {
    const mapped = mapParameterTiles(
        mapParameterTiles(emptyControl, ['revenue'], 'orders.currency', tiles),
        ['payments'],
        'payments.currency',
        tiles,
    );

    it('takes the tile out and keeps the parameter while another tile uses it', () => {
        const all = mapParameterTiles(
            mapped,
            ['revenue-eur'],
            'orders.currency',
            tiles,
        );
        const control = unmapParameterTiles(all, ['revenue-eur'], tiles);
        expect(control.tileTargets['revenue-eur']).toBe(false);
        expect(control.parameterKeys).toContain('orders.currency');
        expect(getControlTileKey(control, tiles[1])).toBeNull();
    });

    it('records the last tile of a parameter as taken out and keeps the parameter', () => {
        const control = unmapParameterTiles(mapped, ['payments'], tiles);
        expect(control.parameterKeys).toEqual([
            'orders.currency',
            'payments.currency',
        ]);
        expect(control.tileTargets.payments).toBe(false);
        expect(getControlTileKey(control, tiles[2])).toBeNull();
        // The tile can take the same parameter back
        expect(getTileParameterOptions(control, tiles[2], [])).toEqual([
            'payments.currency',
        ]);
        expect(
            mapParameterTiles(control, ['payments'], 'payments.currency', tiles)
                .tileTargets.payments,
        ).toBeUndefined();
    });

    it('keeps a control whose only tile is taken out, with its parameter', () => {
        const single = mapParameterTiles(
            emptyControl,
            ['payments'],
            'payments.currency',
            tiles,
        );
        const control = unmapParameterTiles(single, ['payments'], tiles);
        expect(control.parameterKeys).toEqual(['payments.currency']);
        expect(control.tileTargets).toEqual({
            payments: false,
            refunds: false,
        });
    });

    it('drops the parameter and its off entries only when it is removed', () => {
        const emptied = unmapParameterTiles(mapped, ['payments'], tiles);
        const control = removeParameterKey(emptied, 'payments.currency', tiles);
        expect(control.parameterKeys).toEqual(['orders.currency']);
        expect(control.tileTargets).toEqual({ 'revenue-eur': false });
    });
});

describe('getDerivedParameterControls', () => {
    it('makes one control per saved or pinned parameter with no tile taken out', () => {
        expect(
            getDerivedParameterControls({
                savedValueKeys: ['orders.currency', 'unknown'],
                pinnedKeys: ['payments.fx_date', 'orders.currency'],
                definitions,
            }),
        ).toEqual([
            {
                id: 'parameter:payments.fx_date',
                label: 'FX date',
                parameterKeys: ['payments.fx_date'],
                tileTargets: {},
            },
            {
                id: 'parameter:orders.currency',
                label: 'Currency',
                parameterKeys: ['orders.currency'],
                tileTargets: {},
            },
            {
                id: 'parameter:unknown',
                label: 'unknown',
                parameterKeys: ['unknown'],
                tileTargets: {},
            },
        ]);
    });
});

describe('parameters a control can take', () => {
    const candidateKeys = Object.keys(definitions);

    it('reads a parameter with no type as text', () => {
        expect(getParameterType(definitions['orders.currency'])).toBe('string');
        expect(getParameterType(definitions['payments.fx_date'])).toBe('date');
        expect(getParameterType(undefined)).toBe('string');
    });

    it('offers every free parameter of the type, whatever its options', () => {
        const differentOptions = {
            ...definitions,
            'payments.currency': { label: 'Currency', options: ['GBP'] },
        };
        expect(
            getFreeKeysOfType({
                controlId: emptyControl.id,
                controls: [],
                definitions: differentOptions,
                candidateKeys,
                type: 'string',
            }),
        ).toEqual(['orders.currency', 'payments.currency']);
        expect(
            getFreeKeysOfType({
                controlId: emptyControl.id,
                controls: [],
                definitions,
                candidateKeys,
                type: 'date',
            }),
        ).toEqual(['payments.fx_date']);
    });

    it('leaves out parameters that belong to another control', () => {
        const other = {
            ...emptyControl,
            id: 'other',
            parameterKeys: ['payments.currency'],
        };
        const own = { ...emptyControl, parameterKeys: ['orders.currency'] };
        expect(
            getFreeKeysOfType({
                controlId: own.id,
                controls: [own, other],
                definitions,
                candidateKeys,
                type: 'string',
            }),
        ).toEqual(['orders.currency']);
    });
});

describe('tile values', () => {
    const base: Parameters<typeof resolveTileParameterValue>[0] = {
        key: 'orders.currency',
        takenOutKeys: [],
        dashboardValues: { 'orders.currency': 'USD' },
        chartSavedValues: { 'orders.currency': 'EUR' },
        definitions: {
            'orders.currency': { label: 'Currency', default: 'GBP' },
        },
    };
    const format = (inputs: Parameters<typeof resolveTileParameterValue>[0]) =>
        formatTileParameterValue(resolveTileParameterValue(inputs));

    it('shows the dashboard value alone', () => {
        expect(format(base)).toBe('USD');
    });

    it('falls back to the default, then the chart value', () => {
        expect(format({ ...base, dashboardValues: {} })).toBe('GBP (default)');
        expect(
            format({
                ...base,
                dashboardValues: {},
                definitions: { 'orders.currency': { label: 'Currency' } },
            }),
        ).toBe('EUR (from chart)');
    });

    it('ignores the dashboard value on a tile taken out', () => {
        expect(format({ ...base, takenOutKeys: ['orders.currency'] })).toBe(
            'EUR (from chart)',
        );
        expect(
            format({
                ...base,
                takenOutKeys: ['orders.currency'],
                chartSavedValues: {},
                definitions: { 'orders.currency': { label: 'Currency' } },
            }),
        ).toBe('Missing parameters');
    });
});

describe('unknown references', () => {
    // The refunds tile is on a tab that has not loaded yet
    const partlyKnown: ParameterTile[] = tiles.map((tile) =>
        tile.tileUuid === 'refunds' ? { ...tile, parameterKeys: null } : tile,
    );
    const mapped = mapParameterTiles(
        emptyControl,
        ['payments'],
        'payments.currency',
        tiles,
    );

    it('tells unknown from none', () => {
        expect(hasUnknownParameterReferences(tiles)).toBe(false);
        expect(hasUnknownParameterReferences(partlyKnown)).toBe(true);
    });

    it('does not map while a tile could reference the parameter unseen', () => {
        expect(
            mapParameterTiles(
                emptyControl,
                ['payments'],
                'payments.currency',
                partlyKnown,
            ),
        ).toBe(emptyControl);
    });

    it('never drops a parameter because of tiles whose references are unknown', () => {
        const all = mapParameterTiles(
            mapped,
            ['refunds'],
            'payments.currency',
            tiles,
        );
        // payments is the only loaded tile that uses the parameter
        expect(unmapParameterTiles(all, ['payments'], partlyKnown)).toBe(all);
    });
});

describe('copyParameterControlTileTargets', () => {
    const control: DashboardParameterControl = {
        ...emptyControl,
        parameterKeys: ['orders.currency'],
        tileTargets: { 'revenue-eur': false },
    };

    it('takes a duplicate out of the controls its source is taken out of', () => {
        expect(
            copyParameterControlTileTargets([control], {
                'revenue-eur-copy': 'revenue-eur',
                'revenue-copy': 'revenue',
            }),
        ).toEqual([
            {
                ...control,
                tileTargets: {
                    'revenue-eur': false,
                    'revenue-eur-copy': false,
                },
            },
        ]);
    });

    it('returns the same list when no source tile is taken out', () => {
        const controls = [control];
        expect(
            copyParameterControlTileTargets(controls, {
                'revenue-copy': 'revenue',
            }),
        ).toBe(controls);
    });
});

describe('haveParameterControlsChanged', () => {
    const saved: DashboardParameterControl[] = [
        { ...emptyControl, parameterKeys: ['orders.currency'] },
    ];

    it('is false with no edits, and for edits equal by value', () => {
        expect(haveParameterControlsChanged(null, saved)).toBe(false);
        expect(
            haveParameterControlsChanged(
                saved.map((control) => ({ ...control })),
                saved,
            ),
        ).toBe(false);
    });

    it('ignores a control that has no parameter', () => {
        expect(
            haveParameterControlsChanged(
                [...saved, { ...emptyControl, id: 'new' }],
                saved,
            ),
        ).toBe(false);
    });

    it('is true after mapping a tile and taking it out, false once the parameter is removed', () => {
        const added = mapParameterTiles(
            { ...emptyControl, id: 'new' },
            ['payments'],
            'payments.currency',
            tiles,
        );
        const removed = unmapParameterTiles(added, ['payments'], tiles);
        expect(haveParameterControlsChanged([...saved, added], saved)).toBe(
            true,
        );
        // The take-out is kept with the parameter: it is a change to save
        expect(haveParameterControlsChanged([...saved, removed], saved)).toBe(
            true,
        );
        expect(
            haveParameterControlsChanged(
                [
                    ...saved,
                    removeParameterKey(removed, 'payments.currency', tiles),
                ],
                saved,
            ),
        ).toBe(false);
    });
});

describe('getFreeParameterTypes', () => {
    const withDate: ParameterTile[] = [
        ...tiles,
        { tileUuid: 'fx', parameterKeys: ['payments.fx_date'] },
    ];

    it('gives the type of every parameter no control sets', () => {
        expect(
            getFreeParameterTypes({
                tiles: withDate,
                controls: [],
                definitions,
            }),
        ).toEqual(['string', 'string', 'date']);
    });

    it('leaves out the parameters a control already sets', () => {
        expect(
            getFreeParameterTypes({
                tiles: withDate,
                controls: [
                    {
                        ...emptyControl,
                        parameterKeys: ['orders.currency', 'payments.currency'],
                    },
                ],
                definitions,
            }),
        ).toEqual(['date']);
    });

    it('is unknown while a tile has not reported its parameters', () => {
        expect(
            getFreeParameterTypes({
                tiles: [...tiles, { tileUuid: 'late', parameterKeys: null }],
                controls: [],
                definitions,
            }),
        ).toBeNull();
    });
});

describe('a tile that references two parameters', () => {
    const both: ParameterTile = {
        tileUuid: 'both',
        parameterKeys: ['orders.currency', 'payments.currency'],
    };
    const withBoth = [...tiles, both];
    const freeKeys = ['orders.currency', 'payments.currency'];

    it('offers every free parameter while the control has none of them', () => {
        expect(getTileParameterOptions(emptyControl, both, freeKeys)).toEqual(
            freeKeys,
        );
    });

    it('offers only the control parameter it uses once it is mapped', () => {
        const control = mapParameterTiles(
            emptyControl,
            ['both'],
            'orders.currency',
            withBoth,
        );
        expect(getTileParameterOptions(control, both, freeKeys)).toEqual([
            'orders.currency',
        ]);
        // The other parameter never joins the control from this tile
        expect(control.parameterKeys).toEqual(['orders.currency']);
    });

    it('offers that same parameter to map it back after it is taken out', () => {
        const control = unmapParameterTiles(
            addParameterKey(emptyControl, 'orders.currency', withBoth),
            ['both'],
            withBoth,
        );
        expect(control.tileTargets).toEqual({ both: false });
        expect(getTileParameterOptions(control, both, freeKeys)).toEqual([
            'orders.currency',
        ]);
    });

    it('still takes every other tile that references a new parameter out', () => {
        const control = mapParameterTiles(
            emptyControl,
            ['both'],
            'payments.currency',
            withBoth,
        );
        expect(control.tileTargets).toEqual({
            payments: false,
            refunds: false,
        });
        // Tiles with only the other parameter are not part of the control
        expect(getTileParameterOptions(control, withBoth[0], freeKeys)).toEqual(
            ['orders.currency'],
        );
    });
});

describe('getIsAppliedOnSave', () => {
    it('is false when the tile is on the side it is saved on', () => {
        [true, false].forEach((side) =>
            [true, false].forEach((hasOwnValue) =>
                expect(
                    getIsAppliedOnSave({
                        isSavedTakenOut: side,
                        isTakenOut: side,
                        hasOwnValue,
                    }),
                ).toBe(false),
            ),
        );
    });

    it('waits for the save to put back a tile whose take-out is saved', () => {
        expect(
            getIsAppliedOnSave({
                isSavedTakenOut: true,
                isTakenOut: false,
                hasOwnValue: true,
            }),
        ).toBe(true);
    });

    it('reaches the query at once for a new take-out with a value to run with', () => {
        expect(
            getIsAppliedOnSave({
                isSavedTakenOut: false,
                isTakenOut: true,
                hasOwnValue: true,
            }),
        ).toBe(false);
    });

    it('waits for the save for a new take-out with no chart value and no default', () => {
        expect(
            getIsAppliedOnSave({
                isSavedTakenOut: false,
                isTakenOut: true,
                hasOwnValue: false,
            }),
        ).toBe(true);
    });
});
