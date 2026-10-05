import { describe, expect, it } from 'vitest';
import { type OverviewTile } from './overview';
import { getTabSlot, type ShownLine } from './tabSlot';

const tile = (
    tileUuid: string,
    tabUuid: string,
    mappedId: string | null,
): OverviewTile => ({
    tileUuid,
    tabUuid,
    options: ['status'],
    mappedId,
    isBulkMapped: true,
    switch: null,
});

const tiles = [
    tile('a', 'orders', 'status'),
    tile('b', 'orders', 'status'),
    tile('c', 'orders', null),
    tile('d', 'payments', 'status'),
];
const summary = '3 tiles on this tab have a text field this control can use';
const control = { isLoading: false, tiles, summary };
const line = (tileUuids: string[], isDataApps = false): ShownLine => ({
    name: 'Orders Order status',
    isDataApps,
    tileUuids,
});

describe('getTabSlot', () => {
    it('is empty with no control open', () => {
        expect(
            getTabSlot({ control: null, tabUuid: 'orders', shown: null }),
        ).toEqual({ kind: 'empty' });
        expect(
            getTabSlot({
                control: null,
                tabUuid: 'orders',
                shown: line(['a']),
            }),
        ).toEqual({ kind: 'empty' });
    });

    it('says "N of M" for the tab while a control is open', () => {
        expect(getTabSlot({ control, tabUuid: 'orders', shown: null })).toEqual(
            { kind: 'count', text: '2 of 3', description: summary },
        );
        expect(
            getTabSlot({ control, tabUuid: 'payments', shown: null }),
        ).toMatchObject({ kind: 'count', text: '1 of 1' });
    });

    it('is loading while the control is, whatever was clicked', () => {
        const loading = { ...control, isLoading: true };
        expect(
            getTabSlot({ control: loading, tabUuid: 'orders', shown: null }),
        ).toEqual({ kind: 'loading' });
        expect(
            getTabSlot({
                control: loading,
                tabUuid: 'orders',
                shown: line(['a']),
            }),
        ).toEqual({ kind: 'loading' });
    });

    it('says how many of the clicked line are on the tab', () => {
        const shown = line(['a', 'b', 'd']);
        expect(getTabSlot({ control, tabUuid: 'orders', shown })).toEqual({
            kind: 'shown',
            text: '2',
            count: 2,
            description: '2 tiles on this tab use Orders Order status',
        });
        expect(getTabSlot({ control, tabUuid: 'payments', shown })).toEqual({
            kind: 'shown',
            text: '1',
            count: 1,
            description: '1 tile on this tab uses Orders Order status',
        });
    });

    it('says 0 on a tab with none of them', () => {
        expect(
            getTabSlot({ control, tabUuid: 'payments', shown: line(['a']) }),
        ).toEqual({
            kind: 'shown',
            text: '0',
            count: 0,
            description: '0 tiles on this tab use Orders Order status',
        });
    });

    it('speaks of data app tiles for the "Data apps" line', () => {
        expect(
            getTabSlot({
                control,
                tabUuid: 'orders',
                shown: line(['a', 'b'], true),
            }),
        ).toMatchObject({
            text: '2',
            description: '2 data app tiles on this tab',
        });
        expect(
            getTabSlot({
                control,
                tabUuid: 'payments',
                shown: line(['d'], true),
            }),
        ).toMatchObject({
            text: '1',
            description: '1 data app tile on this tab',
        });
    });
});
