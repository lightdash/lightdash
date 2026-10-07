import { FilterType, type DashboardTile } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    applyKeyToAll,
    clearKeyFromAll,
    getControlTabCounts,
    getControlTabCountsForKey,
    getControlTileKey,
    getKeyCount,
    isControlTileChanged,
    removeKey,
    setControlTileKey,
    type ParameterControl,
} from './parameterControls';

const tile = (uuid: string, tabUuid: string) =>
    ({ uuid, tabUuid }) as unknown as DashboardTile;

const tiles = [tile('a', 't1'), tile('b', 't1'), tile('c', 't2')];
const tabs = [{ uuid: 't1' }, { uuid: 't2' }] as never[];
const refs = { a: ['region', 'country'], b: ['country'], c: ['other'] };

const control: ParameterControl = {
    id: 'ctl',
    label: 'Place',
    kind: FilterType.STRING,
    parameterKeys: ['region', 'country'],
    tileTargets: {},
};

describe('getControlTileKey', () => {
    it('defaults to the first control key the chart references', () => {
        expect(getControlTileKey(control, tiles[0], refs)).toBe('region');
        expect(getControlTileKey(control, tiles[1], refs)).toBe('country');
        expect(getControlTileKey(control, tiles[2], refs)).toBeNull();
    });
    it('honours a pinned key and a false target', () => {
        const pinned: ParameterControl = {
            ...control,
            tileTargets: { a: 'country', b: false },
        };
        expect(getControlTileKey(pinned, tiles[0], refs)).toBe('country');
        expect(getControlTileKey(pinned, tiles[1], refs)).toBeNull();
        expect(isControlTileChanged(pinned, tiles[0], refs)).toBe(true);
        expect(isControlTileChanged(control, tiles[0], refs)).toBe(false);
    });
    it('ignores a pinned key the chart does not reference', () => {
        const pinned = { ...control, tileTargets: { b: 'region' } };
        expect(getControlTileKey(pinned, tiles[1], refs)).toBe('country');
    });
});

describe('setControlTileKey', () => {
    it('drops the entry when the key equals auto', () => {
        const next = setControlTileKey(
            { ...control, tileTargets: { a: 'country' } },
            tiles[0],
            'region',
            refs,
        );
        expect(next.tileTargets).toEqual({});
    });
    it('writes false for null', () => {
        expect(
            setControlTileKey(control, tiles[0], null, refs).tileTargets,
        ).toEqual({ a: false });
    });
});

describe('apply, clear and remove', () => {
    it('applyKeyToAll pins every chart referencing the key', () => {
        const next = applyKeyToAll(
            { ...control, tileTargets: { b: false } },
            'country',
            tiles,
            refs,
        );
        expect(next.tileTargets).toEqual({ a: 'country' });
    });
    it('clearKeyFromAll unsets charts set by the key', () => {
        const next = clearKeyFromAll(control, 'country', tiles, refs);
        expect(next.tileTargets).toEqual({ b: false });
        expect(getControlTileKey(next, tiles[0], refs)).toBe('region');
    });
    it('removeKey falls charts back to auto', () => {
        const next = removeKey(
            { ...control, tileTargets: { a: 'country' } },
            'region',
            tiles,
            refs,
        );
        expect(next.parameterKeys).toEqual(['country']);
        expect(next.tileTargets).toEqual({});
        expect(getControlTileKey(next, tiles[0], refs)).toBe('country');
    });
});

describe('counts', () => {
    it('getKeyCount counts applied and possible charts', () => {
        expect(getKeyCount(control, 'country', tiles, refs)).toEqual({
            applied: 1,
            possible: 2,
        });
    });
    it('getControlTabCounts counts per tab', () => {
        expect(getControlTabCounts(control, tiles, tabs, refs)).toEqual({
            t1: { applied: 2, total: 2 },
            t2: { applied: 0, total: 0 },
        });
        expect(
            getControlTabCountsForKey(control, 'country', tiles, tabs, refs),
        ).toEqual({
            t1: { applied: 1, total: 2 },
            t2: { applied: 0, total: 0 },
        });
    });
});
