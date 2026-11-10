import { type DashboardParameterControl } from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
vi.mock('./peers', () => ({
    getEffectiveTabUuid: (
        tile: { tabUuid?: string },
        tabs: { uuid: string }[],
    ) =>
        tabs.some((tab) => tab.uuid === tile.tabUuid)
            ? tile.tabUuid
            : tabs[0]?.uuid,
}));
import {
    clearControlFromTiles,
    getParameterKeyScope,
    getTileParameterOptions,
    setParameterControlTiles,
    setParameterKeyTiles,
} from './parameterPeers';

const defs = {
    'orders.region': { label: 'Region', options: ['EU', 'US'] },
    'payments.region': { label: 'Region', options: ['EU', 'US'] },
    'orders.amount': { label: 'Amount', type: 'number' as const },
};
const base: DashboardParameterControl = {
    id: 'region',
    label: null,
    value: 'EU',
    valueType: { type: 'string', multiple: false },
    parameters: { 'orders.region': 'all', 'payments.region': 'all' },
};
const other: DashboardParameterControl = {
    ...base,
    id: 'other',
    value: 'US',
    parameters: { 'orders.region': { only: [] } },
};
const refs = {
    a: ['orders.region', 'payments.region'],
    b: ['orders.region'],
    c: ['payments.region'],
};
const pick = (
    controls: DashboardParameterControl[],
    controlId: string,
    tileUuid: string,
    key: string | null,
    isMove = false,
) =>
    setParameterControlTiles({
        controls,
        controlId,
        changes: [{ tileUuid, key, isMove }],
        tileParameterReferences: refs,
        definitions: defs,
        userParameterNames: [],
    });
const bulk = (
    controls: DashboardParameterControl[],
    key: string,
    tileUuids: string[],
    included: boolean,
) =>
    setParameterKeyTiles({
        controls,
        controlId: 'region',
        key,
        tileUuids,
        tileParameterReferences: refs,
        included,
        userParameterNames: [],
    });

describe('per-key tile rules', () => {
    it('moves a tile from the default to an explicit owner in one edit', () => {
        const controls = [base, other];
        expect(pick(controls, 'other', 'a', 'orders.region')).toBe(controls);
        const moved = pick(controls, 'other', 'a', 'orders.region', true);
        expect(moved[0].parameters).toEqual({
            'orders.region': { except: ['a'] },
            'payments.region': 'all',
        });
        expect(moved[1].parameters).toEqual({
            'orders.region': { only: ['a'] },
        });
        expect(
            pick(moved, 'other', 'a', null)[0].parameters['orders.region'],
        ).toEqual({ except: ['a'] });
    });
    it('narrows one tile without excluding another tile or its future defaults', () => {
        expect(
            pick([base], 'region', 'a', 'orders.region')[0].parameters,
        ).toEqual({
            'orders.region': 'all',
            'payments.region': { except: ['a'] },
        });
        expect(pick([base], 'region', 'a', null)[0].parameters).toEqual({
            'orders.region': { except: ['a'] },
            'payments.region': { except: ['a'] },
        });
    });
    it('clears and restores eligible tiles one key at a time without stealing', () => {
        const cleared = bulk([base, other], 'orders.region', ['a', 'b'], false);
        expect(cleared[0].parameters['orders.region']).toEqual({
            except: ['a', 'b'],
        });
        expect(cleared[0].parameters['payments.region']).toBe('all');
        const moved = pick(cleared, 'other', 'a', 'orders.region');
        const restored = bulk(moved, 'orders.region', ['a', 'b'], true);
        expect(restored[0].parameters['orders.region']).toEqual({
            except: ['a'],
        });
        expect(restored[1].parameters['orders.region']).toEqual({
            only: ['a'],
        });
        expect(bulk(restored, 'orders.region', ['a'], true)).toEqual(restored);
    });
    it('excludes every current layout tile, including undiscovered tiles, while future tiles follow', () => {
        const result = clearControlFromTiles({
            controls: [base],
            controlId: 'region',
            tileUuids: ['a', 'b', 'unopened'],
        });
        expect(result[0].parameters).toEqual({
            'orders.region': { except: ['a', 'b', 'unopened'] },
            'payments.region': { except: ['a', 'b', 'unopened'] },
        });
    });
    it('adds a compatible new model key only to the chosen tile', () => {
        const single = {
            ...base,
            parameters: { 'orders.region': 'all' as const },
        };
        expect(
            pick([single], 'region', 'a', 'payments.region')[0].parameters,
        ).toEqual({
            'orders.region': { except: ['a'] },
            'payments.region': 'all',
        });
        expect(pick([single], 'region', 'a', 'orders.amount')).toEqual([
            single,
        ]);
    });
    it('adds a key already owned by a different default without adding another default', () => {
        const orders = {
            ...base,
            parameters: { 'orders.region': 'all' as const },
        };
        const payments = {
            ...other,
            parameters: { 'payments.region': 'all' as const },
        };
        const moved = pick(
            [orders, payments],
            'region',
            'a',
            'payments.region',
            true,
        );
        expect(moved[0].parameters).toEqual({
            'orders.region': { except: ['a'] },
            'payments.region': { only: ['a'] },
        });
        expect(moved[1].parameters).toEqual({
            'payments.region': { except: ['a'] },
        });
    });
    it('returns the original array when a requested change is a no-op', () => {
        const controls = [base];
        expect(bulk(controls, 'orders.region', ['a'], true)).toBe(controls);
        expect(pick(controls, 'region', 'b', 'orders.region')).toBe(controls);
    });
    it('scope counts free tiles without proposing to steal assignments', () => {
        const controls = pick(
            [base, other],
            'other',
            'a',
            'orders.region',
            true,
        );
        const cleared = bulk(controls, 'orders.region', ['b'], false);
        expect(
            getParameterKeyScope({
                tileUuids: ['a', 'b', 'c'],
                controls: cleared,
                controlId: 'region',
                key: 'orders.region',
                tileParameterReferences: refs,
                userParameterNames: [],
            }),
        ).toMatchObject({
            possible: 2,
            applied: 0,
            unfiltered: 1,
            replaced: 0,
        });
    });
    it('lists incompatible options but never unknown or system definitions', () => {
        const options = getTileParameterOptions({
            keys: ['orders.amount', 'unknown', 'date_zoom'],
            definitions: { ...defs, date_zoom: { label: 'Zoom' } },
            control: base,
            controls: [base],
            tileUuid: 'a',
            base: defs['orders.region'],
            nameOf: (key) => key,
            userParameterNames: [],
        });
        expect(options).toEqual([
            {
                key: 'orders.amount',
                name: 'orders.amount',
                isCompatible: false,
                setByIds: [],
            },
        ]);
    });
});
