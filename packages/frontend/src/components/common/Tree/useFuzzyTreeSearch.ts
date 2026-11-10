import { useMemo } from 'react';
import useFuzzySearch, {
    type FuzzyMatches,
} from '../../../hooks/useFuzzySearch';
import { type NestableItem } from './types';
import { getAncestorUuids, getParentUuids } from './utils';

export type FuzzyFilteredItem<T> = T & {
    _fuzzyFilteredBy: 'match' | 'parent';
};

// Module-level constants keep the Fuse index memoized across renders.
const FUZZY_SEARCH_KEYS = ['name'];
const FUZZY_SEARCH_OPTIONS = {
    threshold: 0.3,
    shouldSort: false,
    includeMatches: true,
};

function useFuzzyTreeSearch<T extends NestableItem>(items: T[], query: string) {
    const matchedItems = useFuzzySearch(
        items,
        FUZZY_SEARCH_KEYS,
        query,
        FUZZY_SEARCH_OPTIONS,
    );

    const filteredItems = useMemo(() => {
        if (!matchedItems) return;

        const matchedByUuid = new Map(
            matchedItems.map((matchedItem) => [matchedItem.uuid, matchedItem]),
        );
        const parentUuids = getParentUuids(items);
        const ancestorUuids = new Set(
            matchedItems.flatMap((matchedItem) =>
                getAncestorUuids(parentUuids, matchedItem.uuid).slice(0, -1),
            ),
        );

        return items.flatMap<
            FuzzyFilteredItem<T> | FuzzyFilteredItem<FuzzyMatches<T>>
        >((item) => {
            const matchedItem = matchedByUuid.get(item.uuid);
            if (matchedItem) {
                return [{ ...matchedItem, _fuzzyFilteredBy: 'match' }];
            }
            if (ancestorUuids.has(item.uuid)) {
                return [{ ...item, _fuzzyFilteredBy: 'parent' }];
            }
            return [];
        });
    }, [matchedItems, items]);

    return filteredItems;
}

export default useFuzzyTreeSearch;
