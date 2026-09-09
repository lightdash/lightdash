import { SearchItemType } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { type OmnibarGroup, type SearchItem } from '../types/searchItem';
import { getFocusedItemIndex, getOmnibarItemKey } from './getFocusedItemIndex';

const chart: SearchItem = {
    type: SearchItemType.CHART,
    title: 'Revenue',
    location: { pathname: '/saved/revenue' },
};
const group = (key: string, items: SearchItem[]): OmnibarGroup => ({
    key,
    label: key,
    items,
    totalCount: items.length,
    collapsed: false,
});

describe('omnibar focus identity', () => {
    it('keeps the same result selected when earlier groups and rows arrive', () => {
        const key = getOmnibarItemKey(chart);
        const initial = [group('charts', [chart])];
        expect(getFocusedItemIndex(initial, key)).toEqual({
            groupIndex: 0,
            itemIndex: 0,
        });
        const updated = [
            group('tables', [
                {
                    ...chart,
                    type: SearchItemType.TABLE,
                    location: { pathname: '/tables/revenue' },
                },
            ]),
            group('charts', [
                { ...chart, location: { pathname: '/saved/other' } },
                chart,
            ]),
        ];
        const index = getFocusedItemIndex(updated, key)!;
        expect(index).toEqual({ groupIndex: 1, itemIndex: 1 });
        expect(updated[index.groupIndex].items[index.itemIndex]).toBe(chart);
    });

    it('distinguishes fields in the same explore by their query parameters', () => {
        const first = {
            ...chart,
            type: SearchItemType.FIELD,
            location: { pathname: '/tables/orders', search: '?field=amount' },
        };
        const second = {
            ...first,
            location: { ...first.location, search: '?field=count' },
        };
        expect(
            getFocusedItemIndex(
                [group('fields', [second, first])],
                getOmnibarItemKey(first),
            ),
        ).toEqual({ groupIndex: 0, itemIndex: 1 });
    });

    it('does not retain an index when the selected result is removed', () => {
        expect(
            getFocusedItemIndex(
                [group('charts', [])],
                getOmnibarItemKey(chart),
            ),
        ).toBeUndefined();
    });
});
