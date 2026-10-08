import {
    FilterType,
    type DashboardParameterControl,
    type DashboardTab,
    type DashboardTile,
    type ParameterDefinitions,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    addControlKey,
    addControlKeyFromTile,
    getControlCount,
    getControlKeysOnTile,
    getControlFreeParameterKeys,
    getControlKeysSetOnTile,
    getControlledParameterKeys,
    getControlTabCounts,
    getControlTabCountsForKey,
    getControlTileTarget,
    getControlValue,
    getFreeParameterKeys,
    getKeyCount,
    getParameterKind,
    getParameterLabel,
    removeControlKey,
    setControlTileTarget,
} from './parameterControls';

const tile = (uuid: string, tabUuid: string) =>
    ({ uuid, tabUuid }) as unknown as DashboardTile;

// a references both keys, b one, c an unrelated one, d nothing
const tileA = tile('a', 't1');
const tileB = tile('b', 't1');
const tileC = tile('c', 't2');
const tileD = tile('d', 't1');
const tiles = [tileA, tileB, tileC, tileD];
const tabs = [{ uuid: 't1' }, { uuid: 't2' }] as unknown as DashboardTab[];
const refs = { a: ['country', 'region'], b: ['country'], c: ['other'] };

const control: DashboardParameterControl = {
    id: 'ctl',
    label: 'Place',
    parameterKeys: ['region', 'country'],
    tileTargets: {},
};

const withTargets = (
    tileTargets: DashboardParameterControl['tileTargets'],
): DashboardParameterControl => ({ ...control, tileTargets });

const definitions: ParameterDefinitions = {
    region: { label: 'Region' },
    country: { label: 'Country', type: 'string' },
    other: { label: 'Other' },
    amount: { label: 'Amount', type: 'number' },
    since: { label: 'Since', type: 'date' },
    unused: { label: 'Unused' },
};

describe('getParameterKind', () => {
    it('maps number and date, and falls back to string', () => {
        expect(getParameterKind(definitions.amount)).toBe(FilterType.NUMBER);
        expect(getParameterKind(definitions.since)).toBe(FilterType.DATE);
        expect(getParameterKind(definitions.country)).toBe(FilterType.STRING);
        expect(getParameterKind(definitions.region)).toBe(FilterType.STRING);
    });
});

describe('getParameterLabel', () => {
    it('uses the definition label, else the key', () => {
        expect(getParameterLabel('region', definitions)).toBe('Region');
        expect(getParameterLabel('missing', definitions)).toBe('missing');
    });
});

describe('getControlKeysOnTile', () => {
    it('lists the referenced keys in control order', () => {
        expect(getControlKeysOnTile(control, tileA, refs)).toEqual([
            'region',
            'country',
        ]);
        expect(getControlKeysOnTile(control, tileB, refs)).toEqual(['country']);
        expect(getControlKeysOnTile(control, tileC, refs)).toEqual([]);
        expect(getControlKeysOnTile(control, tileD, refs)).toEqual([]);
    });
    it('ignores the tile target', () => {
        expect(
            getControlKeysOnTile(withTargets({ a: false }), tileA, refs),
        ).toEqual(['region', 'country']);
    });
});

describe('getControlKeysSetOnTile', () => {
    it('sets every referenced key when the tile has no entry', () => {
        expect(getControlKeysSetOnTile(control, tileA, refs)).toEqual([
            'region',
            'country',
        ]);
        expect(getControlKeysSetOnTile(control, tileB, refs)).toEqual([
            'country',
        ]);
    });
    it('narrows to the one key the entry names', () => {
        expect(
            getControlKeysSetOnTile(withTargets({ a: 'country' }), tileA, refs),
        ).toEqual(['country']);
    });
    it('sets nothing when the tile is switched off', () => {
        expect(
            getControlKeysSetOnTile(withTargets({ a: false }), tileA, refs),
        ).toEqual([]);
    });
    it('treats an entry naming a key the control lost as no entry', () => {
        expect(
            getControlKeysSetOnTile(withTargets({ a: 'gone' }), tileA, refs),
        ).toEqual(['region', 'country']);
    });
    it('sets nothing when the entry names a key the tile does not reference', () => {
        expect(
            getControlKeysSetOnTile(withTargets({ b: 'region' }), tileB, refs),
        ).toEqual([]);
    });
    it('sets nothing on a tile that references none of the keys', () => {
        expect(getControlKeysSetOnTile(control, tileC, refs)).toEqual([]);
    });
});

describe('getControlTileTarget', () => {
    it('reads the three states and a stale entry', () => {
        const targeted = withTargets({ a: 'country', b: false, c: 'gone' });
        expect(getControlTileTarget(targeted, 'a')).toBe('country');
        expect(getControlTileTarget(targeted, 'b')).toBe(false);
        expect(getControlTileTarget(targeted, 'c')).toBeNull();
        expect(getControlTileTarget(targeted, 'd')).toBeNull();
    });
});

describe('setControlTileTarget', () => {
    it('writes a key and false, and reads them back', () => {
        const narrowed = setControlTileTarget(control, 'a', 'country');
        expect(narrowed.tileTargets).toEqual({ a: 'country' });
        expect(getControlTileTarget(narrowed, 'a')).toBe('country');

        const off = setControlTileTarget(narrowed, 'a', false);
        expect(off.tileTargets).toEqual({ a: false });
        expect(getControlTileTarget(off, 'a')).toBe(false);
    });
    it('removes the entry for all and keeps the others', () => {
        const next = setControlTileTarget(
            withTargets({ a: 'country', b: false }),
            'a',
            null,
        );
        expect(next.tileTargets).toEqual({ b: false });
        expect(getControlTileTarget(next, 'a')).toBeNull();
    });
    it('does not mutate the control', () => {
        const original = withTargets({ a: 'country' });
        setControlTileTarget(original, 'a', false);
        setControlTileTarget(original, 'a', null);
        expect(original.tileTargets).toEqual({ a: 'country' });
    });
});

describe('addControlKey', () => {
    it('appends a new key without mutating', () => {
        const next = addControlKey(control, 'other');
        expect(next.parameterKeys).toEqual(['region', 'country', 'other']);
        expect(control.parameterKeys).toEqual(['region', 'country']);
    });
    it('is a no-op for a key the control holds', () => {
        expect(addControlKey(control, 'region')).toEqual(control);
    });
});

describe('removeControlKey', () => {
    it('drops the key and the entries naming it, and keeps the rest', () => {
        const original = withTargets({ a: 'country', b: false, c: 'region' });
        const next = removeControlKey(original, 'country');
        expect(next.parameterKeys).toEqual(['region']);
        expect(next.tileTargets).toEqual({ b: false, c: 'region' });
        expect(original.parameterKeys).toEqual(['region', 'country']);
        expect(original.tileTargets).toEqual({
            a: 'country',
            b: false,
            c: 'region',
        });
    });
});

describe('getKeyCount', () => {
    it('counts both keys as applied on a tile with no entry', () => {
        expect(getKeyCount(control, 'region', tiles, refs)).toEqual({
            possible: 1,
            applied: 1,
        });
        expect(getKeyCount(control, 'country', tiles, refs)).toEqual({
            possible: 2,
            applied: 2,
        });
    });
    it('counts only the named key on a narrowed tile', () => {
        const narrowed = withTargets({ a: 'country' });
        expect(getKeyCount(narrowed, 'region', tiles, refs)).toEqual({
            possible: 1,
            applied: 0,
        });
        expect(getKeyCount(narrowed, 'country', tiles, refs)).toEqual({
            possible: 2,
            applied: 2,
        });
    });
    it('counts neither key on a tile that is switched off', () => {
        const off = withTargets({ a: false });
        expect(getKeyCount(off, 'region', tiles, refs)).toEqual({
            possible: 1,
            applied: 0,
        });
        expect(getKeyCount(off, 'country', tiles, refs)).toEqual({
            possible: 2,
            applied: 1,
        });
    });
});

describe('getControlCount', () => {
    it('counts tiles referencing any key and tiles set by at least one', () => {
        expect(getControlCount(control, tiles, refs)).toEqual({
            possible: 2,
            applied: 2,
        });
        expect(
            getControlCount(withTargets({ a: 'country' }), tiles, refs),
        ).toEqual({ possible: 2, applied: 2 });
        expect(getControlCount(withTargets({ a: false }), tiles, refs)).toEqual(
            { possible: 2, applied: 1 },
        );
    });
});

describe('getControlTabCounts', () => {
    it('totals every tile on the tab, including ones referencing nothing', () => {
        expect(getControlTabCounts(control, tiles, tabs, refs)).toEqual({
            t1: { applied: 2, total: 3 },
            t2: { applied: 0, total: 1 },
        });
    });
    it('leaves out tiles that are switched off', () => {
        expect(
            getControlTabCounts(withTargets({ a: false }), tiles, tabs, refs),
        ).toEqual({
            t1: { applied: 1, total: 3 },
            t2: { applied: 0, total: 1 },
        });
    });
});

describe('getControlTabCountsForKey', () => {
    it('counts the tiles the key is set on against every tile', () => {
        expect(
            getControlTabCountsForKey(control, 'region', tiles, tabs, refs),
        ).toEqual({
            t1: { applied: 1, total: 3 },
            t2: { applied: 0, total: 1 },
        });
        expect(
            getControlTabCountsForKey(
                withTargets({ a: 'country' }),
                'region',
                tiles,
                tabs,
                refs,
            ),
        ).toEqual({
            t1: { applied: 0, total: 3 },
            t2: { applied: 0, total: 1 },
        });
    });
});

describe('getControlledParameterKeys', () => {
    it('lists every key held by a control', () => {
        expect(
            getControlledParameterKeys([
                control,
                { ...control, id: 'two', parameterKeys: ['other'] },
            ]),
        ).toEqual(['region', 'country', 'other']);
        expect(getControlledParameterKeys([])).toEqual([]);
    });
});

describe('getFreeParameterKeys', () => {
    const allRefs = { ...refs, d: ['amount', 'since'] };
    it('excludes taken keys, other kinds and unreferenced keys', () => {
        expect(
            getFreeParameterKeys(
                FilterType.STRING,
                [control],
                definitions,
                allRefs,
            ),
        ).toEqual(['other']);
        expect(
            getFreeParameterKeys(FilterType.NUMBER, [], definitions, allRefs),
        ).toEqual(['amount']);
        expect(
            getFreeParameterKeys(FilterType.DATE, [], definitions, allRefs),
        ).toEqual(['since']);
    });
    it('lists each key once and skips keys with no definition', () => {
        expect(
            getFreeParameterKeys(FilterType.STRING, [], definitions, {
                ...allRefs,
                e: ['country', 'undefined-key'],
            }),
        ).toEqual(['country', 'region', 'other']);
    });
});

describe('getControlValue', () => {
    it('returns the value of the first key', () => {
        expect(getControlValue(control, { region: 'EU', country: 'PT' })).toBe(
            'EU',
        );
        expect(getControlValue(control, { country: 'PT' })).toBeUndefined();
        expect(
            getControlValue(
                { ...control, parameterKeys: [] },
                { region: 'EU' },
            ),
        ).toBeUndefined();
    });
});

describe('getControlFreeParameterKeys', () => {
    const allRefs = { ...refs, d: ['amount', 'since'] };
    it("lists the free parameters of the kind of the control's first parameter", () => {
        expect(
            getControlFreeParameterKeys(control, [], definitions, allRefs),
        ).toEqual(['other']);
        expect(
            getControlFreeParameterKeys(
                { ...control, parameterKeys: ['amount'] },
                [control],
                definitions,
                allRefs,
            ),
        ).toEqual([]);
    });
    it('lists nothing for a control with no known parameter', () => {
        expect(
            getControlFreeParameterKeys(
                { ...control, parameterKeys: [] },
                [],
                definitions,
                allRefs,
            ),
        ).toEqual([]);
    });
});

describe('addControlKeyFromTile', () => {
    // a uses both parameters of the control, b one, c none; all use "other"
    const withOther = {
        a: ['country', 'region', 'other'],
        b: ['country', 'other'],
        c: ['other'],
        d: ['other'],
        e: ['country'],
    };
    const setOn = (next: DashboardParameterControl, uuid: string) =>
        getControlKeysSetOnTile(next, tile(uuid, 't1'), withOther);

    it('adds the key and narrows the tile to it', () => {
        const next = addControlKeyFromTile(control, 'other', 'd', {
            d: ['other'],
        });
        expect(next.parameterKeys).toEqual(['region', 'country', 'other']);
        expect(next.tileTargets).toEqual({ d: 'other' });
    });

    it('pins the other tiles that use the key to what set them before', () => {
        const next = addControlKeyFromTile(control, 'other', 'd', withOther);
        expect(next.tileTargets).toEqual({
            // One parameter of the control: narrowed to it
            b: 'country',
            // None: switched off
            c: false,
            d: 'other',
        });
        expect(setOn(next, 'b')).toEqual(setOn(control, 'b'));
        expect(setOn(next, 'c')).toEqual(setOn(control, 'c'));
        expect(setOn(next, 'e')).toEqual(setOn(control, 'e'));
        expect(setOn(next, 'd')).toEqual(['other']);
    });

    it('cannot pin a tile on several parameters of the control, which takes the new one too', () => {
        const next = addControlKeyFromTile(control, 'other', 'd', withOther);
        expect(next.tileTargets.a).toBeUndefined();
        expect(setOn(next, 'a')).toEqual(['region', 'country', 'other']);
    });

    it('keeps the entries the other tiles already had', () => {
        const next = addControlKeyFromTile(
            withTargets({ a: 'region', b: false, c: 'gone' }),
            'other',
            'd',
            withOther,
        );
        expect(next.tileTargets).toEqual({
            a: 'region',
            b: false,
            // A target the control no longer holds counted as no entry
            c: false,
            d: 'other',
        });
    });

    it('only narrows the tile when the control already holds the key', () => {
        expect(
            addControlKeyFromTile(control, 'country', 'a', withOther),
        ).toEqual(withTargets({ a: 'country' }));
    });
});
