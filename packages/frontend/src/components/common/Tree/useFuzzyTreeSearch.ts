import { useMemo } from 'react';
import useFuzzySearch, {
    type FuzzyMatches,
} from '../../../hooks/useFuzzySearch';
import { type NestableItem } from './types';

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

/** Every proper ancestor path of the given ltree-style paths. */
const getAncestorPaths = (paths: string[]) => {
    const ancestors = new Set<string>();
    for (const path of paths) {
        const segments = path.split('.');
        for (let depth = segments.length - 1; depth > 0; depth -= 1) {
            const ancestorPath = segments.slice(0, depth).join('.');
            // Once an ancestor is known, everything above it is too.
            if (ancestors.has(ancestorPath)) break;
            ancestors.add(ancestorPath);
        }
    }
    return ancestors;
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

        const matchedByPath = new Map(
            matchedItems.map((matchedItem) => [matchedItem.path, matchedItem]),
        );
        const ancestorPaths = getAncestorPaths(
            matchedItems.map((matchedItem) => matchedItem.path),
        );

        return items.flatMap<
            FuzzyFilteredItem<T> | FuzzyFilteredItem<FuzzyMatches<T>>
        >((item) => {
            const matchedItem = matchedByPath.get(item.path);
            if (matchedItem) {
                return [{ ...matchedItem, _fuzzyFilteredBy: 'match' }];
            }
            if (ancestorPaths.has(item.path)) {
                return [{ ...item, _fuzzyFilteredBy: 'parent' }];
            }
            return [];
        });
    }, [matchedItems, items]);

    return filteredItems;
}

export default useFuzzyTreeSearch;
